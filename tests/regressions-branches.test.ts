import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interpolate } from '../src/science/analysis';
import { defaultConfig } from '../src/science/defaults';
import { simulate } from '../src/science/engine';
import type { Configuration, PhysicsEvent } from '../src/science/types';
import { near, pure } from './helpers';
// Regression tests for the tail, contraction and classification findings.
const base = defaultConfig();
const closedLCDM = { ...base, omegaK: -0.001, omegaDE: base.omegaDE + 0.001 };
test('closed-nonrecollapsing-limited: a closed model that never turns around keeps expanding', () => {
  const lambda = simulate(closedLCDM),
    bounded = simulate({ ...closedLCDM, deModel: 'bounded', w0: -1, wa: 0 });
  assert.equal(lambda.status, 'complete', lambda.diagnostics.reason);
  assert.equal(lambda.classification, 'Asymptotic de Sitter expansion');
  near(lambda.samples.at(-1)!.logYears, 100);
  assert.equal(bounded.classification, lambda.classification);
  assert.deepEqual(lambda.samples, bounded.samples);
  assert.equal(
    simulate({ ...closedLCDM, endLogYears: 11 }).classification,
    'Asymptotic de Sitter expansion',
  );
  assert.equal(
    simulate({ ...closedLCDM, deModel: 'constant', w0: -1.2 }).classification,
    'Big Rip',
  );
  // A loitering model still re-expands; closed dust and a closed model with
  // too little vacuum energy still recollapse.
  assert.equal(
    simulate(pure({ omegaB: 3, omegaDE: 0.2, omegaK: -2.2, endLogYears: 100 }))
      .classification,
    'Asymptotic de Sitter expansion',
  );
  for (const c of [
    pure({ omegaB: 2, omegaK: -1, endLogYears: 12 }),
    pure({ omegaB: 2, omegaDE: 0.01, omegaK: -1.01, endLogYears: 12 }),
  ]) {
    const r = simulate(c);
    assert.equal(r.classification, 'Big Crunch approach');
    assert.ok(r.events.some((e) => e.id === 'turn'));
  }
});
const stiff = pure({
  omegaB: 2,
  omegaDE: -0.05,
  omegaK: -0.95,
  deModel: 'constant',
  w0: 1,
  endLogYears: 12,
  samples: 400,
});
test('contraction-bounce-misclassified: a bounce is detected and classified as oscillation', () => {
  const r = simulate(stiff);
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  assert.equal(r.classification, 'Oscillating classical solution');
  const turn = r.events.find((e) => e.id === 'turn')!,
    bounce = r.events.find((e) => e.id === 'bounce')!;
  assert.ok(turn && bounce && bounce.logYears > turn.logYears);
  // The minimum after the bounce stays at a finite scale factor.
  const after = r.samples.filter((s) => s.logYears >= bounce.logYears);
  assert.ok(Math.min(...after.map((s) => s.logA!)) > Math.log10(0.2));
  assert.ok(r.diagnostics.maxConstraintResidual < 1e-5);
  // Longer endpoints end at the step budget, never with a crunch label.
  const long = simulate({ ...stiff, endLogYears: 100, samples: 60 });
  assert.equal(long.status, 'limited');
  assert.ok(long.events.some((e) => e.id === 'bounce'));
});
test('vacuum-filter-drops-last-sample: the final sample reaches the vacuum-decay time', () => {
  const r = simulate({
    ...base,
    vacuumDecay: true,
    vacuumLogLifetime: 10.5,
    samples: 97,
    seed: 44,
  });
  assert.equal(r.status, 'terminated');
  const event = r.events.find((e) => e.id === 'vacuum')!;
  assert.equal(r.samples.length, 98);
  near(r.samples.at(-1)!.logYears, event.logYears, 1e-12);
});
test('crunch-unresolved-sampling: the collapse and the Big Rip approach are resolved', () => {
  const c = {
    ...base,
    omegaB: 1.1,
    omegaDM: 0,
    omegaNu: 0,
    omegaR: 0,
    omegaDE: -0.1,
    samples: 100,
  };
  const r = simulate(c);
  assert.equal(r.classification, 'Big Crunch approach');
  assert.ok(r.samples.filter((s) => s.logA! < 0).length >= 20);
  for (const t of [10.883, 10.9107]) {
    const exact = simulate({ ...c, endLogYears: t }).samples.at(-1)!;
    assert.ok(
      Math.abs(interpolate(r, t)! - exact.expansionIndex) < 0.02,
      `${t}: ${interpolate(r, t)} vs ${exact.expansionIndex}`,
    );
  }
  const rip = simulate({
    ...base,
    deModel: 'constant',
    w0: -1.5,
    samples: 100,
  });
  assert.equal(rip.classification, 'Big Rip');
  const approach = rip.samples.filter((s) => s.logA! > 2 && s.logA! < 26);
  assert.ok(approach.length >= 20);
  for (let i = 2; i < rip.samples.length; i++)
    assert.ok(rip.samples[i].logA! >= rip.samples[i - 1].logA!);
});
test('endpoint-dependent-classification: finite and tail runs share one asymptote', () => {
  const name = (patch: Partial<Configuration>, endLogYears: number) =>
    simulate({ ...base, ...patch, endLogYears, samples: 40 }).classification;
  for (const [patch, expected] of [
    [{ deModel: 'constant', w0: 0.5 }, 'Long-lived decelerating expansion'],
    [{ deModel: 'constant', w0: 0 }, 'Long-lived decelerating expansion'],
    [{ deModel: 'bounded', w0: -1, wa: 0 }, 'Asymptotic de Sitter expansion'],
    [
      { deModel: 'bounded', w0: -0.9, wa: -0.1 },
      'Asymptotic de Sitter expansion',
    ],
  ] as const)
    for (const end of [11, 13, 100])
      assert.equal(
        name(patch, end),
        expected,
        `${JSON.stringify(patch)} ${end}`,
      );
  // Rejections name their actual cause.
  const custom = simulate({
    ...base,
    deModel: 'custom',
    expression: '-1 + 0.05 * tanh(log(a))',
    samples: 40,
  });
  assert.match(custom.diagnostics.reason, /CPL\/custom/);
  const transfer = simulate({
    ...base,
    omegaDE: 0,
    omegaDM: base.omegaDM + base.omegaDE,
    dmModel: 'decay',
  });
  assert.equal(transfer.status, 'limited');
  assert.match(transfer.diagnostics.reason, /exchanges energy/);
});
test('coasting-mislabeled-decelerating: n = 2 asymptotes are coasting', () => {
  for (const c of [
    pure({ omegaB: 0.3, omegaK: 0.7, endLogYears: 100 }),
    pure({ omegaK: 1, endLogYears: 100 }),
    pure({
      omegaB: 0.3,
      omegaDE: 0.7,
      deModel: 'constant',
      w0: -1 / 3,
      endLogYears: 100,
    }),
    pure({ omegaB: 0.3, omegaK: 0.7, endLogYears: 11 }),
  ]) {
    const r = simulate(c);
    assert.equal(r.classification, 'Coasting expansion');
    assert.match(r.explanation, /in proportion to time/);
  }
  const last = simulate(pure({ omegaK: 1, endLogYears: 100 })).samples.at(-1)!;
  assert.equal(last.q, 0);
});
test('tail-changew-stale-explanation: the explanation follows the law after a tail change-w', () => {
  const run = (value: number) =>
    simulate({
      ...base,
      sandbox: true,
      events: [{ id: 'w', logTime: 50, action: 'change-w', value }],
    });
  const rip = run(-1.5),
    power = run(-0.5);
  assert.equal(rip.classification, 'Big Rip');
  assert.match(rip.explanation, /changed the asymptotic law/);
  assert.match(rip.explanation, /finite model singularity/);
  assert.equal(power.classification, 'Custom / nonstandard evolution');
  assert.match(power.explanation, /proven constant-fluid power law/);
  assert.doesNotMatch(power.explanation, /H tends to a constant/);
});
test('contraction-negative-turn-logyears: a turnaround within the first year never has negative time', () => {
  const r = simulate(
    pure({ omegaB: 1e10 + 1, omegaDE: -1e10, endLogYears: 12 }),
  );
  const turn = r.events.find((e) => e.id === 'turn')!;
  assert.equal(turn.logYears, 0);
  assert.match(turn.detail, /first elapsed year/);
  assert.ok(r.samples[0].isPresent);
  for (let i = 1; i < r.samples.length; i++) {
    assert.ok(!r.samples[i].isPresent && r.samples[i].logYears >= 0);
    assert.ok(r.samples[i].logYears >= r.samples[i - 1].logYears);
  }
  assert.ok(r.diagnostics.numericalUntilLogYears >= 0);
});
test('tail-intervention-status-inconsistent: interventions stop alike in both regimes', () => {
  const run = (
    action: PhysicsEvent['action'],
    value: number,
    logTime: number,
  ) =>
    simulate({
      ...base,
      sandbox: true,
      samples: 40,
      events: [{ id: 'e', logTime, action, value }],
    });
  for (const [action, value] of [
    ['halt', 0],
    ['reverse', 0],
    ['change-G', 0],
    ['vacuum-scale', -1],
  ] as const) {
    const early = run(action, value, 11),
      late = run(action, value, 50);
    assert.equal(early.status, 'terminated', action);
    assert.equal(late.status, 'terminated', action);
    assert.equal(late.classification, 'Custom intervention boundary');
    assert.equal(early.classification, 'Custom intervention boundary');
    if (action !== 'vacuum-scale')
      assert.equal(late.diagnostics.reason, early.diagnostics.reason);
  }
  const lifetime = run('dm-lifetime', 5, 50);
  assert.equal(lifetime.status, 'limited');
  assert.match(lifetime.diagnostics.reason, /already active decay/);
});
test('contraction-radT-nonnull-without-radiation and contraction-effective-T-without-radiation', () => {
  const dust = simulate(pure({ omegaB: 2, omegaK: -1, endLogYears: 12 }));
  assert.ok(dust.samples.every((s) => s.logRadiationEffectiveT === null));
  assert.ok(dust.samples.every((s) => s.w === null));
  const radiation = simulate(
    pure({ omegaB: 1.5, omegaR: 0.1, omegaK: -0.6, endLogYears: 12 }),
  );
  for (const s of radiation.samples)
    near(s.logRadiationEffectiveT!, Math.log10(2.7255) - s.logA!, 1e-12);
});
test('loose tolerances on the time-domain branch are reported as constraint drift', () => {
  const r = simulate(
    pure({ omegaB: 2, omegaK: -1, endLogYears: 12, rtol: 1e-3, atol: 1e-5 }),
  );
  assert.equal(r.status, 'limited');
  assert.ok(r.diagnostics.maxConstraintResidual > 1e-4);
  assert.match(r.diagnostics.reason, /constraint drift/);
});
