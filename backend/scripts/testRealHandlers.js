import 'dotenv/config';
import { pool } from '../src/config/db.js';
import { createRealHandlers } from '../src/agent/realHandlers.js';

// Calls each REAL handler once and prints the result. Read-only.
try {
  const h = createRealHandlers({ pool });
  const bins = await h.get_bin_status({ zone: 'A' });
  console.log('1) bins zone A:', bins.length, '| first id:', bins[0]?.household_id);

  console.log('2) weather:', await h.get_weather_forecast());
  console.log('3) calendar:', await h.get_calendar_events({ date_from: '2026-12-20', date_to: '2026-12-31' }));

  const ids = bins.map((b) => String(b.household_id));
  const route = await h.optimize_route({ household_ids: ids });
  console.log('4) route:', route);
  const same = JSON.stringify([...route.ordered_household_ids].sort()) === JSON.stringify([...ids].sort());
  console.log('   same households in route:', same, '| fallback:', Boolean(route.fallback));
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}