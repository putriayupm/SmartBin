import 'dotenv/config';
import pg from 'pg';
import { createMockHandlers } from '../src/agent/mockHandlers.js';

const scenario = process.argv[2] || 'normal';
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});

try {
  const h = createMockHandlers({ scenario, pool });

  const bins = await h.get_bin_status({ zone: 'A' });
  console.log('get_bin_status rows:', bins.length);

  console.log('weather:', await h.get_weather_forecast());
  console.log('calendar:', await h.get_calendar_events({ date_from: '2026-11-02', date_to: '2026-11-05' }));
  console.log('route:', await h.optimize_route({ household_ids: ['6', '1', '2'] }));
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}