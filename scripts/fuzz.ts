import { generateConfig } from '../tests/fuzz/generate';
import {
  chooser,
  engineViolations,
  parserViolations,
} from '../tests/fuzz/invariants';
// Usage: npm run fuzz -- [--seed S] [--n N] [--parser P]
// Deep runs of the property tests in tests/properties.test.ts: N random
// configurations and P random expressions from seed S. Failing
// configurations are printed as JSON for a regression test.
const args = process.argv.slice(2);
const option = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  const value = i >= 0 ? Number(args[i + 1]) : fallback;
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`--${name} must be a nonnegative integer.`);
  return value;
};
const seed = option('seed', 1),
  n = option('n', 1000),
  parser = option('parser', 100 * n);
const started = performance.now();
const ch = chooser(seed);
let failures = 0;
const statuses: Record<string, number> = {};
for (let i = 0; i < n; i++) {
  const c = generateConfig(ch);
  const problems = engineViolations(c);
  for (const p of problems) console.error(`FAIL case ${i}: ${p}`);
  if (problems.length) {
    failures++;
    console.error(JSON.stringify(c));
  }
  const key = problems.length ? 'failed' : 'passed';
  statuses[key] = (statuses[key] ?? 0) + 1;
}
const expressions = chooser(seed ^ 0x5bd1e995);
let parserFailures = 0;
for (let i = 0; i < parser; i++)
  for (const p of parserViolations(expressions)) {
    parserFailures++;
    console.error(`FAIL expression: ${p}`);
  }
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(
  `Fuzzed ${n} configurations and ${parser} expressions from seed ${seed} in ${seconds} s: ${failures} configuration and ${parserFailures} expression failures.`,
);
if (failures || parserFailures) process.exitCode = 1;
