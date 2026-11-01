import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentOutput, validateSchedule } from './validateSchedule.js';

const known = ['1', '2', '3'];
const good = {
  households: [
    { household_id: '1', priority_score: 90, reason: 'Almost full' },
    { household_id: '2', priority_score: 70, reason: 'Rain expected' },
  ],
  summary: 'Two stops today.',
};

// ---- parseAgentOutput ----
test('parse: plain JSON', () => {
  assert.equal(parseAgentOutput('{"a":1}').ok, true);
});
test('parse: JSON in code fence', () => {
  const r = parseAgentOutput('```json\n{"a":1}\n```');
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { a: 1 });
});
test('parse: JSON with text around it', () => {
  const r = parseAgentOutput('Here is the schedule: {"a":1} Hope it helps!');
  assert.equal(r.ok, true);
});
test('parse: garbage text', () => {
  assert.equal(parseAgentOutput('not json at all').ok, false);
});
test('parse: empty string', () => {
  assert.equal(parseAgentOutput('').ok, false);
});

// ---- validateSchedule ----
test('validate: valid schedule', () => {
  const r = validateSchedule(good, known);
  assert.equal(r.valid, true);
  assert.equal(r.schedule.households.length, 2);
});
test('validate: empty list is valid', () => {
  assert.equal(validateSchedule({ households: [], summary: '' }, known).valid, true);
});
test('validate: numeric id matches string id', () => {
  const out = { households: [{ household_id: 1, priority_score: 50, reason: 'ok' }] };
  assert.equal(validateSchedule(out, known).valid, true);
});
test('validate: unknown household', () => {
  const out = { households: [{ household_id: '99', priority_score: 50, reason: 'ok' }] };
  const r = validateSchedule(out, known);
  assert.equal(r.valid, false);
  assert.equal(r.schedule, null);
  assert.match(r.errors[0], /unknown household_id "99"/);
});
test('validate: duplicate household', () => {
  const item = { household_id: '1', priority_score: 50, reason: 'ok' };
  const r = validateSchedule({ households: [item, item] }, known);
  assert.equal(r.valid, false);
  assert.match(r.errors.join(' '), /duplicate/);
});
test('validate: too many stops', () => {
  const r = validateSchedule(good, known, { maxStops: 1 });
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /Too many stops/);
});
test('validate: missing reason', () => {
  const out = { households: [{ household_id: '1', priority_score: 50 }] };
  assert.equal(validateSchedule(out, known).valid, false);
});
test('validate: priority_score out of range', () => {
  const out = { households: [{ household_id: '1', priority_score: 150, reason: 'ok' }] };
  assert.equal(validateSchedule(out, known).valid, false);
});
test('validate: priority_score as string', () => {
  const out = { households: [{ household_id: '1', priority_score: '80', reason: 'ok' }] };
  assert.equal(validateSchedule(out, known).valid, false);
});
test('validate: output is not an object', () => {
  assert.equal(validateSchedule('hello', known).valid, false);
});
test('validate: households is not an array', () => {
  assert.equal(validateSchedule({ households: 'x' }, known).valid, false);
});