import assert from 'node:assert/strict';
import { simulate, H0_YEAR, validate } from '../src/science/engine';
import { defaultConfig } from '../src/science/defaults';
import { compileExpression } from '../src/science/expression';
import {
  blackHoleFraction,
  blackHoleLifetime,
  survival,
} from '../src/science/astrophysics';
import { ensemble, cholesky, interpolate } from '../src/science/analysis';
import { csv, report } from '../src/science/report';
import type { Configuration } from '../src/science/types';
let failures = 0,
  count = 0;
function test(name: string, fn: () => void) {
  count++;
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}`, e);
  }
}
function near(a: number, b: number, tol = 1e-5) {
  assert.ok(
    Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)),
    `${a} != ${b} within ${tol}`,
  );
}
const pure = (patch: Partial<Configuration>) => ({
  ...defaultConfig(),
  omegaB: 0,
  omegaDM: 0,
  omegaNu: 0,
  omegaR: 0,
  omegaDE: 0,
  omegaK: 0,
  samples: 60,
  endLogYears: 11,
  ...patch,
});
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
test('decaying dark matter has conserved paired transfer and positive radiation', () => {
  const c = pure({
      omegaDM: 0.3,
      omegaDE: 0.7,
      dmModel: 'decay',
      dmLogLifetime: 10,
      endLogYears: 11,
    }),
    r = simulate(c);
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  for (const s of r.samples.slice(1)) {
    const tau = 10 ** (s.logYears - c.dmLogLifetime),
      expected = Math.log10(c.omegaDM) - 3 * s.logA! - tau / Math.LN10;
    near(s.logRhoDM!, expected, 3e-6);
    assert.ok(s.logRhoR !== null);
  }
});
test('zero daughter radiation is supported initially', () => {
  const r = simulate(
    pure({ omegaDM: 0.3, omegaDE: 0.7, dmModel: 'decay', dmLogLifetime: 12 }),
  );
  assert.notEqual(r.status, 'invalid');
  assert.ok(r.samples.at(-1)!.logRhoR !== null);
});
test('safe expressions support precedence and reject code', () => {
  near(compileExpression('-2^2 + a/2')(2), -3);
  near(compileExpression('-1 + 0.1*sin(log(a))')(1), -1);
  assert.throws(() => compileExpression('globalThis.process.exit()'));
  assert.throws(() => compileExpression('a; alert(1)'));
  assert.throws(() => compileExpression('sqrt(-1)')(1));
});
test('validation rejects invalid closure and negative matter', () => {
  assert.ok(validate({ ...defaultConfig(), omegaDM: -1 }).errors.length);
  assert.equal(simulate({ ...defaultConfig(), omegaDE: 0 }).status, 'invalid');
});
test('Hawking mass cubed scaling, half-mass time, stable remnants', () => {
  near(
    10 **
      (blackHoleLifetime(Math.log10(20)) - blackHoleLifetime(Math.log10(10))),
    8,
    1e-10,
  );
  const c = defaultConfig(),
    t = blackHoleLifetime(1) + Math.log10(7 / 8);
  near(blackHoleFraction(t, 10, c), 0.5, 1e-10);
  assert.ok(blackHoleFraction(100, 10, { ...c, evaporation: 'remnant' }) > 0);
  near(blackHoleFraction(100, 10, { ...c, evaporation: 'disabled' }), 1);
});
test('particle mean lifetime leaves exp(-1)', () => {
  near(survival(36, 36), Math.exp(-1), 1e-12);
});
test('recollapse solver resolves a short requested endpoint', () => {
  const r = simulate(pure({ omegaB: 2, omegaK: -1, endLogYears: 6 }));
  near(r.samples.at(-1)!.logYears, 6, 1e-9);
  assert.ok(r.samples.length > 1);
});
test('custom tail w switch matches density continuously and updates w', () => {
  const r = simulate({
    ...defaultConfig(),
    sandbox: true,
    events: [{ id: 'w', logTime: 13, action: 'change-w', value: -0.8 }],
    endLogYears: 14,
  });
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  const s = r.samples.at(-1)!;
  near(s.w!, -0.8, 1e-10);
  const at = r.samples.find((s) => s.logYears === 13)!;
  const delta = s.logA! - at.logA!;
  near(s.logRhoDE!, at.logRhoDE! - 0.6 * delta, 1e-7);
});
test('bounded model has conditional accelerated asymptote', () => {
  const r = simulate({
    ...defaultConfig(),
    deModel: 'bounded',
    w0: -0.9,
    wa: 0,
  });
  assert.equal(r.classification, 'Eternal accelerated power-law expansion');
});
test('nonstandard vacuum sign flip returns last valid state', () => {
  const r = simulate({
    ...defaultConfig(),
    sandbox: true,
    events: [
      { id: 'negative', logTime: 10, action: 'vacuum-scale', value: -10 },
    ],
  });
  assert.ok(r.status === 'terminated' || r.status === 'limited');
  assert.ok(r.samples.length > 0);
});
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
test('seeded vacuum clock and serialization are reproducible', () => {
  const c = {
      ...defaultConfig(),
      vacuumDecay: true,
      vacuumLogLifetime: 11,
      endLogYears: 12,
    },
    a = simulate(c),
    b = simulate(c);
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.samples, b.samples);
  const round = JSON.parse(JSON.stringify(a));
  assert.deepEqual(round.config, c);
  assert.ok(csv(a).startsWith('logYears,'));
  assert.ok(report(a).includes('## Limitations'));
});
test('custom events remain disabled by default and are not ignored', () => {
  const c = {
    ...defaultConfig(),
    events: [{ id: 'a', logTime: 40, action: 'halt' as const, value: 0 }],
  };
  assert.equal(simulate(c).status, 'invalid');
  const r = simulate({ ...c, sandbox: true });
  assert.equal(r.status, 'limited');
  assert.ok(r.events.some((e) => e.id === 'a'));
});
test('simultaneous tail events compose without losing previous changes', () => {
  const c = {
      ...defaultConfig(),
      sandbox: true,
      endLogYears: 14,
      events: [
        { id: 'g', logTime: 13, action: 'change-G' as const, value: 4 },
        { id: 'v', logTime: 13, action: 'vacuum-scale' as const, value: 9 },
      ],
    },
    r = simulate(c);
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  const at = r.samples.find((s) => s.logYears === 13)!,
    last = r.samples.at(-1)!;
  near(last.logH! - at.logH!, Math.log10(6), 1e-9);
  near(last.logRhoDE! - at.logRhoDE!, Math.log10(9), 1e-9);
});
test('a vacuum suppression that removes dominance stops explicitly', () => {
  const r = simulate({
    ...defaultConfig(),
    sandbox: true,
    endLogYears: 14,
    events: [{ id: 'v', logTime: 12.1, action: 'vacuum-scale', value: 1e-200 }],
  });
  assert.equal(r.status, 'limited');
  assert.ok(r.diagnostics.reason.includes('dominance'));
  assert.ok(r.samples.at(-1)!.logYears <= 12.1);
});
test('a stiff tail intervention cannot pretend dark energy stays dominant', () => {
  const r = simulate({
    ...defaultConfig(),
    sandbox: true,
    endLogYears: 1000,
    events: [{ id: 'w', logTime: 13, action: 'change-w', value: 1 }],
  });
  assert.equal(r.status, 'limited');
  assert.ok(r.diagnostics.reason.includes('overtake'));
});
test('decay tail matches elapsed donor survival across the numerical boundary', () => {
  const c = {
      ...defaultConfig(),
      dmModel: 'decay' as const,
      dmLogLifetime: 12,
      endLogYears: 13,
    },
    r = simulate(c);
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  for (const s of r.samples.filter((s) => s.regime === 'asymptotic'))
    near(
      s.logRhoDM!,
      Math.log10(c.omegaDM) - 3 * s.logA! - 10 ** (s.logYears - 12) / Math.LN10,
      1e-7,
    );
});
test('malformed imported arrays and booleans return explicit validation errors', () => {
  const c = {
    ...defaultConfig(),
    events: null,
    blackHoleMasses: null,
    protonDecay: 'true',
  } as unknown as Configuration;
  assert.equal(simulate(c).status, 'invalid');
});
test('constant w=-1 has the same classification as Lambda', () => {
  assert.equal(
    simulate(pure({ omegaDE: 1, deModel: 'constant', w0: -1, endLogYears: 10 }))
      .classification,
    'Asymptotic de Sitter expansion',
  );
});
test('unsupported tiny H0 and nonflat G interventions are explicit boundaries', () => {
  assert.equal(simulate({ ...defaultConfig(), H0: 1e-320 }).status, 'invalid');
  const r = simulate(
    pure({
      omegaK: 1,
      sandbox: true,
      events: [{ id: 'g', logTime: 6, action: 'change-G', value: 4 }],
    }),
  );
  assert.equal(r.status, 'limited');
  assert.ok(r.diagnostics.reason.includes('curved'));
});
test('custom events after the requested endpoint are never executed', () => {
  const r = simulate(
    pure({
      omegaDE: 1,
      endLogYears: 6,
      sandbox: true,
      events: [{ id: 'halt', logTime: 8, action: 'halt', value: 0 }],
    }),
  );
  assert.equal(r.status, 'complete');
  assert.ok(!r.events.some((e) => e.id === 'halt'));
  near(r.samples.at(-1)!.logYears, 6);
});
test('a later vacuum decay cannot overwrite an earlier Big Rip', () => {
  const r = simulate(
    pure({
      omegaDE: 1,
      deModel: 'constant',
      w0: -1.5,
      endLogYears: 100,
      vacuumDecay: true,
      vacuumLogLifetime: 10.34344224175,
    }),
  );
  assert.equal(r.classification, 'Big Rip');
  assert.ok(r.events.some((e) => e.id === 'rip'));
  assert.ok(!r.events.some((e) => e.id === 'vacuum'));
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
test('simultaneous numerical interventions share one time boundary', () => {
  const c = pure({ omegaDE: 1, endLogYears: 11 }),
    a = simulate(c),
    b = simulate({
      ...c,
      sandbox: true,
      events: [
        { id: 'g', logTime: 10, action: 'change-G', value: 4 },
        { id: 'v', logTime: 10, action: 'vacuum-scale', value: 0.25 },
      ],
    });
  assert.equal(b.status, 'complete', b.diagnostics.reason);
  near(b.samples.at(-1)!.logA!, a.samples.at(-1)!.logA!, 1e-7);
});
console.log(`${count - failures}/${count} scientific checks passed.`);
if (failures) process.exitCode = 1;
