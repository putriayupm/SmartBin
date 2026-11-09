import 'dotenv/config';
import pg from 'pg';
import { createJob } from '../src/jobs/createJob.js';

// Usage: node scripts/runDailyJob.js [--zone=A,B] [--date=YYYY-MM-DD] [--force] [--scenario=normal|rainy|holiday]
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
  console.error('FAILED: --date must be YYYY-MM-DD');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  const job = createJob({ pool, scenario: args.scenario || 'normal' });
  console.log(`Running daily job (force=${Boolean(args.force)}). This calls the Claude API and uses tokens.`);
  const out = await job({
    zones: typeof args.zone === 'string' ? args.zone.split(',') : undefined,
    date: args.date,
    force: Boolean(args.force),
  });
  console.log('Date:', out.date);
  console.table(out.results.map((r) => ({
    zone: r.zone, status: r.status, inserted: r.inserted, notification: r.notification,
    turns: r.agent?.turns, in_tokens: r.agent?.input_tokens, out_tokens: r.agent?.output_tokens,
    latency_ms: r.agent?.latency_ms, reason: r.reason,
  })));
  if (out.error || out.results.some((r) => r.status === 'failed')) process.exitCode = 1;
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}