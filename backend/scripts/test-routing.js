import 'dotenv/config';
import { pool } from '../src/config/db.js';
import { optimizeRoute } from '../src/services/routing.js';

// Run fn with temporary env overrides (undefined removes the variable)
async function withEnv(overrides, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const { rows } = await pool.query(
  "SELECT household_id FROM households WHERE zone = 'A' ORDER BY household_id"
);
const ids = rows.map((r) => String(r.household_id));
console.log('Zone A ids:', ids);

console.log('\n1 normal      :', await optimizeRoute(ids));
console.log('\n2 empty       :', await optimizeRoute([]));
console.log('\n3 unknown id  :', await optimizeRoute([ids[0], '999999']));
console.log('\n4 12 ids      :', await optimizeRoute(Array.from({ length: 12 }, (_, i) => String(i + 1))));
console.log('\n5 bad token   :', await withEnv({ MAPBOX_ACCESS_TOKEN: 'invalid' }, () => optimizeRoute(ids)));
console.log('\n6 timeout 1ms :', await withEnv({ ROUTING_TIMEOUT_MS: '1' }, () => optimizeRoute(ids)));
console.log('\n7 no depot    :', await withEnv({ DEPOT_LAT: undefined }, () => optimizeRoute(ids)));

await pool.end();