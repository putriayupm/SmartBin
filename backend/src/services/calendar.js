// services/calendar.js
// Contract: getCalendarEvents(dateFrom, dateTo) -> [{event_date, event_name, is_holiday}]
// Dates are 'YYYY-MM-DD' strings, both ends inclusive.
import { pool } from '../config/db.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function getCalendarEvents(dateFrom, dateTo) {
  // Validate input so a bad value never reaches the database
  if (!DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo)) {
    console.error('[calendar] invalid date format, expected YYYY-MM-DD:', dateFrom, dateTo);
    return [];
  }

  try {
    // to_char returns a plain string. Without it, node-pg turns a DATE into a JS Date
    // at local midnight, and JSON.stringify can shift it one day back (Jakarta is UTC+7).
    const { rows } = await pool.query(
      `SELECT to_char(event_date, 'YYYY-MM-DD') AS event_date, event_name, is_holiday
       FROM calendar_events
       WHERE event_date BETWEEN $1 AND $2
       ORDER BY event_date`,
      [dateFrom, dateTo]
    );
    return rows;
  } catch (err) {
    // Fallback: treat "no events known" so the scheduling job can still run
    console.error('[calendar] query failed:', err.message);
    return [];
  }
}