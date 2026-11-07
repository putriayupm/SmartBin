import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/config/db.js';
import { runDailyJob, todayInJakarta } from '../src/jobs/runDailyJob.js';
import { saveSchedule } from '../src/services/saveSchedule.js';
import { createMockHandlers } from '../src/agent/mockHandlers.js';
import { getBinStatus } from '../src/services/binStatus.js';

// Integration test against the REAL schema (UUIDs, FKs, schedule_runs). No DROP, no touching seed data.
if (process.env.DB_NAME !== 'smartbin') {
  console.error('FAILED: DB_NAME must be "smartbin" for this test'); process.exit(1);
}
const D = Array.from({ length: 8 }, (_, i) => `2099-04-0${i + 1}`); // far-future dates only
const ZONES = ['A', 'B', 'C'];
const silent = { info() {}, warn() {}, error() {} };
const usage = { input_tokens: 100, output_tokens: 20 }; // FAKE numbers, not a measurement
const tool = (id, name, input) => ({ stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id, name, input }] });
const text = (t) => ({ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: t }] });

// Fake Claude: bins -> route bins >= 60% (fullest first) -> JSON answer. NOT real Claude behavior.
function smartClient({ mode = 'good', summary = 'Ringkasan tes.' } = {}) {
  const calls = [];
  return { calls, messages: { async create(req) {
    calls.push(1);
    const step = req.messages.filter((m) => m.role === 'assistant').length;
    const last = req.messages.at(-1);
    if (step === 0) return tool('t1', 'get_bin_status', {});
    if (mode === 'empty') return text(JSON.stringify({ households: [], summary }));
    if (step === 1) {
      const bins = JSON.parse(last.content[0].content);
      const ids = bins.filter((b) => b.current_fill_level >= 60)
        .sort((a, b) => b.current_fill_level - a.current_fill_level).map((b) => String(b.household_id));
      return tool('t2', 'optimize_route', { household_ids: ids });
    }
    if (mode === 'badjson') return text('bukan json');
    const route = JSON.parse(last.content[0].content);
    const households = route.ordered_household_ids.map((id, i) => ({
      household_id: id, priority_score: 95 - i * 5, reason: `Rumah ${id} perlu diambil hari ini.` }));
    if (mode === 'unknown') households.push({ household_id: randomUUID(), priority_score: 10, reason: 'rumah palsu' });
    return text(JSON.stringify({ households, summary }));
  } } };
}

// mode: sent | skipped | failed (returns status failed) | throws
const makeSender = (mode = 'sent') => {
  const sent = [];
  const fn = async (officer, date) => {
    if (mode === 'throws') throw new Error('WhatsApp down');
    if (mode === 'failed') return { status: 'failed', error: 'WhatsApp down' };
    if (mode === 'skipped') return { status: 'skipped', error: 'not configured' };
    sent.push({ officer_id: officer.user_id, zone: officer.assigned_zone, date });
    return { status: 'sent' };
  };
  return Object.assign(fn, { sent });
};

const rowsOf = (date, zone) => pool.query(
  `SELECT s.schedule_id, s.household_id, s.officer_id, s.route_order, s.status, s.overridden_at, s.override_reason
     FROM schedules s JOIN households h ON h.household_id = s.household_id
    WHERE s.schedule_date = $1 AND h.zone = $2 ORDER BY s.route_order`, [date, zone]).then((r) => r.rows);
const runsOf = (date, zone) => pool.query(
  'SELECT summary FROM schedule_runs WHERE schedule_date = $1 AND zone = $2', [date, zone]).then((r) => r.rows);
const countOn = (date) => pool.query('SELECT count(*)::int AS n FROM schedules WHERE schedule_date = $1', [date]).then((r) => r.rows[0].n);
const run = (date, extra) => runDailyJob({
  pool, model: 'fake-model', log: silent, date,
  handlers: createMockHandlers({ scenario: 'normal', pool, today: date }), ...extra });
const cleanup = async () => {
  await pool.query('DELETE FROM schedules WHERE schedule_date = ANY($1::date[])', [D]);
  await pool.query('DELETE FROM schedule_runs WHERE schedule_date = ANY($1::date[])', [D]);
};

try {
  // Expectations come from the real seed data, not hard-coded IDs
  const expected = {}; const officer = {}; const allIds = {};
  for (const z of ZONES) {
    const bins = await getBinStatus(z);
    allIds[z] = bins.map((b) => String(b.household_id));
    expected[z] = bins.filter((b) => b.current_fill_level >= 60)
      .sort((a, b) => b.current_fill_level - a.current_fill_level).map((b) => String(b.household_id));
    officer[z] = (await pool.query(
      "SELECT user_id FROM users WHERE role = 'officer' AND assigned_zone = $1 ORDER BY user_id LIMIT 1", [z])).rows[0]?.user_id;
    assert.ok(officer[z], `no officer for zone ${z}: did you run npm run seed?`);
  }
  const operator = (await pool.query("SELECT user_id FROM users WHERE role = 'operator' LIMIT 1")).rows[0]?.user_id;
  assert.ok(operator, 'no operator user: did you run npm run seed?');
  const Z = [...ZONES].sort((a, b) => expected[b].length - expected[a].length)[0]; // zone with most stops
  assert.ok(expected[Z].length >= 2 && allIds[Z].length >= 2, 'seed too small for this test');
  console.log('Expected stops per zone:', Object.fromEntries(ZONES.map((z) => [z, expected[z].length])), '| test zone:', Z);

  await cleanup();

  // 1) Normal run, all zones
  let sender = makeSender();
  let r = await run(D[0], { client: smartClient(), zones: ZONES, sendMessage: sender });
  for (const z of ZONES) {
    const res = r.results.find((x) => x.zone === z);
    assert.equal(res.status, 'saved', `zone ${z}: ${res.reason}`);
    const rows = await rowsOf(D[0], z);
    assert.deepEqual(rows.map((x) => x.household_id), expected[z]);
    assert.deepEqual(rows.map((x) => x.route_order), expected[z].map((_, i) => i + 1));
    assert.ok(rows.every((x) => x.officer_id === officer[z] && x.status === 'pending'));
    assert.deepEqual((await runsOf(D[0], z)).map((x) => x.summary), ['Ringkasan tes.']);
  }
  assert.equal(sender.sent.length, ZONES.filter((z) => expected[z].length > 0).length);
  assert.ok(sender.sent.every((s) => ZONES.includes(s.zone)));
  console.log('1) normal run OK');

  // 2) Rerun without force: skipped BEFORE the agent is called
  sender = makeSender(); let client = smartClient();
  r = await run(D[0], { client, zones: ZONES, sendMessage: sender });
  assert.ok(r.results.every((x) => x.status === 'skipped'));
  assert.equal(client.calls.length, 0);
  assert.equal(sender.sent.length, 0);
  console.log('2) rerun skipped, no tokens spent OK');

  // 3) force keeps collected and overridden rows, replaces the rest, updates the summary
  const before = await rowsOf(D[0], Z);
  const collected = before[0]; const overridden = before[before.length - 1];
  await pool.query("UPDATE schedules SET status = 'collected' WHERE schedule_id = $1", [collected.schedule_id]);
  if (overridden.schedule_id !== collected.schedule_id) {
    await pool.query(
      "UPDATE schedules SET overridden_at = NOW(), overridden_by = $2, override_reason = 'tes' WHERE schedule_id = $1",
      [overridden.schedule_id, operator]);
  }
  const keptCount = overridden.schedule_id === collected.schedule_id ? 1 : 2;
  r = await run(D[0], { client: smartClient({ summary: 'Ringkasan tes 2.' }), zones: [Z], force: true, sendMessage: makeSender() });
  const res3 = r.results[0];
  assert.equal(res3.status, 'saved', res3.reason);
  assert.equal(res3.deleted, before.length - keptCount);
  assert.equal(res3.inserted, before.length - keptCount);
  const after = await rowsOf(D[0], Z);
  assert.equal(after.length, before.length);
  const col2 = after.find((x) => x.schedule_id === collected.schedule_id);
  assert.equal(col2.status, 'collected');
  assert.equal(col2.route_order, collected.route_order);
  if (keptCount === 2) {
    const ov2 = after.find((x) => x.schedule_id === overridden.schedule_id);
    assert.ok(ov2.overridden_at && ov2.override_reason === 'tes'); // override survived force
  }
  assert.equal(new Set(after.map((x) => x.route_order)).size, after.length); // no duplicate route_order
  assert.deepEqual((await runsOf(D[0], Z)).map((x) => x.summary), ['Ringkasan tes 2.']); // upsert, still one row
  console.log('3) force keeps collected/overridden rows OK');

  // 4) Invalid JSON: failed, nothing saved or sent
  sender = makeSender();
  r = await run(D[1], { client: smartClient({ mode: 'badjson' }), zones: [Z], sendMessage: sender });
  assert.equal(r.results[0].status, 'failed');
  assert.equal(await countOn(D[1]), 0);
  assert.equal((await runsOf(D[1], Z)).length, 0);
  assert.equal(sender.sent.length, 0);
  console.log('4) bad JSON rejected OK');

  // 5) Agent invents a household: validation rejects, nothing saved or sent
  sender = makeSender();
  r = await run(D[2], { client: smartClient({ mode: 'unknown' }), zones: [Z], sendMessage: sender });
  assert.equal(r.results[0].status, 'failed');
  assert.match(r.results[0].errors.join(' '), /unknown household_id/);
  assert.equal(await countOn(D[2]), 0);
  assert.equal(sender.sent.length, 0);
  console.log('5) unknown household rejected OK');

  // 6) WhatsApp skipped / failed / throws: schedule stays saved, statuses recorded correctly
  const expectNotif = { skipped: 'not_configured', failed: 'failed', throws: 'failed' };
  for (const [i, mode] of ['skipped', 'failed', 'throws'].entries()) {
    r = await run(D[3 + i], { client: smartClient(), zones: [Z], sendMessage: makeSender(mode) });
    assert.deepEqual([r.results[0].status, r.results[0].notification], ['saved', expectNotif[mode]], mode);
    assert.equal((await rowsOf(D[3 + i], Z)).length, expected[Z].length);
  }
  console.log('6) notification skipped/failed/throws OK');

  // 7) Real rollback: third row violates the households foreign key, nothing may remain
  const two = allIds[Z].slice(0, 2);
  const hh = [
    { household_id: two[0], priority_score: 90, reason: 'satu' },
    { household_id: two[1], priority_score: 80, reason: 'dua' },
    { household_id: randomUUID(), priority_score: 70, reason: 'harus gagal (FK)' },
  ];
  let err = null;
  try { await saveSchedule(pool, { scheduleDate: D[6], zone: Z, officerId: officer[Z], households: hh, summary: 'x' }); }
  catch (e) { err = e; }
  assert.ok(err, 'saveSchedule should have thrown');
  assert.equal(await countOn(D[6]), 0);
  assert.equal((await runsOf(D[6], Z)).length, 0);
  const okSave = await saveSchedule(pool, { scheduleDate: D[6], zone: Z, officerId: officer[Z], households: hh.slice(0, 2), summary: 'ok' });
  assert.equal(okSave.inserted, 2); // pool still healthy: connection was released
  console.log('7) rollback on FK violation OK:', err.message);

  // 8) Empty schedule: summary stored, no message, rerun does not call the agent again
  sender = makeSender();
  r = await run(D[7], { client: smartClient({ mode: 'empty', summary: 'Tidak ada pengangkutan hari ini.' }), zones: [Z], sendMessage: sender });
  assert.deepEqual([r.results[0].status, r.results[0].inserted, r.results[0].notification], ['saved', 0, 'not_needed']);
  assert.equal((await runsOf(D[7], Z)).length, 1);
  client = smartClient();
  r = await run(D[7], { client, zones: [Z], sendMessage: sender });
  assert.equal(r.results[0].status, 'skipped');
  assert.equal(client.calls.length, 0);
  assert.equal(sender.sent.length, 0);
  console.log('8) empty schedule OK');

  // 9) The job's date equals the date Putri's endpoints use
  const { rows: [{ d }] } = await pool.query("SELECT to_char((NOW() AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD') AS d");
  assert.equal(todayInJakarta(), d);
  console.log('9) Jakarta date matches SQL OK');

  console.log('ALL CHECKS PASSED');
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await cleanup().catch((e) => console.error('cleanup failed:', e.message));
  await pool.end();
}