import 'dotenv/config';
import assert from 'node:assert/strict';
import pg from 'pg';
import { saveSchedule } from '../src/services/saveSchedule.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const DATE = '2099-01-01'; // far-future date so it never collides with real data
const rows = () => pool.query(
  'SELECT household_id, route_order, status, reason FROM schedules WHERE schedule_date = $1 ORDER BY route_order', [DATE]);

try {
  const officer = (await pool.query("SELECT user_id FROM users WHERE assigned_zone = 'A' AND role = 'officer'")).rows[0];
  assert.ok(officer, 'Run seed_schedules.sql first (no officer for zone A)');

  await pool.query('DELETE FROM schedules WHERE schedule_date = $1', [DATE]);

  const hh = [
    { household_id: '3', priority_score: 90, reason: 'Satu' },
    { household_id: '1', priority_score: 80, reason: "Dua; DROP TABLE schedules;--" }, // must be stored as plain text
    { household_id: '2', priority_score: 70, reason: 'Tiga' },
  ];
  const base = { scheduleDate: DATE, zone: 'A', officerId: officer.user_id, households: hh };

  let r = await saveSchedule(pool, base);
  console.log('1) first save   ', r);
  assert.deepEqual([r.saved, r.inserted], [true, 3]);
  assert.deepEqual((await rows()).rows.map((x) => [x.household_id, x.route_order]), [[3, 1], [1, 2], [2, 3]]);

  r = await saveSchedule(pool, base);
  console.log('2) second save  ', r);
  assert.equal(r.skipped, true);
  assert.equal((await rows()).rowCount, 3);

  await pool.query("UPDATE schedules SET status = 'collected' WHERE schedule_date = $1 AND household_id = 3", [DATE]);
  r = await saveSchedule(pool, { ...base, force: true });
  console.log('3) force        ', r);
  assert.deepEqual([r.deleted, r.inserted], [2, 2]); // collected row kept, 2 pending replaced
  assert.equal((await rows()).rowCount, 3);

  r = await saveSchedule(pool, { ...base, households: [{ household_id: '99999', priority_score: 1, reason: 'x' }, ...hh], scheduleDate: '2099-01-02' })
    .catch((e) => ({ error: e.message }));
  console.log('4) transaction  ', r);

  console.log('ALL CHECKS PASSED');
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await pool.query('DELETE FROM schedules WHERE schedule_date IN ($1, $2)', [DATE, '2099-01-02']).catch(() => {});
  await pool.end();
}