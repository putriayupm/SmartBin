// backend/scripts/test-notification.js
// Run from the backend folder:  node scripts/test-notification.js
// Uses the first officer in the DB and the most recent schedule date (or today if none).
import { pool } from '../src/config/db.js';
import { sendScheduleMessage } from '../src/services/notification.js';

const off = await pool.query(
  `SELECT u.user_id, u.name, u.phone_number,
          (SELECT MAX(schedule_date)::text FROM schedules s WHERE s.officer_id = u.user_id) AS last_date
   FROM users u WHERE u.role = 'officer' ORDER BY u.name LIMIT 1`
);
if (off.rows.length === 0) {
  console.log('No officer in DB. Run the seed first.');
  await pool.end();
  process.exit(1);
}
const { last_date, ...officer } = off.rows[0];
const date = last_date ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
console.log('officer:', officer.name, '| phone:', officer.phone_number, '| date:', date);

const result = await sendScheduleMessage(officer, date);
console.log('result:', JSON.stringify(result));

const log = await pool.query(
  `SELECT status, error_message, channel, sent_at FROM notification_logs
   WHERE officer_id = $1 ORDER BY sent_at DESC LIMIT 1`, [officer.user_id]);
console.log('last log row:', JSON.stringify(log.rows[0]));
await pool.end();
