import test from 'node:test';
import assert from 'node:assert/strict';
import { guarded, startDailyCron } from './scheduler.js';

const silent = { info() {}, warn() {}, error() {} };

test('scheduler: overlapping run is skipped', async () => {
  let calls = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const run = guarded(async () => { calls++; await gate; return 'done'; }, silent);

  const first = run();            // starts, waits on the gate
  const second = await run();     // tick arrives while the first is running
  assert.deepEqual(second, { skipped: true });
  release();
  assert.equal(await first, 'done');
  assert.equal(calls, 1);
  assert.equal(await run(), 'done'); // after finishing, a new run is allowed
  assert.equal(calls, 2);
});

test('scheduler: a crashing job is caught, not thrown', async () => {
  const run = guarded(async () => { throw new Error('boom'); }, silent);
  assert.deepEqual(await run(), { error: 'boom' });
  assert.deepEqual(await run(), { error: 'boom' }); // still usable after a crash
});

test('scheduler: invalid cron expression is rejected', () => {
  assert.throws(() => startDailyCron({ run: async () => {}, expression: 'not a cron', log: silent }), /Invalid cron expression/);
});

test('scheduler: valid expression creates a stoppable task', () => {
  const task = startDailyCron({ run: async () => {}, expression: '0 5 * * *', log: silent });
  assert.equal(typeof task.stop, 'function');
  task.stop(); // otherwise the test process may not exit
});