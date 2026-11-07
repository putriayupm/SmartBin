import { getBinStatus } from '../services/binStatus.js';
import { saveSchedule, scheduleExists } from '../services/saveSchedule.js';
import { runAgent } from '../agent/runAgent.js';
import { validateSchedule } from '../agent/validateSchedule.js';

// Today's date as YYYY-MM-DD in Asia/Jakarta (the server may run in another timezone).
export function todayInJakarta() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

// Runs the daily scheduling for each zone. Never throws: returns { date, results }.
// - client: Anthropic client (a fake one in tests); handlers: tool handlers (mock or real)
// - sendMessage(officer, date): Syifa's sendScheduleMessage (optional until it is ready)
// - force: replace existing PENDING rows instead of skipping (manual trigger only)
export async function runDailyJob({
  pool, client, model, handlers,
  zones, date = todayInJakarta(), force = false,
  sendMessage = null, maxTurns = 8, maxStops = 20, log = console,
}) {
  let zoneList = zones;
  if (!zoneList) {
    try {
      zoneList = (await pool.query('SELECT DISTINCT zone FROM households ORDER BY zone')).rows.map((r) => r.zone);
    } catch (err) {
      log.error(`[daily-job] cannot list zones: ${err.message}`);
      return { date, results: [], error: `Cannot list zones: ${err.message}` };
    }
  }

  const ctx = { pool, client, model, handlers, date, force, sendMessage, maxTurns, maxStops, log };
  const results = [];
  for (const zone of zoneList) { // sequential on purpose: simpler, and friendlier to API rate limits
    const result = await processZone(zone, ctx);
    log.info(`[daily-job] ${date} zone ${zone}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
    results.push(result);
  }
  return { date, results };
}

async function processZone(zone, ctx) {
  const { pool, client, model, handlers, date, force, sendMessage, maxTurns, maxStops, log } = ctx;
  const out = (status, extra = {}) => ({ zone, status, ...extra });

  try {
    // 1. Officer of this zone
    const officers = (await pool.query(
      `SELECT user_id, name, phone_number FROM users
        WHERE role = 'officer' AND assigned_zone = $1 ORDER BY user_id`, [zone])).rows;
    if (officers.length === 0) return out('failed', { reason: `No officer assigned to zone ${zone}` });
    if (officers.length > 1) log.warn(`[daily-job] zone ${zone} has ${officers.length} officers, using the first`);
    const officer = officers[0];

    // 2. Do not spend tokens if today's schedule already exists
    if (!force && await scheduleExists(pool, date, zone)) {
      return out('skipped', { reason: 'Schedule already exists' });
    }

    // 3. Known households = the only IDs the agent is allowed to use
    const bins = await getBinStatus(zone, pool);
    if (bins.length === 0) return out('skipped', { reason: 'No households in zone' });

    // 4. Agent
    const agent = await runAgent({ client, model, zone, handlers, today: date, maxTurns, maxStops });
    const agentInfo = {
      turns: agent.turns, tool_calls: agent.toolCalls.length,
      input_tokens: agent.usage.input_tokens, output_tokens: agent.usage.output_tokens,
      latency_ms: agent.latency_ms,
    };
    if (!agent.ok) return out('failed', { reason: `Agent failed: ${agent.error}`, agent: agentInfo });

    // 5. Validation: an invalid schedule is never saved or sent
    const v = validateSchedule(agent.data, bins.map((b) => b.household_id), { maxStops });
    if (!v.valid) {
      log.error(`[daily-job] zone ${zone} invalid schedule: ${v.errors.join(' | ')}`);
      return out('failed', { reason: 'Validation failed', errors: v.errors, agent: agentInfo });
    }

    // 6. Save (one transaction)
    const saved = await saveSchedule(pool, {
      scheduleDate: date, zone, officerId: officer.user_id, households: v.schedule.households, force,
    });
    if (saved.skipped) return out('skipped', { reason: saved.reason, agent: agentInfo });

    // 7. Notify. A failed message does NOT undo the saved schedule.
    let notification = 'not_configured';
    if (saved.inserted === 0) {
      notification = 'not_needed'; // empty schedule: nothing to tell the officer
    } else if (sendMessage) {
      try {
        await sendMessage(officer, date);
        notification = 'sent';
      } catch (err) {
        notification = 'failed';
        log.error(`[daily-job] zone ${zone} notification failed: ${err.message}`);
      }
    }

    return out('saved', {
      inserted: saved.inserted, deleted: saved.deleted, notification,
      summary: v.schedule.summary, agent: agentInfo,
    });
  } catch (err) {
    log.error(`[daily-job] zone ${zone} failed: ${err.message}`);
    return out('failed', { reason: err.message });
  }
}