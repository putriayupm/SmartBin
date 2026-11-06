// scripts/seedCalendar.js
// Seeds Indonesian national holidays for Oct-Dec 2026. Safe to run more than once.
import 'dotenv/config';
import { pool } from '../src/config/db.js';

// TODO(verify): check these against the official SKB 3 Menteri 2026 document.
const EVENTS = [
  { date: '2026-12-24', name: 'Cuti Bersama Hari Raya Natal', is_holiday: true },
  { date: '2026-12-25', name: 'Hari Raya Natal (Kelahiran Yesus Kristus)', is_holiday: true },
];

try {
  for (const e of EVENTS) {
    // WHERE NOT EXISTS avoids duplicates without needing a UNIQUE constraint
    await pool.query(
      `INSERT INTO calendar_events (event_date, event_name, is_holiday)
       SELECT $1::date, $2::text, $3::boolean
       WHERE NOT EXISTS (
         SELECT 1 FROM calendar_events WHERE event_date = $1::date AND event_name = $2::text
       )`,
      [e.date, e.name, e.is_holiday]
    );
  }
  console.log(`Seed done (${EVENTS.length} events checked).`);
} catch (err) {
  console.error('Seed failed:', err.message);
} finally {
  await pool.end();
}