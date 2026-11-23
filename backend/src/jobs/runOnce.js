import 'dotenv/config';
import { createJob } from './createJob.js';
import { pool } from '../config/db.js';

// Manual trigger: node src/jobs/runOnce.js [--force]
const force = process.argv.includes('--force');
const job = createJob();
const result = await job({ force });
console.log(JSON.stringify(result, null, 2));
await pool.end();