import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BH_TEMPERATURE, cosmicEvents } from '../src/science/astrophysics';
import { H0_YEAR } from '../src/science/core/constants';
import { BudgetExceededError } from '../src/science/core/limits';
import { defaultConfig } from '../src/science/defaults';
import { simulate } from '../src/science/engine';
import { createModel } from '../src/science/model/background';
import { initialSegment } from '../src/science/model/segment';
import { locateExpansion, passages } from '../src/science/solver/crossings';
import { illinois, logSum, tailLogElapsed } from '../src/science/solver/locate';
import type { Configuration, Result } from '../src/science/types';
import { near, pure } from './helpers';
// Event times located on the continuous solution, against closed forms.
// Tolerance: at the default rtol = 10⁻⁸ the SciPy comparison bounds the
// global error of log₁₀ a by 8×10⁻¹¹; the locator itself stops at a 4ε
// bracket. 10⁻⁹ dex therefore leaves a tenfold margin.
const TOL = 1e-9;
const base = defaultConfig();
/** log₁₀ elapsed years of the dimensionless time τ = H₀Δt. */
const years = (tau: number) => Math.log10(tau / (base.H0 * H0_YEAR));
/** T_GH = ħH/(2πk_B) in kelvin with CODATA 2018 values; ħ = h/2π is exact. */
const gibbonsHawking = (H: number) =>
  ((6.62607015e-34 / (2 * Math.PI)) * H * 1e3) /
  3.085677581491367e22 /
  (2 * Math.PI * 1.380649e-23);
/** Scale factor at which the CMB equals the Hawking temperature of m M☉. */
const aStar = (m: number) => (base.Tcmb * m) / BH_TEMPERATURE;
function at(r: Result, id: string): number {
  const e = r.events.find((e) => e.id === id);
  assert.ok(e, `${id} missing among ${r.events.map((e) => e.id).join(' ')}`);
  return e.logYears;
}
/** Located events after the first year have an output sample at their time. */
function assertSampled(r: Result) {
  for (const e of r.events.filter((e) =>
    /^(equality|cool-|warm-|horizon-temperature)/.test(e.id),
  ))
    if (e.logYears > 0)
      assert.ok(
        r.samples.some((s) => s.logYears === e.logYears),
        `${e.id} has no sample`,
      );
}
test('equality in flat matter+Λ matches the sinh solution on every grid and endpoint', () => {
  // a³ = (Ωm/ΩΛ) sinh²(1.5√ΩΛ τ + asinh√(ΩΛ/Ωm)); equality where sinh = 1.
  const exact = years(
    (Math.asinh(1) - Math.asinh(Math.sqrt(0.3 / 0.7))) / (1.5 * Math.sqrt(0.3)),
  );
  const times: number[] = [];
  for (const samples of [40, 240, 1000])
    for (const endLogYears of [11, 100, 1000]) {
      const r = simulate(
        pure({ omegaB: 0.7, omegaDE: 0.3, samples, endLogYears }),
      );
      assert.equal(r.status, 'complete', r.diagnostics.reason);
      const t = at(r, 'equality');
      near(t, exact, TOL);
      times.push(t);
      const s = r.samples.find((s) => s.logYears === t)!;
      assert.ok(Math.abs(s.omegaM! - s.omegaDE!) < 1e-12);
      assertSampled(r);
    }
  // Independent of `samples` and the endpoint to the last bit.
  assert.ok(times.every((t) => t === times[0]));
});
test('CMB/Hawking crossings in flat ΛCDM match the sinh inversion, numerical and tail', () => {
  const tau = (a: number) =>
    (Math.asinh(Math.sqrt((0.7 * a ** 3) / 0.3)) -
      Math.asinh(Math.sqrt(0.7 / 0.3))) /
    (1.5 * Math.sqrt(0.7));
  // ln a* = 3.8, 24.5 and 38.3 lie in the numerical branch, 63.7 and 68.3
  // in the de Sitter tail beyond ln a = 60.
  const masses = [1e-6, 1e3, 1e9, 1e20, 1e22];
  const r = simulate(
    pure({
      omegaB: 0.3,
      omegaDE: 0.7,
      endLogYears: 100,
      blackHoleMasses: masses,
    }),
  );
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  for (const m of masses) near(at(r, `cool-${m}`), years(tau(aStar(m))), TOL);
  assertSampled(r);
});
test('matter-only crossings follow τ = (a^1.5 − 1)/1.5, also in the matter tail', () => {
  const masses = [1e-6, 1e3, 1e20];
  const r = simulate(
    pure({ omegaB: 1, endLogYears: 60, blackHoleMasses: masses }),
  );
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  assert.ok(r.diagnostics.numericalUntilLogYears < at(r, `cool-${1e20}`));
  for (const m of masses)
    near(at(r, `cool-${m}`), years((aStar(m) ** 1.5 - 1) / 1.5), TOL);
  assertSampled(r);
});
test('de Sitter crossings: Δτ = Δln a in the numerical branch and the tail', () => {
  const r = simulate(
    pure({ omegaDE: 1, endLogYears: 13, blackHoleMasses: [1e-6, 1e20] }),
  );
  for (const m of [1e-6, 1e20])
    near(at(r, `cool-${m}`), years(Math.log(aStar(m))), 1e-12);
  const t = at(r, 'horizon-temperature');
  near(t, years(Math.log(base.Tcmb / gibbonsHawking(base.H0))), 1e-12);
  const s = r.samples.find((s) => s.logYears === t)!;
  assert.equal(s.regime, 'asymptotic');
  assert.ok(Math.abs(s.logTcmb! - s.logHorizonTemperature!) < 1e-12);
  assertSampled(r);
});
test('closed dust: cycloid double crossing, and only a warm event for a hole hotter today', () => {
  // Ωm = 2, Ωk = −1: a = 1 − cos θ, τ = θ − sin θ − (π/2 − 1).
  const tau = (theta: number) => theta - Math.sin(theta) - (Math.PI / 2 - 1);
  const c = pure({
    omegaB: 2,
    omegaK: -1,
    endLogYears: 12,
    blackHoleMasses: [1e-8, 3e-8, 4e-8],
  });
  const r = simulate(c);
  assert.equal(r.classification, 'Big Crunch approach');
  assert.deepEqual(
    r.events.map((e) => e.id),
    [
      'cool-3e-8',
      'cool-4e-8',
      'turn',
      'warm-4e-8',
      'warm-3e-8',
      'warm-1e-8',
      'crunch',
    ],
  );
  for (const m of [3e-8, 4e-8]) {
    const theta = Math.acos(1 - aStar(m));
    near(at(r, `cool-${m}`), years(tau(theta)), TOL);
    near(at(r, `warm-${m}`), years(tau(2 * Math.PI - theta)), TOL);
  }
  // 10⁻⁸ M☉ is hotter than the CMB today; the collapse still reheats the CMB
  // above it at a* = 0.44.
  near(
    at(r, 'warm-1e-8'),
    years(tau(2 * Math.PI - Math.acos(1 - aStar(1e-8)))),
    TOL,
  );
  assertSampled(r);
  const short = simulate({ ...c, endLogYears: 11.5, samples: 400 });
  for (const id of ['cool-3e-8', 'warm-4e-8'])
    near(at(short, id), at(r, id), 1e-12);
});
test('repeated time-domain crossings are numbered and match an independent a″ solution', () => {
  // References: SciPy DOP853 (rtol 10⁻¹³) of a″ = −½a(M/a³ + (n−2)Ωde/aⁿ) in
  // τ = H₀t with events a = a* and ρm = ρde. At the default rtol = 10⁻⁸ the
  // engine's global error reaches 1.6×10⁻⁹ dex after the bounce (2×10⁻¹¹
  // at rtol = 10⁻¹⁰), so 5×10⁻⁹ dex.
  const cases: [Partial<Configuration>, [string, number][]][] = [
    [
      // Closed, negative stiff dark energy (w = 1): turnaround and bounce.
      {
        omegaB: 2,
        omegaDE: -0.05,
        deModel: 'constant',
        w0: 1,
        omegaK: -0.95,
        endLogYears: 11.2,
        blackHoleMasses: [3.4e-8, 1.1e-8],
      },
      [
        ['cool-3.4e-8', 9.969810043771],
        ['turn', 10.614895125223],
        ['warm-3.4e-8', 10.863745891066],
        ['warm-1.1e-8', 10.946552134273],
        ['bounce', 10.957536140532],
        ['cool-1.1e-8', 10.968249182631],
        ['cool-3.4e-8-2', 11.034625023749],
      ],
    ],
    [
      // Closed quintessence (w = −0.2): equality on expansion and collapse.
      {
        omegaB: 1,
        omegaDE: 0.9,
        deModel: 'constant',
        w0: -0.2,
        omegaK: -0.9,
        endLogYears: 12,
        blackHoleMasses: [3.4e-8, 5e-8],
      },
      [
        ['equality', 9.472935993099],
        ['cool-3.4e-8', 9.934271284265],
        ['cool-5e-8', 10.421278038662],
        ['turn', 10.939955796694],
        ['warm-5e-8', 11.169659130562],
        ['warm-3.4e-8', 11.219006531331],
        ['equality-2', 11.233513301362],
      ],
    ],
  ];
  for (const [patch, expected] of cases) {
    const r = simulate(pure(patch));
    assert.deepEqual(
      r.events
        .filter((e) => !['crunch', 'bh', 'dark'].includes(e.id.split('-')[0]))
        .map((e) => e.id),
      expected.map(([id]) => id),
    );
    for (const [id, t] of expected)
      assert.ok(Math.abs(at(r, id) - t) < 5e-9, `${id}: ${at(r, id)} vs ${t}`);
    assertSampled(r);
  }
});
test('events located before a failed reconstruction keep their samples', () => {
  // w(a) is undefined for 1.55757 < a < 1.55857: accepted steps pass, but a
  // later grid step lands in the gap after the crossing at a* = 1.02.
  const r = simulate({
    ...base,
    deModel: 'custom',
    expression: '-1 + sqrt((a - 1.55757) * (a - 1.55857))',
    blackHoleMasses: [2.3e-8, 10],
    endLogYears: 12,
    samples: 200,
  });
  assert.equal(r.status, 'limited');
  assert.match(r.diagnostics.reason, /reconstruction failed/);
  assert.ok(at(r, 'cool-2.3e-8') < r.samples.at(-1)!.logYears);
  assertSampled(r);
});
test('located events do not depend on the output grid or the endpoint', () => {
  const ids = [
    'cool-10',
    'cool-100000',
    'cool-1000000000',
    'horizon-temperature',
  ];
  const reference = simulate(base);
  for (const samples of [40, 1000])
    for (const endLogYears of [13, 1000]) {
      const r = simulate({ ...base, samples, endLogYears });
      for (const id of ids) near(at(r, id), at(reference, id), 1e-12);
      assertSampled(r);
    }
});
test('no crossing at the present: hot or evaporated holes and first-year crossings', () => {
  const r = simulate({ ...base, blackHoleMasses: [1e-8, 1e-23, 10] });
  const ids = r.events.map((e) => e.id);
  assert.ok(ids.includes('cool-10'));
  assert.ok(!ids.some((id) => /^(cool|warm)-1e-(8|23)/.test(id)));
  // a* − 1 = 10⁻¹² is reached within hours; shown at one year with a note.
  const m = (BH_TEMPERATURE / base.Tcmb) * (1 + 1e-12);
  const early = simulate({ ...base, blackHoleMasses: [m, 10] }).events.find(
    (e) => e.id === `cool-${m}`,
  )!;
  assert.equal(early.logYears, 0);
  assert.match(early.detail, /first elapsed year/);
  // Equal matter and vacuum densities today is no future equality.
  const today = simulate(pure({ omegaB: 0.5, omegaDE: 0.5 }));
  assert.ok(!today.events.some((e) => e.id.startsWith('equality')));
});
test('matter–dark-energy equality at an intervention is placed at its time', () => {
  const r = simulate(
    pure({
      omegaB: 0.7,
      omegaDE: 0.3,
      sandbox: true,
      events: [{ id: 'v', logTime: 9, action: 'vacuum-scale', value: 10 }],
    }),
  );
  near(at(r, 'equality'), 9, 1e-8);
  assert.equal(r.events.filter((e) => e.id.startsWith('equality')).length, 1);
});
test('the horizon-temperature crossing needs the de Sitter criterion where it occurs', () => {
  const hotter = (c: Partial<Configuration>) => simulate(pure(c));
  // Tγ,0 = 10⁻²⁰ K puts ln a_c = ln(Tγ,0/T_GH) = 22.05 in the numerical branch.
  const early = hotter({ omegaDE: 1, Tcmb: 1e-20, endLogYears: 12 });
  near(
    at(early, 'horizon-temperature'),
    years(Math.log(1e-20 / gibbonsHawking(base.H0))),
    1e-12,
  );
  // A G jump raises H and T_GH at once, in the numerical branch and the tail.
  for (const [Tcmb, x] of [
    [1e-20, 21.8],
    [base.Tcmb, 68.8],
  ]) {
    const jump = hotter({
      omegaDE: 1,
      Tcmb,
      endLogYears: 13,
      sandbox: true,
      events: [{ id: 'g', logTime: years(x), action: 'change-G', value: 4 }],
    });
    near(at(jump, 'horizon-temperature'), years(x), 1e-9);
  }
  // In ΛCDM with Tγ,0 = 10⁻²⁹ K the CMB falls below ħH/(2πk_B) while matter
  // still matters: no de Sitter temperature exists there, so no event.
  const cold = simulate({ ...base, Tcmb: 1e-29 });
  assert.ok(!cold.events.some((e) => e.id === 'horizon-temperature'));
  assert.ok(
    cold.samples.every(
      (s) =>
        s.logHorizonTemperature === null ||
        s.logTcmb! < s.logHorizonTemperature!,
    ),
  );
});
test('a G change in the tail moves later tail crossings to the new expansion rate', () => {
  // Pure de Sitter: τ = x until x = 62, then E = 2, so τ = 62 + (x* − 62)/2.
  const r = simulate(
    pure({
      omegaDE: 1,
      endLogYears: 13,
      blackHoleMasses: [1e20],
      sandbox: true,
      events: [{ id: 'g', logTime: years(62), action: 'change-G', value: 4 }],
    }),
  );
  near(
    at(r, `cool-${1e20}`),
    years(62 + (Math.log(aStar(1e20)) - 62) / 2),
    1e-9,
  );
});
test('files without located times fall back to real sign changes of the samples', () => {
  const r = simulate(
    pure({
      omegaB: 2,
      omegaK: -1,
      endLogYears: 12,
      blackHoleMasses: [1e-8, 3e-8],
    }),
  );
  const old = r.samples.map(({ logHorizonTemperature: _, ...s }) => s);
  const events = cosmicEvents(r.config, old, 12);
  const ids = events.map((e) => e.id);
  assert.deepEqual(
    ids.filter((id) => /^(cool|warm)/.test(id)),
    ['cool-3e-8', 'warm-3e-8', 'warm-1e-8'],
  );
  // Sample-quantized: never before the located time.
  for (const id of ['cool-3e-8', 'warm-3e-8'])
    assert.ok(events.find((e) => e.id === id)!.logYears >= at(r, id) - 1e-12);
  const lcdm = simulate(pure({ omegaB: 0.7, omegaDE: 0.3 }));
  const fallback = cosmicEvents(lcdm.config, lcdm.samples, 11);
  assert.ok(fallback.some((e) => e.id === 'equality'));
  assert.match(
    fallback.find((e) => e.id === 'equality')!.detail,
    /Numerically detected/,
  );
});
test('the root iteration reaches floating-point resolution in every branch', () => {
  let calls = 0;
  const cubic = (x: number) => {
    calls++;
    return x ** 3 - 0.001;
  };
  // Regula falsi alone stalls on this convex bracket; halving and bisection
  // still close it to 4ε.
  near(illinois(cubic, 0, cubic(0), 10, cubic(10)), 0.1, 1e-15);
  assert.ok(calls < 120);
  assert.equal(
    illinois((x) => x - 0.25, 0, -0.25, 1, 0.75),
    0.25,
  );
  assert.equal(
    illinois((x) => x, 0, 0, 1, 1),
    0,
  );
  assert.equal(
    illinois((x) => x - 1, 0, -1, 1, 0),
    1,
  );
  // Exact inversion of the tail laws, in log space.
  near(tailLogElapsed(2, 0, 0), Math.log10(2), 1e-15);
  near(tailLogElapsed(1, 1.5, 0), Math.log10(Math.expm1(1.5) / 1.5), 1e-15);
  near(
    tailLogElapsed(1, -0.75, 0),
    Math.log10(-Math.expm1(-0.75) / 0.75),
    1e-15,
  );
  near(tailLogElapsed(1000, 1.5, 0), 1500 / Math.LN10 - Math.log10(1.5), 1e-15);
  assert.equal(tailLogElapsed(0, 1, 0), -Infinity);
  near(logSum(1, 1), 1 + Math.log10(2), 1e-15);
  assert.equal(logSum(-Infinity, 3), 3);
  assert.equal(logSum(-Infinity, -Infinity), -Infinity);
});
test('a failed partial step loses only its own crossings, with a warning, and budgets rethrow', () => {
  // w(a) is undefined for 1.1 < a < 1.9, which the partial step to the
  // crossing at ln a* = 1.49 crosses; nodes themselves stay defined.
  const c: Configuration = {
    ...base,
    deModel: 'custom',
    expression: '-1 + sqrt((a - 1.1) * (a - 1.9))',
    blackHoleMasses: [1e-7, 1e20],
  };
  const model = createModel(c),
    segment = initialSegment(c),
    y = (tau: number) => [tau, c.omegaR, Math.log(c.omegaDE), 0];
  const found = locateExpansion(model, [
    { x: 0, y: y(0), segment },
    { x: 2, y: y(2), segment },
  ]);
  assert.deepEqual(found.events.cool, [[], []]);
  assert.equal(found.unresolved, 1);
  // A crossing beyond the branch follows from the tail law alone.
  assert.ok(Number.isNaN(found.pending.targets[0]));
  near(found.pending.targets[1], Math.log(aStar(1e20)), 1e-15);
  assert.equal(found.pending.horizonArmed, true);
  // In a full run, w undefined only within 10⁻⁵ of a* hides that crossing
  // but no later one: cool-10 equals the run without the gap, whose w has a
  // kink at a* instead.
  const at2 = aStar(2.3e-8);
  const run = (expression: string) =>
    simulate({
      ...base,
      deModel: 'custom',
      expression,
      blackHoleMasses: [2.3e-8, 10],
      endLogYears: 16,
    });
  const gap = run(
    `-1 + 0.1 * sqrt((a - ${at2 - 5e-6}) * (a - ${at2 + 5e-6})) / a`,
  );
  const kink = run(`-1 + 0.1 * abs(a - ${at2}) / a`);
  assert.ok(!gap.events.some((e) => e.id === 'cool-2.3e-8'));
  assert.ok(kink.events.some((e) => e.id === 'cool-2.3e-8'));
  near(at(gap, 'cool-10'), at(kink, 'cool-10'), 1e-10);
  assert.ok(
    gap.warnings.some((w) => /Event location skipped 1 accepted/.test(w)),
  );
  assertSampled(gap);
  const pts = [
    { u: 0, z: [1, 1] },
    { u: 1, z: [2, 0] },
  ];
  assert.deepEqual(
    passages(
      pts,
      () => {
        throw new Error('Scale factor reached zero.');
      },
      1.5,
    ),
    [],
  );
  assert.throws(
    () =>
      passages(
        pts,
        () => {
          throw new BudgetExceededError(2, 1);
        },
        1.5,
      ),
    BudgetExceededError,
  );
});
