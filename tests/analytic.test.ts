import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate, H0_YEAR } from '../src/science/engine';
import { defaultConfig } from '../src/science/defaults';
import { near, pure } from './helpers';
for (const [name, c, p] of [
  ['matter', pure({ omegaB: 1 }), 1.5],
  ['radiation', pure({ omegaR: 1 }), 2],
  ['curvature', pure({ omegaK: 1 }), 1],
] as const) {
  test(`${name}: numerical scale factor, Hubble rate and density`, () => {
    const r = simulate(c);
    assert.equal(r.status, 'complete', r.diagnostics.reason);
    for (const s of r.samples.slice(1)) {
      const tau = c.H0 * H0_YEAR * 10 ** s.logYears;
      near(s.logA!, Math.log10(1 + p * tau) / p, 2e-6);
      near(s.logH!, Math.log10(c.H0 / (1 + p * tau)), 2e-6);
    }
  });
}
test('de Sitter: a=exp(H0 t) and constant H', () => {
  const c = pure({ omegaDE: 1 }),
    r = simulate(c);
  for (const s of r.samples.slice(1)) {
    near(s.logA!, (c.H0 * H0_YEAR * 10 ** s.logYears) / Math.LN10, 2e-6);
    near(s.logH!, Math.log10(c.H0), 1e-10);
  }
});
test('flat matter + Lambda: exact sinh solution', () => {
  const c = pure({ omegaB: 0.3, omegaDE: 0.7 }),
    r = simulate(c);
  for (const s of r.samples.slice(1)) {
    const tau = c.H0 * H0_YEAR * 10 ** s.logYears,
      exact =
        Math.log10(
          (0.3 / 0.7) *
            Math.sinh(
              Math.asinh(Math.sqrt(0.7 / 0.3)) + 1.5 * Math.sqrt(0.7) * tau,
            ) **
              2,
        ) / 3;
    near(s.logA!, exact, 2e-6);
  }
});
test('pure phantom: finite rip boundary and no post-rip samples', () => {
  const c = pure({
      omegaDE: 1,
      deModel: 'constant',
      w0: -1.5,
      endLogYears: 100,
    }),
    r = simulate(c);
  assert.equal(r.classification, 'Big Rip');
  const rip = r.events.find((e) => e.id === 'rip');
  assert.ok(rip);
  near(rip.logYears, Math.log10(4 / (3 * c.H0 * H0_YEAR)), 1e-7);
  assert.ok(r.samples.every((s) => s.logYears <= rip.logYears));
});
test('closed dust: resolves turnaround and contracting branch', () => {
  const c = pure({ omegaB: 2, omegaK: -1, endLogYears: 12 }),
    r = simulate(c);
  assert.ok(
    r.samples.some((s) => s.regime === 'contraction'),
    r.diagnostics.reason,
  );
  near(Math.max(...r.samples.map((s) => 10 ** s.logA!)), 2, 0.003);
  const turn = r.events.find((e) => e.id === 'turn');
  assert.ok(turn);
  near(10 ** turn.logYears * c.H0 * H0_YEAR, Math.PI / 2 + 1, 0.02);
  assert.ok(r.diagnostics.maxConstraintResidual < 1e-5);
});
test('negative Lambda: turn and crunch approach', () => {
  const c = pure({ omegaB: 1.1, omegaDE: -0.1, endLogYears: 12 }),
    r = simulate(c);
  assert.ok(r.samples.some((s) => s.regime === 'contraction'));
  near(Math.max(...r.samples.map((s) => 10 ** s.logA!)), 11 ** (1 / 3), 0.003);
});
test('closed positive Lambda is not automatically classified as eternal', () => {
  const r = simulate(
    pure({ omegaB: 2, omegaDE: 0.01, omegaK: -1.01, endLogYears: 6 }),
  );
  assert.ok(!r.classification.includes('de Sitter'));
});
test('extreme de Sitter: nested logs remain finite at 10^1000 yr', () => {
  const r = simulate({ ...defaultConfig(), endLogYears: 1000, samples: 60 });
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  near(r.samples.at(-1)!.logYears, 1000);
  assert.equal(r.samples.at(-1)!.logA, null);
  assert.ok(Number.isFinite(r.samples.at(-1)!.expansionIndex));
  assert.ok(!JSON.stringify(r).includes('NaN'));
});
test('matter-only extreme asymptote gives a~t^(2/3)', () => {
  const r = simulate(pure({ omegaB: 1, endLogYears: 1000 }));
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  const s = r.samples.at(-1)!;
  near(
    s.logA!,
    (2 / 3) * (1000 + Math.log10(1.5 * r.config.H0 * H0_YEAR)),
    1e-7,
  );
});
test('recollapse solver resolves a short requested endpoint', () => {
  const r = simulate(pure({ omegaB: 2, omegaK: -1, endLogYears: 6 }));
  near(r.samples.at(-1)!.logYears, 6, 1e-9);
  assert.ok(r.samples.length > 1);
});
test('constant w=-1 has the same classification as Lambda', () => {
  assert.equal(
    simulate(pure({ omegaDE: 1, deModel: 'constant', w0: -1, endLogYears: 10 }))
      .classification,
    'Asymptotic de Sitter expansion',
  );
});
test('output samples hit their target elapsed times to machine precision', () => {
  const c = { ...defaultConfig(), endLogYears: 12, samples: 50 },
    r = simulate(c);
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  const numerical = r.samples.filter(
    (s) => !s.isPresent && s.regime === 'numerical',
  );
  assert.ok(numerical.length >= 49);
  for (let i = 1; i < numerical.length; i++)
    assert.ok(numerical[i].logA! > numerical[i - 1].logA!);
  // Rerunning to a sample's own time reproduces its state.
  const probe = numerical[Math.floor(numerical.length / 2)];
  const direct = simulate({ ...c, endLogYears: probe.logYears, samples: 40 });
  near(direct.samples.at(-1)!.logA!, probe.logA!, 1e-12);
});
