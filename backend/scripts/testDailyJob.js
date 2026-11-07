import 'dotenv/config';
import assert from 'node:assert/strict';
import pg from 'pg';
import { runDailyJob } from '../src/jobs/runDailyJob.js';
import { createMockHandlers } from '../src/agent/mockHandlers.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const DATES = ['2099-02-01', '2099-02-02', '2099-02-03', '2099-02-04', '2099-02-05'];
const silent = { info() {}, warn() {}, error() {} };
const usage = { input_tokens: 100, output_tokens: 20 }; // FAKE numbers, not a real measurement

// Fake Claude: step 0 asks for bins, step 1 routes bins >= 60% (fullest first), step 2 answers.
function smartClient({ mode = 'good' } = {}) {
  const calls = [];
  return {
    calls,
    messages: {
      async create(req) {
        calls.push(1);
        const step = req.messages.filter((m) => m.role === 'assistant').length;
        const last = req.messages.at(-1);
        if (step === 0) {
          return { stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 't1', name: 'get_bin_status', input: {} }] };
        }
        if (step === 1) {
          const bins = JSON.parse(last.content[0].content);
          const ids = bins.filter((b) => b.current_fill_level >= 60)
            .sort((a, b) => b.current_fill_level - a.current_fill_level).map((b) => String(b.household_id));
          return { stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 't2', name: 'optimize_route', input: { household_ids: ids } }] };
        }
        if (mode === 'badjson') return { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'bukan json' }] };
        const route = JSON.parse(last.content[0].content);
        const households = route.ordered_household_ids.map((id, i) => ({
          household_id: id, priority_score: 95 - i * 5, reason: `Rumah ${id} perlu diambil hari ini.`,
        }));
        if (mode === 'unknown') households.push({ household_id: '99999', priority_score: 10, reason: 'rumah palsu' });
        return { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: JSON.stringify({ households, summary: 'Ringkasan tes.' }) }] };
      },
    },
  };
}

const makeSender = ({ fail = false } = {}) => {
  const sent = [];
  const fn = async (officer, date) => { if (fail) throw new Error('WhatsApp down'); sent.push({ officer_id: officer.user_id, date }); };
  return Object.assign(fn, { sent });
};
const rowsOf = (date, zone) => pool.query(
  `SELECT s.household_id, s.route_order, s.status, s.officer_id
     FROM schedules s JOIN households h ON h.household_id = s.household_id
    WHERE s.schedule_date = $1 AND h.zone = $2 ORDER BY s.route_order`, [date, zone]).then((r) => r.rows);
const summarize = (r) => r.results.map((x) => [x.zone, x.status, x.inserted, x.notification]);
const run = (date, extra) => runDailyJob({
  pool, model: 'fake-model', log: silent, date,
  handlers: createMockHandlers({ scenario: 'normal', pool, today: date }), ...extra,
});

try {
  await pool.query('DELETE FROM schedules WHERE schedule_date = ANY($1::date[])', [DATES]);

  // 1) Normal run, zones A and B
  let sender = makeSender();
  let r = await run(DATES[0], { client: smartClient(), zones: ['A', 'B'], sendMessage: sender });
  console.log('1) normal run'); console.table(r.results.map((x) => ({ zone: x.zone, status: x.status, inserted: x.inserted, notification: x.notification, turns: x.agent?.turns, tool_calls: x.agent?.tool_calls })));
  assert.deepEqual(summarize(r), [['A', 'saved', 5, 'sent'], ['B', 'saved', 2, 'sent']]);
  assert.deepEqual((await rowsOf(DATES[0], 'A')).map((x) => [x.household_id, x.route_order]), [[6, 1], [1, 2], [2, 3], [3, 4], [8, 5]]);
  assert.deepEqual((await rowsOf(DATES[0], 'B')).map((x) => x.household_id), [9, 11]);
  assert.ok((await rowsOf(DATES[0], 'A')).every((x) => x.status === 'pending'));
  assert.equal(sender.sent.length, 2);

  // 2) Same date again: skipped BEFORE the agent is called (no tokens spent), nothing sent
  sender = makeSender(); let client = smartClient();
  r = await run(DATES[0], { client, zones: ['A', 'B'], sendMessage: sender });
  console.log('2) rerun, no force   ', summarize(r));
  assert.deepEqual(r.results.map((x) => x.status), ['skipped', 'skipped']);
  assert.equal(client.calls.length, 0);
  assert.equal(sender.sent.length, 0);

  // 3) force: pending rows replaced
  r = await run(DATES[0], { client: smartClient(), zones: ['A'], force: true, sendMessage: makeSender() });
  console.log('3) force             ', r.results.map((x) => [x.zone, x.status, x.deleted, x.inserted]));
  assert.deepEqual([r.results[0].status, r.results[0].deleted, r.results[0].inserted], ['saved', 5, 5]);
  assert.equal((await rowsOf(DATES[0], 'A')).length, 5);

  // 4) Agent returns invalid JSON: failed, nothing saved or sent
  sender = makeSender();
  r = await run(DATES[1], { client: smartClient({ mode: 'badjson' }), zones: ['A'], sendMessage: sender });
  console.log('4) bad JSON          ', r.results[0].status, '-', r.results[0].reason);
  assert.equal(r.results[0].status, 'failed');
  assert.match(r.results[0].reason, /Agent failed/);
  assert.equal((await rowsOf(DATES[1], 'A')).length, 0);
  assert.equal(sender.sent.length, 0);

  // 5) Agent invents a household: validation rejects, nothing saved or sent
  sender = makeSender();
  r = await run(DATES[2], { client: smartClient({ mode: 'unknown' }), zones: ['A'], sendMessage: sender });
  console.log('5) unknown household ', r.results[0].status, '-', r.results[0].errors);
  assert.equal(r.results[0].status, 'failed');
  assert.match(r.results[0].errors.join(' '), /unknown household_id "99999"/);
  assert.equal((await rowsOf(DATES[2], 'A')).length, 0);
  assert.equal(sender.sent.length, 0);

  // 6) WhatsApp fails: schedule stays saved, job continues to the next zone
  r = await run(DATES[3], { client: smartClient(), zones: ['A', 'B'], sendMessage: makeSender({ fail: true }) });
  console.log('6) notification fails', r.results.map((x) => [x.zone, x.status, x.notification]));
  assert.deepEqual(r.results.map((x) => [x.status, x.notification]), [['saved', 'failed'], ['saved', 'failed']]);
  assert.equal((await rowsOf(DATES[3], 'A')).length, 5);

  // 7) One broken zone (no officer) does not stop the next zone
  r = await run(DATES[4], { client: smartClient(), zones: ['Z', 'B'], sendMessage: makeSender() });
  console.log('7) zone without officer', r.results.map((x) => [x.zone, x.status, x.reason ?? '']));
  assert.equal(r.results[0].status, 'failed');
  assert.match(r.results[0].reason, /No officer/);
  assert.equal(r.results[1].status, 'saved');

  console.log('ALL CHECKS PASSED');
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await pool.query('DELETE FROM schedules WHERE schedule_date = ANY($1::date[])', [DATES]).catch(() => {});
  await pool.end();
}