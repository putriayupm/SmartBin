import 'dotenv/config';
import { startDailyCron } from '../src/jobs/scheduler.js';
import { createJob } from '../src/jobs/createJob.js';
import { pool } from '../src/config/db.js';

// createJob runs INSIDE the tick: a missing key is logged each run instead of crashing the process.
const task = startDailyCron({
  expression: process.env.CRON_SCHEDULE || '0 5 * * *',
  run: async () => {
    const out = await createJob({ pool })();
    console.log(`[cron] finished ${out.date}:`, out.results.map((r) => `${r.zone}=${r.status}`).join(', '));
    return out;
  },
});

process.on('SIGINT', async () => { // Ctrl+C
  task.stop();
  await pool.end();
  process.exit(0);
});