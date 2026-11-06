import 'dotenv/config';
import { pool } from '../src/config/db.js';
import { getCalendarEvents } from '../src/services/calendar.js';

console.log('Dec 20-31:', await getCalendarEvents('2026-12-20', '2026-12-31'));
console.log('Oct-Nov  :', await getCalendarEvents('2026-10-01', '2026-11-30'));
console.log('Bad input:', await getCalendarEvents('abc', '2026-12-31'));
await pool.end();