import 'dotenv/config';
import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { runAgent } from '../src/agent/runAgent.js';
import { validateSchedule } from '../src/agent/validateSchedule.js';
import { createMockHandlers } from '../src/agent/mockHandlers.js';
import { getBinStatus } from '../src/services/binStatus.js';
import { pool } from '../src/config/db.js';

// Usage: node scripts/run2C.js [--runs=1] [--zone=A] [--price-in=USD_per_M] [--price-out=USD_per_M] [--dry]
// --dry uses a FAKE client (no API call, no cost) just to check this script works.
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const RUNS = Number(args.runs || 1);
const ZONE = args.zone || 'A';
const DRY = Boolean(args.dry);
const priceIn = args['price-in'] != null ? Number(args['price-in']) : null;
const priceOut = args['price-out'] != null ? Number(args['price-out']) : null;
const MAX_STOPS = 11;
const SCENARIOS = ['normal', 'rainy', 'holiday'];

// --- Fake client for --dry only: asks bins, routes bins >= 60%, answers. NOT a Claude measurement.
function fakeClient() {
  const u = { input_tokens: 0, output_tokens: 0 };
  return {
    messages: {
      async create(req) {
        const step = req.messages.filter((m) => m.role === 'assistant').length;
        const last = req.messages.at(-1);
        if (step === 0) return { stop_reason: 'tool_use', usage: u, content: [
          { type: 'tool_use', id: 'a', name: 'get_bin_status', input: {} },
          { type: 'tool_use', id: 'b', name: 'get_weather_forecast', input: {} },
          { type: 'tool_use', id: 'c', name: 'get_calendar_events', input: { date_from: '2099-01-01', date_to: '2099-01-04' } }] };
        if (step === 1) {
          const bins = JSON.parse(last.content[0].content);
          const ids = bins.filter((b) => b.current_fill_level >= 60).sort((x, y) => y.current_fill_level - x.current_fill_level).map((b) => String(b.household_id));
          return { stop_reason: 'tool_use', usage: u, content: [{ type: 'tool_use', id: 'd', name: 'optimize_route', input: { household_ids: ids } }] };
        }
        const route = JSON.parse(last.content[0].content);
        const households = route.ordered_household_ids.map((id, i) => ({ household_id: id, priority_score: 95 - i * 5, reason: `Rumah ${id} diambil.` }));
        return { stop_reason: 'end_turn', usage: u, content: [{ type: 'text', text: JSON.stringify({ households, summary: 'dry run' }) }] };
      },
    },
  };
}

function makeClient() {
  if (DRY) return fakeClient();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set in .env (use --dry to test the script only)');
  if (!process.env.CLAUDE_MODEL) throw new Error('CLAUDE_MODEL is not set in .env');
  return new Anthropic({ timeout: 60_000 }); // VERIFY in SDK docs
}

const rows = [];

try {
  const client = makeClient();
  const model = DRY ? 'fake-model' : process.env.CLAUDE_MODEL;
  const bins = await getBinStatus(ZONE, pool);
  const knownIds = bins.map((b) => b.household_id);
  const byId = Object.fromEntries(bins.map((b) => [String(b.household_id), b]));
  const fullest3 = [...bins].sort((a, b) => b.current_fill_level - a.current_fill_level).slice(0, 3).map((b) => String(b.household_id));
  console.log(`Zone ${ZONE}: ${bins.length} households. Fullest 3: ${fullest3.map((id) => `${byId[id].name} (${byId[id].current_fill_level}%)`).join(', ')}`);
  console.log(DRY ? 'DRY MODE: fake client, numbers below are NOT Claude results.' : `Model: ${model}. This calls the Claude API and uses tokens.`);

  for (const scenario of SCENARIOS) {
    for (let run = 1; run <= RUNS; run++) {
      const handlers = createMockHandlers({ scenario, pool, today: '2026-11-02' });
      const calls = [];
      const traced = Object.fromEntries(Object.entries(handlers).map(([k, fn]) => [k, async (i) => { calls.push({ tool: k, input: i }); return fn(i); }]));
      const r = await runAgent({ client, model, zone: ZONE, handlers: traced, today: '2026-11-02', maxStops: MAX_STOPS });

      const row = { scenario, run, ok: r.ok, error: r.error, turns: r.turns, tool_calls: r.toolCalls.length,
        in_tokens: r.usage.input_tokens, out_tokens: r.usage.output_tokens, latency_ms: r.latency_ms, stops: null, checks: {}, summary: null, ids: [] };

      if (r.ok) {
        const v = validateSchedule(r.data, knownIds, { maxStops: MAX_STOPS });
        row.checks.valid = v.valid;
        if (!v.valid) row.error = `Validation: ${v.errors.join(' | ')}`;
        else {
          const ids = v.schedule.households.map((h) => h.household_id);
          row.ids = ids; row.stops = ids.length; row.summary = v.schedule.summary;
          row.checks.top3_fullest = fullest3.every((id) => ids.includes(id));
          if (scenario === 'normal') row.checks.no_low_fill = ids.every((id) => byId[id].current_fill_level >= 30);
          const routeCall = r.toolCalls.filter((c) => c.name === 'optimize_route');
          // route_kept: schedule order equals the order optimize_route returned (mock keeps input order)
          const lastRoute = calls.filter((c) => c.tool === 'optimize_route').at(-1);
          row.checks.route_kept = Boolean(lastRoute) && JSON.stringify(lastRoute.input.household_ids.map(String)) === JSON.stringify(ids);
          row.checks.used_tools = ['get_bin_status', 'get_weather_forecast', 'get_calendar_events', 'optimize_route'].every((t) => r.toolCalls.some((c) => c.name === t));
          row.routeCalls = routeCall.length;
        }
      }
      rows.push(row);
      console.log(`${scenario} run ${run}: ${row.ok ? 'ok' : 'FAILED'} stops=${row.stops} ${row.error ?? ''}`);
    }
  }

  // Cross-scenario checks: compare against the normal runs of this session
  const avg = (s) => { const x = rows.filter((r) => r.scenario === s && r.stops != null); return x.length ? x.reduce((a, r) => a + r.stops, 0) / x.length : null; };
  const baseline = avg('normal');
  for (const s of ['rainy', 'holiday']) {
    const a = avg(s);
    const label = s === 'rainy' ? 'rain_more' : 'holiday_more';
    for (const r of rows.filter((x) => x.scenario === s && x.stops != null)) {
      r.checks[label] = baseline == null ? null : r.stops >= baseline ? (r.stops > baseline ? true : 'same') : false;
    }
    console.log(`Average stops: normal=${baseline} ${s}=${a}`);
  }

  // Console table
  const cost = (r) => (priceIn != null && priceOut != null ? ((r.in_tokens * priceIn + r.out_tokens * priceOut) / 1e6).toFixed(5) : 'n/a');
  console.table(rows.map((r) => ({ scenario: r.scenario, run: r.run, ok: r.ok, stops: r.stops, turns: r.turns, tools: r.tool_calls,
    in_tok: r.in_tokens, out_tok: r.out_tokens, latency_ms: r.latency_ms, usd: cost(r), checks: JSON.stringify(r.checks) })));

  // Save raw results for the report (never commit if it contains anything sensitive; it contains none by design)
  const out = { generated_at: new Date().toISOString(), dry: DRY, model, zone: ZONE, runs_per_scenario: RUNS, rows };
  fs.writeFileSync(DRY ? 'results-2C-dry.json' : 'results-2C.json', JSON.stringify(out, null, 2));
  console.log(`Saved ${DRY ? 'results-2C-dry.json' : 'results-2C.json'}`);
  if (rows.some((r) => !r.ok)) process.exitCode = 1;
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}