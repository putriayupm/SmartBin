import 'dotenv/config';
import assert from 'node:assert/strict';
import pg from 'pg';
import { saveSchedule } from '../src/services/saveSchedule.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const DATE = '2099-01-03'; // far-future date, never collides with real data
const count = async () =>
  Number((await pool.query('SELECT count(*) FROM schedules WHERE schedule_date = $1', [DATE])).rows[0].count);

try {
  const officer = (await pool.query("SELECT user_id FROM users WHERE assigned_zone = 'A' AND role = 'officer'")).rows[0];
  assert.ok(officer, 'Run seed_schedules.sql first');
  await pool.query('DELETE FROM schedules WHERE schedule_date = $1', [DATE]);

  const broken = [
    { household_id: '1', priority_score: 90, reason: 'ok 1' },
    { household_id: '2', priority_score: 80, reason: 'ok 2' },
    { household_id: 'abc', priority_score: 70, reason: 'this row must fail' }, // not an integer
  ];

  let error = null;
  try {
    await saveSchedule(pool, { scheduleDate: DATE, zone: 'A', officerId: officer.user_id, households: broken });
  } catch (err) {
    error = err;
  }
  console.log('1) error thrown      :', error ? error.message : 'NONE');
  assert.ok(error, 'saveSchedule should have thrown');

  console.log('2) rows after failure:', await count());
  assert.equal(await count(), 0); // rows 1 and 2 were rolled back

  // The connection must have been released: the pool still works and a valid save succeeds
  const ok = await saveSchedule(pool, {
    scheduleDate: DATE, zone: 'A', officerId: officer.user_id, households: broken.slice(0, 2),
  });
  console.log('3) valid save after  :', ok);
  assert.equal(ok.inserted, 2);

  console.log('ALL CHECKS PASSED');
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await pool.query('DELETE FROM schedules WHERE schedule_date = $1', [DATE]).catch(() => {});
  await pool.end();
}