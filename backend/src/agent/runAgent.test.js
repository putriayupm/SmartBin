import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from './runAgent.js';

// Fake Anthropic client: returns the scripted responses in order and records requests.
function fakeClient(script) {
  const requests = [];
  let i = 0;
  return {
    requests,
    messages: {
      async create(req) {
        requests.push(structuredClone(req));
        const next = script[i++];
        if (next instanceof Error) throw next;
        if (!next) throw new Error('Fake client: script exhausted');
        return next;
      },
    },
  };
}

const usage = { input_tokens: 100, output_tokens: 20 };
const toolTurn = (id, name, input = {}) => ({
  stop_reason: 'tool_use', usage,
  content: [{ type: 'tool_use', id, name, input }],
});
const finalTurn = (text) => ({ stop_reason: 'end_turn', usage, content: [{ type: 'text', text }] });

const goodJson = JSON.stringify({
  households: [{ household_id: '1', priority_score: 90, reason: 'Hampir penuh' }],
  summary: 'Satu rumah hari ini.',
});

const handlers = {
  get_bin_status: async () => [{ household_id: '1' }],
  get_weather_forecast: async () => ({ available: true, rain_expected: false, rainy_periods: 0, summary: '' }),
  get_calendar_events: async () => [],
  optimize_route: async ({ household_ids }) => ({ ordered_household_ids: household_ids, distance_meters: 1, duration: '1' }),
};
const base = { model: 'fake-model', zone: 'A', today: '2026-11-02' };

test('agent: happy path with 3 tool calls', async () => {
  const client = fakeClient([
    toolTurn('t1', 'get_bin_status', { zone: 'A' }),
    toolTurn('t2', 'get_weather_forecast'),
    toolTurn('t3', 'optimize_route', { household_ids: ['1'] }),
    finalTurn(goodJson),
  ]);
  const r = await runAgent({ ...base, client, handlers });
  assert.equal(r.ok, true);
  assert.equal(r.turns, 4);
  assert.equal(r.toolCalls.length, 3);
  assert.equal(r.usage.input_tokens, 400);
  assert.equal(r.data.households[0].household_id, '1');
});

test('agent: tool result is sent back with the same tool_use_id', async () => {
  const client = fakeClient([toolTurn('abc', 'get_weather_forecast'), finalTurn(goodJson)]);
  await runAgent({ ...base, client, handlers });
  const last = client.requests[1].messages.at(-1);
  assert.equal(last.role, 'user');
  assert.equal(last.content[0].type, 'tool_result');
  assert.equal(last.content[0].tool_use_id, 'abc');
});

test('agent: zone is forced to the job zone', async () => {
  let seen;
  const h = { ...handlers, get_bin_status: async (input) => { seen = input; return []; } };
  const client = fakeClient([toolTurn('t1', 'get_bin_status', { zone: 'Z' }), finalTurn(goodJson)]);
  await runAgent({ ...base, client, handlers: h });
  assert.equal(seen.zone, 'A');
});

test('agent: stops at max turns', async () => {
  const client = fakeClient(Array.from({ length: 10 }, (_, i) => toolTurn(`t${i}`, 'get_weather_forecast')));
  const r = await runAgent({ ...base, client, handlers, maxTurns: 3 });
  assert.equal(r.ok, false);
  assert.match(r.error, /Max turns reached/);
  assert.equal(client.requests.length, 3);
});

test('agent: final answer is not valid JSON', async () => {
  const r = await runAgent({ ...base, client: fakeClient([finalTurn('Maaf, saya tidak bisa.')]), handlers });
  assert.equal(r.ok, false);
  assert.match(r.error, /not valid JSON/);
});

test('agent: a failing tool does not crash the loop', async () => {
  const h = { ...handlers, get_weather_forecast: async () => { throw new Error('BMKG down'); } };
  const client = fakeClient([toolTurn('t1', 'get_weather_forecast'), finalTurn(goodJson)]);
  const r = await runAgent({ ...base, client, handlers: h });
  assert.equal(r.ok, true);
  assert.equal(r.toolCalls[0].ok, false);
  const sent = client.requests[1].messages.at(-1).content[0];
  assert.equal(sent.is_error, true);
});

test('agent: unknown tool is reported to the model', async () => {
  const client = fakeClient([toolTurn('t1', 'delete_everything'), finalTurn(goodJson)]);
  const r = await runAgent({ ...base, client, handlers });
  assert.equal(r.toolCalls[0].ok, false);
  assert.equal(r.ok, true);
});

test('agent: API error is returned, not thrown', async () => {
  const r = await runAgent({ ...base, client: fakeClient([new Error('401 invalid key')]), handlers });
  assert.equal(r.ok, false);
  assert.match(r.error, /API call failed/);
});

test('agent: output cut off by max_tokens', async () => {
  const cut = { stop_reason: 'max_tokens', usage, content: [{ type: 'text', text: '{"households":[' }] };
  const r = await runAgent({ ...base, client: fakeClient([cut]), handlers });
  assert.equal(r.ok, false);
  assert.match(r.error, /cut off/);
});