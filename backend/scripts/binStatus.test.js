import 'dotenv/config';
import pg from 'pg';
import { getBinStatus } from '../src/services/binStatus.js';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000, // fail fast if the DB is unreachable
});

try {
  const zone = process.argv[2];
  const result = await getBinStatus(zone, pool);
  console.log(JSON.stringify(result, null, 2));
  console.log(`Rows: ${result.length}`);
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}