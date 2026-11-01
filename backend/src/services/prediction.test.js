import test from 'node:test';
import assert from 'node:assert/strict';
import { predictDaysUntilFull } from './prediction.js';

const cases = [
  { name: 'normal case', input: { current_fill_level: 50, daily_fill_rate: 10 }, expected: 5 },
  { name: 'decimal result', input: { current_fill_level: 70, daily_fill_rate: 20 }, expected: 1.5 },
  { name: 'already full', input: { current_fill_level: 100, daily_fill_rate: 5 }, expected: 0 },
  { name: 'over 100', input: { current_fill_level: 120, daily_fill_rate: 5 }, expected: 0 },
  { name: 'zero rate', input: { current_fill_level: 50, daily_fill_rate: 0 }, expected: null },
  { name: 'negative rate', input: { current_fill_level: 50, daily_fill_rate: -1 }, expected: null },
  { name: 'null rate', input: { current_fill_level: 50, daily_fill_rate: null }, expected: null },
  { name: 'null level', input: { current_fill_level: null, daily_fill_rate: 5 }, expected: null },
  { name: 'non-numeric', input: { current_fill_level: 'abc', daily_fill_rate: 5 }, expected: null },
  { name: 'string numbers (pg NUMERIC)', input: { current_fill_level: '50', daily_fill_rate: '10' }, expected: 5 },
];

for (const c of cases) {
  test(c.name, () => {
    assert.equal(predictDaysUntilFull(c.input), c.expected);
  });
}