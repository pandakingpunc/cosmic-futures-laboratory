import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate } from '../src/science/engine';
import { defaultConfig } from '../src/science/defaults';
import {
  ensemble,
  cholesky,
  interpolate,
  sensitivity,
  sweep,
} from '../src/science/analysis';
import { pure } from './helpers';
test('seeded ensembles are reproducible and disclose sampling', () => {
  const c = { ...defaultConfig(), endLogYears: 11, samples: 40 },
    o = {
      runs: 4,
      seed: 123,
      distribution: 'gaussian' as const,
      sigmas: [0.54, 0.0073, 0.03, 0.05],
      interval: 0.95,
    };
  assert.deepEqual(ensemble(c, o), ensemble(c, o));
  assert.throws(() =>
    cholesky([
      [1, 2, 0, 0],
      [2, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ]),
  );
});
test('closed-model interpolation uses reconstructed log-time samples', () => {
  const c = pure({ omegaB: 2, omegaK: -1, endLogYears: 6, samples: 61 });
  const r = simulate(c),
    direct = simulate({ ...c, endLogYears: 3 });
  assert.ok(r.samples.length >= 61);
  const actual = interpolate(r, 3)!;
  const expected = direct.samples.at(-1)!.expansionIndex;
  assert.ok(Math.abs(actual - expected) < 1e-10);
  assert.equal(interpolate(r, -1), null);
});
test('sensitivity returns four ranked finite-difference rows', () => {
  const rows = sensitivity({ ...defaultConfig(), endLogYears: 11 });
  assert.equal(rows.length, 4);
  assert.deepEqual([...rows].map((r) => r.parameter).sort(), [
    'H0',
    'omegaM',
    'w0',
    'wa',
  ]);
  for (let i = 1; i < rows.length; i++)
    assert.ok((rows[i - 1].response ?? 0) >= (rows[i].response ?? 0));
  assert.ok(rows.find((r) => r.parameter === 'H0')!.derivative! > 0);
  assert.equal(rows.find((r) => r.parameter === 'wa')!.derivative, 0);
});
test('sweep grid covers phantom and quintessence outcomes', () => {
  const rows = sweep(
    { ...defaultConfig(), endLogYears: 20 },
    { w0Min: -1.2, w0Max: -0.8, waMin: 0, waMax: 0.1, resolution: 3 },
  );
  assert.equal(rows.length, 9);
  assert.ok(rows.some((r) => r.outcome.includes('Rip')));
  assert.ok(rows.some((r) => r.outcome.includes('accelerated')));
  assert.throws(() =>
    sweep(defaultConfig(), {
      w0Min: 0,
      w0Max: -1,
      waMin: 0,
      waMax: 1,
      resolution: 3,
    }),
  );
  assert.throws(() =>
    sweep(defaultConfig(), undefined as unknown as Parameters<typeof sweep>[1]),
  );
  assert.throws(() =>
    ensemble(
      defaultConfig(),
      undefined as unknown as Parameters<typeof ensemble>[1],
    ),
  );
});
