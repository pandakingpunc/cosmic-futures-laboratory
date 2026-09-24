import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { compareResults } from '../src/science/compare';
import { defaultConfig } from '../src/science/defaults';
import { simulate, type SimulationCounters } from '../src/science/engine';
import { report } from '../src/science/report';
import type { Configuration, Result } from '../src/science/types';
import {
  FINGERPRINT_FIELDS,
  fingerprint,
  type Corpus,
} from './golden/fingerprint';
import { pure } from './helpers';
// Committed files may be checked out with CRLF line endings.
const text = (path: string) =>
  readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const json = <T>(path: string): T => JSON.parse(text(path));
const exact = { rel: 0, ignore: [] };
const ids = readdirSync('examples')
  .filter((f) => f.endsWith('.config.json'))
  .map((f) => f.slice(0, -'.config.json'.length))
  .sort();
test('every example configuration has a committed result and manifest row', () => {
  const manifest = json<{ id: string }[]>('examples/manifest.json');
  assert.ok(ids.length > 0);
  assert.deepEqual(manifest.map((m) => m.id).sort(), ids);
});
for (const id of ids)
  test(`golden example ${id} reproduces its committed result exactly`, () => {
    const expected = json<Result>(`examples/${id}.result.json`);
    const result = simulate(json<Configuration>(`examples/${id}.config.json`), {
      timestamp: expected.metadata.timestamp,
    });
    assert.deepEqual(
      compareResults(JSON.parse(JSON.stringify(result)), expected, exact),
      [],
    );
    assert.ok(
      JSON.stringify(result, null, 2) + '\n' ===
        text(`examples/${id}.result.json`),
      'Values agree but the serialized bytes differ (key order or layout).',
    );
  });
test('the baseline report reproduces its committed Markdown', () => {
  const expected = json<Result>('examples/observational-baseline.result.json');
  const result = simulate(
    json<Configuration>('examples/observational-baseline.config.json'),
    { timestamp: expected.metadata.timestamp },
  );
  assert.equal(
    report(result),
    text('examples/observational-baseline.report.md'),
  );
});
const corpus = json<Corpus>('tests/golden/corpus.json');
test('the extended golden corpus records the expected fields', () => {
  assert.deepEqual(corpus.fields, FINGERPRINT_FIELDS);
  assert.ok(corpus.cases.length >= 8);
});
for (const entry of corpus.cases)
  test(`golden corpus ${entry.id} reproduces its fingerprint exactly`, () => {
    assert.deepEqual(
      compareResults(
        fingerprint(simulate(entry.config)),
        entry.fingerprint,
        exact,
      ),
      [],
    );
  });
test('compareResults reports structural and numerical mismatches by path', () => {
  const base = {
    status: 'complete',
    samples: [{ logA: 1, logH: null }],
    metadata: { timestamp: 'a' },
  };
  assert.deepEqual(compareResults(structuredClone(base), base), []);
  assert.deepEqual(
    compareResults({ ...base, metadata: { timestamp: 'b' } }, base),
    [],
  );
  assert.deepEqual(
    compareResults({ ...base, metadata: { timestamp: 'b' } }, base, exact),
    ['metadata.timestamp: expected "a", got "b"'],
  );
  const changed = {
    status: 'limited',
    samples: [{ logA: 1 + 1e-15, logH: 0 }, {}],
    metadata: { timestamp: 'a', extra: true },
  };
  assert.deepEqual(compareResults(changed, base), [
    'status: expected "complete", got "limited"',
    'samples: expected length 1, got 2',
    'samples[0].logA: expected 1, got 1.000000000000001',
    'samples[0].logH: expected null (null), got 0 (number)',
    'metadata.extra: unexpected key',
  ]);
  assert.deepEqual(
    compareResults(changed.samples[0].logA, 1, { rel: 1e-12 }),
    [],
  );
  assert.deepEqual(compareResults(Infinity, 1e308, { rel: 1 }), [
    '(root): expected 1e+308, got Infinity',
  ]);
  assert.equal(
    compareResults(
      Array.from({ length: 30 }, (_, i) => i),
      Array.from({ length: 30 }, () => -1),
    ).length,
    20,
  );
});
test('work counters are deterministic and never change the result', () => {
  const count = (c: Configuration) => {
    const counters: SimulationCounters = {
      derivativeEvaluations: 0,
      samplingEvaluations: 0,
      rootIterations: 0,
    };
    const result = simulate(c, { counters, timestamp: 'fixed' });
    return { counters, result };
  };
  for (const c of [
    { ...defaultConfig(), endLogYears: 12, samples: 50 },
    pure({ omegaB: 2, omegaK: -1, endLogYears: 12 }),
  ]) {
    const a = count(c),
      b = count(c);
    assert.deepEqual(a.counters, b.counters);
    assert.ok(a.counters.derivativeEvaluations > 0);
    assert.ok(a.counters.samplingEvaluations > 0);
    assert.ok(a.counters.rootIterations > 0);
    assert.deepEqual(a.result, simulate(c, { timestamp: 'fixed' }));
  }
});
