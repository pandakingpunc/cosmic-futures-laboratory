import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateConfig } from './fuzz/generate';
import { chooser, engineViolations, parserViolations } from './fuzz/invariants';
// Seeded property tests; `npm run fuzz -- --seed S --n N` runs deeper ones.
test('engine invariants hold for random configurations of every model family', () => {
  const ch = chooser(20260924);
  const failures: string[] = [];
  for (let i = 0; i < 300 && failures.length < 5; i++) {
    const c = generateConfig(ch);
    for (const problem of engineViolations(c))
      failures.push(`case ${i}: ${problem}\n${JSON.stringify(c)}`);
  }
  assert.deepEqual(failures, []);
});
test('the expression parser either rejects input cleanly or yields bounded values', () => {
  const ch = chooser(7);
  const failures: string[] = [];
  for (let i = 0; i < 20000 && failures.length < 5; i++)
    failures.push(...parserViolations(ch));
  assert.deepEqual(failures, []);
});
