import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LOG10_INV_PLANCK_M,
  LOG10_MPC_M,
  logDeSitterEntropy,
} from '../src/science/core/constants';
import { defaultConfig } from '../src/science/defaults';
import { simulate, validate } from '../src/science/engine';
import { createModel } from '../src/science/model/background';
import { initialSegment } from '../src/science/model/segment';
import { sampleExpansion } from '../src/science/solver/sampling';
import { sweep } from '../src/science/analysis';
import { runAnalysis } from '../src/science/dispatch';
import type { Configuration, Result } from '../src/science/types';
import { near, pure } from './helpers';
// Regression tests named after the verified audit findings they close.
const base = defaultConfig();
/** Samples ordered in time after exactly one leading present sample. */
function assertTimeline(r: Result) {
  assert.ok(r.samples[0].isPresent);
  assert.equal(r.samples.filter((s) => s.isPresent).length, 1);
  for (let i = 1; i < r.samples.length; i++) {
    assert.ok(r.samples[i].logYears >= 0);
    assert.ok(r.samples[i].logYears >= r.samples[i - 1].logYears);
  }
}
test('validate-unbounded-w0-crash: |w| beyond 10⁵ is a validation error, not a throw', () => {
  const cases: [Partial<Configuration>, 'w0' | 'wa'][] = [
    [{ deModel: 'constant', w0: 1e6 }, 'w0'],
    [{ deModel: 'constant', w0: -2e5 }, 'w0'],
    [{ deModel: 'bounded', w0: 3e5 }, 'w0'],
    [{ deModel: 'cpl', w0: 1e6 }, 'w0'],
    [{ deModel: 'bounded', w0: -1, wa: 2e5 }, 'wa'],
  ];
  for (const [patch, field] of cases) {
    const c = { ...base, ...patch };
    assert.ok(validate(c).fields[field], JSON.stringify(patch));
    assert.equal(simulate(c).status, 'invalid');
  }
  assert.equal(
    validate({ ...base, deModel: 'constant', w0: 1e5 }).errors.length,
    0,
  );
});
test('validate-unbounded-w0-crash: an output-sample failure ends the run as limited', () => {
  // Finite at every validation point, but undefined for 1.1 < a < 1.9,
  // which the partial step used to place the sample crosses.
  const c = {
    ...base,
    deModel: 'custom' as const,
    expression: '-1 + sqrt((a - 1.1) * (a - 1.9))',
  };
  assert.equal(validate(c).errors.length, 0);
  const model = createModel(c),
    segment = initialSegment(c);
  const y0 = [0, c.omegaR, Math.log(c.omegaDE), 0];
  const sampling = sampleExpansion(
    model,
    [
      { x: 0, y: y0, segment },
      { x: 1, y: [1, c.omegaR, Math.log(c.omegaDE), 0], segment },
    ],
    10,
  );
  // Samples before the undefined interval are kept; none is invented after.
  assert.ok(sampling.samples.length > 1);
  assert.ok(sampling.samples.length < c.samples + 1);
  assert.ok(sampling.samples.every((s) => s.logA! < Math.log10(1.1)));
  assert.match(sampling.failure!, /Equation undefined/);
  const r = simulate({ ...c, endLogYears: 12, samples: 40 });
  assert.equal(r.status, 'limited');
  assertTimeline(r);
  assert.equal(simulate(c, null).status, 'limited');
});
test('negative-logyears-on-early-failure: a run resolving less than a year reports only the present', () => {
  for (const c of [
    { ...base, dmModel: 'decay' as const, dmLogLifetime: 0, samples: 40 },
    { ...base, H0: 1e-6, dmModel: 'decay' as const, dmLogLifetime: 7 },
    { ...base, dmModel: 'annihilation' as const, annihilation: 1e12 },
  ]) {
    const r = simulate(c);
    assert.equal(r.status, 'limited');
    assert.equal(r.samples.length, 1);
    assertTimeline(r);
    assert.equal(r.diagnostics.numericalUntilLogYears, 0);
    assert.match(r.diagnostics.reason, /Less than one elapsed year/);
  }
});
test('first-step-failure-negative-times: exports never contain negative elapsed times', () => {
  const r = simulate({
    ...base,
    dmModel: 'decay',
    dmLogLifetime: 0,
    samples: 40,
  });
  assert.ok(!JSON.stringify(r).includes('-289'));
  assert.ok(r.samples.every((s) => s.logYears >= 0));
});
test('absent-de-still-gated-by-w: absent dark energy never evaluates or bounds w', () => {
  const eds = {
    ...base,
    omegaDE: 0,
    omegaDM: base.omegaDM + base.omegaDE,
    endLogYears: 30,
    samples: 40,
  };
  const lambda = simulate(eds),
    cpl = simulate({ ...eds, deModel: 'cpl', w0: -1, wa: 1 }),
    custom = simulate({ ...eds, deModel: 'custom', expression: '-1 + a' });
  for (const r of [cpl, custom]) {
    assert.equal(r.status, 'complete', r.diagnostics.reason);
    assert.equal(r.classification, lambda.classification);
    assert.deepEqual(
      r.samples.map((s) => [s.logA, s.q]),
      lambda.samples.map((s) => [s.logA, s.q]),
    );
  }
  assert.ok(lambda.samples.every((s) => s.w === null));
  // A vacuum removed by an intervention leaves the same absent law.
  const removed = simulate({
    ...base,
    deModel: 'cpl',
    w0: -1,
    wa: 1,
    sandbox: true,
    endLogYears: 30,
    events: [{ id: 'off', logTime: 5, action: 'vacuum-scale', value: 0 }],
  });
  assert.equal(removed.status, 'complete', removed.diagnostics.reason);
});
test('horizon-entropy-missing-G-factor: S is continuous across the tail after a change-G', () => {
  const r = simulate({
    ...base,
    sandbox: true,
    endLogYears: 20,
    events: [{ id: 'g', logTime: 10.5, action: 'change-G', value: 4 }],
  });
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  const i = r.samples.findIndex((s) => s.regime === 'asymptotic');
  const before = r.samples[i - 1],
    after = r.samples[i];
  assert.equal(before.logH, after.logH);
  near(before.logHorizonEntropy!, after.logHorizonEntropy!, 1e-12);
  // S = πR²c³/(ħ·gG) uses the coupling in force.
  near(
    after.logHorizonEntropy!,
    logDeSitterEntropy(after.logHubbleRadiusMpc!, 4),
    1e-12,
  );
});
test('horizon-entropy-g-discontinuity and entropy-g-path-mismatch: one helper serves both regimes', () => {
  const r = simulate({ ...base, endLogYears: 14 });
  for (const s of r.samples.filter((s) => s.logHorizonEntropy !== null))
    near(
      s.logHorizonEntropy!,
      logDeSitterEntropy(s.logHubbleRadiusMpc!, 1),
      1e-13,
    );
});
test('planck-length-constant-truncated and planck-length-truncated: CODATA 2018 constants', () => {
  // ħ = h/2π is exact in the 2019 SI; 1.054571817e-34 is its 10-digit print.
  const hbar = 6.62607015e-34 / (2 * Math.PI),
    G = 6.6743e-11,
    c = 299792458,
    Mpc = 3.085677581491367e22;
  near(LOG10_INV_PLANCK_M, -Math.log10(Math.sqrt((hbar * G) / c ** 3)), 1e-13);
  near(LOG10_MPC_M, Math.log10(Mpc), 1e-14);
  // S = π c⁵/(ħ G H²) for pure de Sitter with H = H₀.
  const H = (67.36 * 1000) / Mpc,
    direct = Math.log10((Math.PI * c ** 5) / (hbar * G * H * H));
  const r = simulate(pure({ omegaDE: 1, endLogYears: 8, samples: 40 }));
  near(r.samples[1].logHorizonEntropy!, direct, 1e-12);
});
test('unexecuted-events-change-solver and unexecuted-events-change-routing: only events that run choose the solver', () => {
  const dust = pure({ omegaB: 2, omegaK: -1, endLogYears: 12 });
  const plain = simulate(dust),
    later = simulate({
      ...dust,
      sandbox: true,
      events: [{ id: 'w', logTime: 500, action: 'change-w', value: -1 }],
    });
  assert.equal(later.classification, 'Big Crunch approach');
  assert.deepEqual(later.samples, plain.samples);
  assert.ok(later.events.some((e) => e.id === 'turn'));
  // The unexecuted event does not add the intervention note either.
  assert.equal(later.explanation, plain.explanation);
  const executed = simulate({
    ...dust,
    sandbox: true,
    events: [{ id: 'w', logTime: 5, action: 'change-w', value: -1 }],
  });
  assert.ok(!executed.samples.some((s) => s.regime === 'contraction'));
});
test('exact-minus-one-equality and bounded-futurew-roundoff-fake-rip: w₀+wₐ = −1 in decimal is de Sitter', () => {
  for (const [w0, wa] of [
    [-2.2, 1.2],
    [-1.4, 0.4],
    [-1.13, 0.13],
    [-2.7, 1.7],
    [-0.9, -0.1],
  ]) {
    const r = simulate({ ...base, deModel: 'bounded', w0, wa, samples: 40 });
    assert.equal(r.classification, 'Asymptotic de Sitter expansion', `${w0}`);
    assert.ok(r.samples.at(-1)!.logH! > 1);
  }
  const phantom = simulate({ ...base, deModel: 'bounded', w0: -1.2, wa: 0.19 });
  assert.equal(phantom.classification, 'Big Rip');
  const rows = sweep(
    { ...base, endLogYears: 100 },
    { w0Min: -1.5, w0Max: -0.5, waMin: -0.5, waMax: 0.5, resolution: 11 },
  );
  // Row j·11 + i holds w₀ index i and wₐ index j; w₀+wₐ = −1 when i+j = 10.
  for (let j = 0; j < 11; j++)
    assert.equal(
      rows[j * 11 + 10 - j].outcome,
      'Asymptotic de Sitter expansion',
      `${rows[j * 11 + 10 - j].w0}, ${rows[j * 11 + 10 - j].wa}`,
    );
});
test('exact-minus-one-equality: numerical horizon entropy uses an explicit de Sitter criterion', () => {
  const first = (rtol: number) =>
    simulate({ ...base, endLogYears: 11.5, rtol }).samples.findIndex(
      (s) => s.logHorizonEntropy !== null,
    );
  const index = first(1e-8);
  assert.ok(index > 0);
  assert.equal(first(1e-10), index);
  const r = simulate({ ...base, endLogYears: 11.5 });
  for (const s of r.samples)
    assert.equal(s.logHorizonEntropy !== null, 1 - s.omegaDE! <= 1e-8);
  // Only a vacuum with w = −1 has a de Sitter horizon entropy.
  const quintessence = simulate({ ...base, deModel: 'constant', w0: -0.99 });
  assert.ok(quintessence.samples.every((s) => s.logHorizonEntropy === null));
  // A law that reaches w = −1 has it once w(a) rounds to −1, so the last
  // numerical sample and the first tail sample agree.
  for (const patch of [
    { deModel: 'bounded', w0: -0.9, wa: -0.1 },
    { deModel: 'bounded', w0: -1.13, wa: 0.13 },
  ] as const) {
    const r = simulate({ ...base, ...patch });
    const i = r.samples.findIndex((s) => s.regime === 'asymptotic');
    const last = r.samples[i - 1],
      tail = r.samples[i];
    assert.notEqual(last.logHorizonEntropy, null, JSON.stringify(patch));
    near(
      last.logHorizonEntropy! - 2 * (tail.logH! - last.logH!),
      tail.logHorizonEntropy!,
      1e-9,
    );
  }
  const custom = simulate({
    ...base,
    deModel: 'custom',
    expression: '-1 - 0.05 * exp(-a)',
  });
  assert.notEqual(custom.samples.at(-1)!.logHorizonEntropy, null);
});
test('duplicate-event-ids and event-id-collisions: event ids are unique and never built-in ids', () => {
  const event = (id: string, logTime = 5) => ({
    id,
    logTime,
    action: 'change-w' as const,
    value: -1,
  });
  const errors = (...ids: string[]) =>
    validate({
      ...base,
      sandbox: true,
      events: ids.map((id, i) => event(id, 5 + i)),
    }).errors;
  assert.deepEqual(errors('w-switch', 'event-1'), []);
  assert.ok(errors('x', 'x').some((e) => e.includes('unique')));
  for (const id of ['rip', 'turn', 'bounce', 'crunch', 'vacuum', 'dark'])
    assert.ok(
      errors(id).some((e) => e.includes('reserved')),
      id,
    );
  for (const id of ['bh-10', 'cool-1e5', 'equality-2', 'equality'])
    assert.ok(
      errors(id).some((e) => e.includes('reserved')),
      id,
    );
  assert.ok(errors('').length);
  assert.ok(errors('x'.repeat(65)).length);
  assert.ok(errors('a\nb').length);
});
test('bh-title-mass-rounding: black-hole titles keep three significant figures', () => {
  const r = simulate({
    ...base,
    blackHoleMasses: [10, 14, 15],
    endLogYears: 80,
    samples: 40,
  });
  const titles = r.events
    .filter((e) => e.id.startsWith('bh-'))
    .map((e) => e.title.split(' ')[0]);
  assert.deepEqual(titles, ['1e+1', '1.4e+1', '1.5e+1']);
  const defaults = simulate({ ...base, samples: 40 }).events.filter((e) =>
    e.id.startsWith('bh-'),
  );
  assert.deepEqual(
    defaults.map((e) => e.title.split(' ')[0]),
    ['1e+1', '1e+5', '1e+9'],
  );
});
test('simulate accepts null options and non-object input without throwing', () => {
  assert.equal(
    simulate({ ...base, samples: 40, endLogYears: 8 }, null).status,
    'complete',
  );
  assert.equal(simulate(null as unknown as Configuration).status, 'invalid');
  assert.equal(simulate([] as unknown as Configuration).status, 'invalid');
});
test('simulate-deep-input: unclonable configurations are invalid, never a thrown error', () => {
  let deep: unknown = 0;
  for (let i = 0; i < 20000; i++) deep = [deep];
  const cyclic: Record<string, unknown> = { id: 'x' };
  cyclic.self = cyclic;
  // 40 levels of shared references write out as 2⁴⁰ JSON values; the check
  // must stop at its value budget instead of walking every path.
  let shared: unknown = 0;
  for (let i = 0; i < 40; i++) shared = { a: shared, b: shared };
  for (const patch of [
    { events: deep },
    { name: deep },
    { events: [cyclic] },
    { events: [shared] },
    { H0: BigInt(70) },
    { name: () => 'x' },
  ]) {
    const r = simulate({ ...base, ...patch } as unknown as Configuration);
    assert.equal(r.status, 'invalid');
    assert.match(r.errors[0], /cannot be read as JSON data/);
    assert.equal(r.samples.length, 0);
    // The result stays serializable and keeps the readable fields.
    assert.equal(JSON.parse(JSON.stringify(r)).config.omegaB, base.omegaB);
  }
  // The worker and API entry point completes partial input the same way.
  const viaWorker = runAnalysis('deterministic', {
    events: deep,
  } as unknown as Configuration) as Result;
  assert.equal(viaWorker.status, 'invalid');
  // Shallow nesting in an unknown event key is still accepted, unchanged.
  const extra = {
    ...base,
    sandbox: true,
    events: [
      { id: 'w', logTime: 5, action: 'change-w', value: -1, note: [[1]] },
    ],
  } as unknown as Configuration;
  const kept = simulate(extra);
  assert.equal(kept.status, 'complete');
  assert.deepEqual(kept.config.events, extra.events);
});
