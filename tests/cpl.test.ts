import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LITERAL_CPL } from '../src/science/classify';
import { H0_YEAR } from '../src/science/core/constants';
import { defaultConfig } from '../src/science/defaults';
import { simulate, validate } from '../src/science/engine';
import { report } from '../src/science/report';
import type { Background } from '../src/science/model/background';
import {
  cplLogDensity,
  cplTheorem,
  extinctionEvent,
} from '../src/science/model/cpl';
import type { Segment } from '../src/science/model/segment';
import type { Configuration, Result } from '../src/science/types';
// Independent closed forms of the CPL law w(a) = w₀ + wₐ(1 − a) with stable
// fluids: ln(ρde/ρc,0) = ln Ωde − 3[(1 + w₀ + wₐ)x − wₐ(eˣ − 1)], x = ln a.
const desi = { ...defaultConfig('desi2026'), samples: 60 };
const lnDE = (c: Configuration, x: number) =>
  Math.log(c.omegaDE) - 3 * ((1 + c.w0 + c.wa) * x - c.wa * Math.expm1(x));
/** ln E² of matter, radiation, curvature and the CPL density at x. */
function lnE2(c: Configuration, x: number) {
  const m = c.omegaB + c.omegaDM + c.omegaNu,
    terms = [Math.log(m) - 3 * x, Math.log(c.omegaR) - 4 * x, lnDE(c, x)];
  const top = Math.max(...terms);
  const sum =
    terms.reduce((s, t) => s + Math.exp(t - top), 0) +
    c.omegaK * Math.exp(-2 * x - top);
  return top + Math.log(sum);
}
/** Composite Simpson rule with n (even) panels, independent of the engine. */
function simpson(f: (x: number) => number, a: number, b: number, n: number) {
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}
const tau = (r: Result, logYears: number) =>
  10 ** logYears * r.config.H0 * H0_YEAR;
const event = (r: Result, id: string) => r.events.find((e) => e.id === id);
test('the integrated ln ρde follows the closed-form CPL density', () => {
  // The state integrates d ln ρde/dx = −3(1 + w); its local error scale is
  // rtol·|ln ρde| (|ln ρde| < 60 here), so 10⁻⁹ dex at rtol 10⁻⁸.
  for (const [rtol, atol, tolerance] of [
    [1e-8, 1e-11, 1e-9],
    [1e-12, 1e-14, 1e-12],
  ]) {
    const r = simulate({ ...desi, rtol, atol });
    let checked = 0;
    for (const s of r.samples)
      if (s.regime === 'numerical' && s.logRhoDE !== null) {
        const x = s.logA! * Math.LN10;
        assert.ok(
          Math.abs(s.logRhoDE - lnDE(r.config, x) / Math.LN10) <= tolerance,
          `${rtol} at ${s.logYears}`,
        );
        checked++;
      }
    assert.ok(checked >= 10);
  }
});
test('extinction: the DESI 2026 dark energy is dropped where w ≥ 1/3 and |Ωde|(1+3w) < 10⁻²⁰', () => {
  const r = simulate(desi);
  const c = r.config;
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  assert.equal(
    r.classification,
    `Long-lived decelerating expansion · ${LITERAL_CPL}`,
  );
  assert.match(r.explanation, /^Literal extrapolation .* not a prediction\./);
  const proof = r.derived!.cplContinuation!;
  assert.equal(proof.theorem, 'extinction');
  assert.equal(proof.ripLogYears, null);
  assert.equal(proof.threshold, 1e-20);
  const a = 10 ** proof.logA;
  assert.ok(Math.abs(proof.w - (c.w0 + c.wa * (1 - a))) <= 1e-10);
  assert.ok(proof.w >= 1 / 3 && proof.omegaDE * (1 + 3 * proof.w) < 1e-20);
  // The fraction agrees with the closed form at the rtol level of ln ρde.
  const x = proof.logA * Math.LN10;
  assert.ok(
    Math.abs(Math.log(proof.omegaDE) - (lnDE(c, x) - lnE2(c, x))) < 1e-8,
  );
  const drop = event(r, 'de-extinct')!;
  assert.equal(drop.logYears, proof.logYears);
  assert.match(drop.detail, /not a prediction/);
  // The state that proved it keeps its sample; afterwards dark energy is
  // absent. Its omitted term in q, ½(1+3w)Ωde, stays below
  // ε(1.02 + 0.52√K)/2 with K = 3|wₐ|a at the drop (methodology).
  const bound = 0.5e-20 * (1.02 + 0.52 * Math.sqrt(3 * Math.abs(c.wa) * a));
  const at = r.samples.findIndex((s) => s.logYears === drop.logYears);
  assert.ok(r.samples[at].omegaDE! > 0 && r.samples[at].w! >= 1 / 3);
  for (const s of r.samples.slice(at + 1)) {
    assert.ok(s.omegaDE === 0 && s.w === null && s.logRhoDE === null);
    if (s.regime !== 'numerical') continue;
    const y = s.logA! * Math.LN10;
    const omitted =
      0.5 *
      (1 + 3 * (c.w0 + c.wa * (1 - Math.exp(y)))) *
      Math.exp(lnDE(c, y) - lnE2(c, y));
    assert.ok(omitted <= bound, `${s.logYears}: ${omitted}`);
  }
  assert.match(report(r), /CPL dark energy is dropped at 10\^12\.\d{3} yr/);
});
test('extinction: τ(a) through the drop and the matter tail matches an independent quadrature', () => {
  // |Δlog₁₀a| at fixed τ, to first order Δln τ·τE/ln 10; the numerical
  // branch carries the rtol = 10⁻⁸ integration error (5×10⁻¹⁰ measured).
  const r = simulate(desi);
  let x0 = 0,
    reference = 0,
    worst = 0,
    tail = 0;
  const f = (x: number) => Math.exp(-0.5 * lnE2(r.config, x));
  for (const s of r.samples.slice(1)) {
    const x = s.logA! * Math.LN10;
    reference += simpson(f, x0, x, 2000);
    x0 = x;
    const error = Math.log(tau(r, s.logYears) / reference) / (f(x) / reference);
    worst = Math.max(worst, Math.abs(error) / Math.LN10);
    if (s.regime === 'asymptotic') tail++;
  }
  assert.ok(worst < 1e-9, `${worst}`);
  assert.ok(tail > 40);
});
test('extinction threshold 10⁻²⁰ or 10⁻³⁰: the same universe', () => {
  for (const patch of [
    { endLogYears: 30 },
    { endLogYears: 30, rtol: 1e-12, atol: 1e-14 },
    { endLogYears: 100 },
  ]) {
    const run = (extinctionThreshold: number) =>
      simulate({ ...desi, ...patch }, { extinctionThreshold });
    const a = run(1e-20),
      b = run(1e-30);
    assert.equal(a.classification, b.classification);
    assert.equal(a.explanation, b.explanation);
    assert.equal(a.status, b.status);
    assert.ok(
      event(b, 'de-extinct')!.logYears > event(a, 'de-extinct')!.logYears,
    );
    const other = new Map(b.samples.slice(1).map((s) => [s.logYears, s]));
    let common = 0;
    for (const s of a.samples.slice(1)) {
      const o = other.get(s.logYears);
      if (!o) continue;
      common++;
      for (const k of ['logA', 'logH', 'q', 'logRhoDM'] as const)
        assert.ok(Math.abs(s[k]! - o[k]!) <= 1e-12, `${k} ${s.logYears}`);
    }
    assert.ok(common >= 60);
  }
  // Out-of-range thresholds fall back to the default.
  const fallback = simulate(desi, { extinctionThreshold: 0.5 });
  assert.equal(fallback.derived!.cplContinuation!.threshold, 1e-20);
});
test('Big Rip: CPL with wₐ > 0 ends at the quadrature time of the closed-form law', () => {
  // SciPy quad of ∫dx/E on the DESI preset: 25.91587990 and 23.34862819 Gyr.
  for (const [w0, wa, gyr] of [
    [-0.9, 0.3, 25.9158799],
    [-1.1, 0.2, 23.34862819],
  ]) {
    for (const [rtol, atol, tolerance] of [
      [1e-8, 1e-11, 1e-9],
      [1e-12, 1e-14, 1e-12],
    ]) {
      const r = simulate({ ...desi, w0, wa, rtol, atol });
      assert.equal(r.status, 'terminated');
      assert.equal(r.classification, `Big Rip · ${LITERAL_CPL}`);
      const rip = event(r, 'rip')!;
      assert.equal(r.derived!.cplContinuation!.ripLogYears, rip.logYears);
      assert.equal(r.derived!.cplContinuation!.theorem, 'big-rip');
      const f = (x: number) => Math.exp(-0.5 * lnE2(r.config, x));
      assert.ok(f(8) < 1e-300);
      const exact = simpson(f, 0, 8, 160000);
      assert.ok(Math.abs(tau(r, rip.logYears) / exact - 1) < tolerance);
      assert.ok(Math.abs(10 ** rip.logYears / 1e9 / gyr - 1) < 1e-8);
      // Samples: strictly before the rip, each at its own quadrature time.
      let previous = -1;
      for (const s of r.samples.slice(1)) {
        assert.ok(s.logYears > previous && s.logYears < rip.logYears);
        previous = s.logYears;
        const t = simpson(f, 0, s.logA! * Math.LN10, 40000);
        assert.ok(Math.abs(tau(r, s.logYears) / t - 1) < 20 * tolerance);
      }
      const continued = r.samples.filter((s) => s.regime === 'asymptotic');
      assert.ok(continued.length >= 15);
      for (let i = 1; i < continued.length; i++)
        assert.ok(
          continued[i].logH! > continued[i - 1].logH! &&
            continued[i].w! < continued[i - 1].w!,
        );
    }
  }
});
test('Big Rip: the closed-form continuation is exact for warm dark matter and curvature', () => {
  // Warm dark matter keeps its constant exponent 3(1 + w_dm), so the rip
  // time is ∫dx/E of stable fluids with that exponent; SciPy quad gives
  // 26.12209544 Gyr (warm, w_dm = 1/3) and 22.79643851 Gyr (open, Ωk = 0.1).
  for (const [patch, gyr] of [
    [{ dmModel: 'warm', warmW: 1 / 3 }, 26.12209544],
    [
      { omegaK: 0.1, omegaDE: desi.omegaDE - 0.1, w0: -0.95, wa: 0.4 },
      22.79643851,
    ],
  ] as const) {
    const r = simulate({ ...desi, w0: -0.9, wa: 0.3, ...patch });
    const c = r.config;
    const warm = c.dmModel === 'warm' ? c.warmW : 0;
    const f = (x: number) =>
      1 /
      Math.sqrt(
        (c.omegaB + c.omegaNu) * Math.exp(-3 * x) +
          c.omegaDM * Math.exp(-3 * (1 + warm) * x) +
          c.omegaR * Math.exp(-4 * x) +
          c.omegaK * Math.exp(-2 * x) +
          Math.exp(lnDE(c, x)),
      );
    assert.ok(f(8) < 1e-300);
    const rip = event(r, 'rip')!;
    // rtol = 10⁻⁸ gives 10⁻¹⁰ and 10⁻¹¹ relative (measured).
    assert.ok(
      Math.abs(tau(r, rip.logYears) / simpson(f, 0, 8, 160000) - 1) < 1e-9,
    );
    assert.ok(Math.abs(10 ** rip.logYears / 1e9 / gyr - 1) < 1e-8);
  }
});
test('CPL with wₐ = 0 is the constant-w law bit for bit', () => {
  // Everything but the configuration and its metadata (hash, timestamp).
  const strip = (r: Result) => ({
    ...r,
    config: null,
    metadata: { ...r.metadata, configurationHash: null },
  });
  for (const w0 of [-0.9, -1, -1.2, 0.2])
    for (const patch of [
      {},
      { omegaK: -0.01, omegaDE: desi.omegaDE + 0.01 },
      { omegaDE: -0.1, omegaK: desi.omegaDE + 0.1 },
    ]) {
      const run = (deModel: 'cpl' | 'constant') =>
        simulate(
          { ...desi, ...patch, deModel, w0, wa: 0 },
          { timestamp: 'fixed' },
        );
      const cpl = run('cpl'),
        constant = run('constant');
      assert.deepEqual(strip(cpl), strip(constant), `${w0}`);
      assert.equal(cpl.derived!.cplContinuation, undefined);
    }
});
test('closed CPL with wₐ < 0 recollapses in proper time with the closed-form density', () => {
  for (const omegaK of [-0.001, -0.01]) {
    const r = simulate({ ...desi, omegaK, omegaDE: desi.omegaDE - omegaK });
    const c = r.config;
    assert.equal(r.status, 'terminated', r.diagnostics.reason);
    assert.equal(r.classification, `Big Crunch approach · ${LITERAL_CPL}`);
    assert.match(r.explanation, /returns on the contracting branch/);
    assert.ok(r.diagnostics.maxConstraintResidual < 1e-6);
    assert.equal(r.derived!.cplContinuation, null);
    // The dark energy returns during the collapse: ρm = ρde twice more.
    const ids = r.events.map((e) => e.id);
    for (const id of ['equality', 'turn', 'equality-2', 'equality-3', 'crunch'])
      assert.ok(ids.includes(id), id);
    // Turnaround: E²(x_t) = 0; τ = ∫₀^{x_t} dx/E with x = x_t − s².
    const E2 = (x: number) =>
      (c.omegaB + c.omegaDM + c.omegaNu) * Math.exp(-3 * x) +
      c.omegaR * Math.exp(-4 * x) +
      Math.exp(lnDE(c, x)) +
      c.omegaK * Math.exp(-2 * x);
    let lo = 1,
      hi = 12;
    for (let k = 0; k < 200; k++) {
      const mid = 0.5 * (lo + hi);
      if (E2(mid) > 0) lo = mid;
      else hi = mid;
    }
    const xt = lo,
      slope = (E2(xt + 1e-6) - E2(xt - 1e-6)) / 2e-6,
      S = Math.sqrt(xt);
    const turn = simpson(
      (s) =>
        s < 1e-6 ? 2 / Math.sqrt(-slope) : (2 * s) / Math.sqrt(E2(xt - s * s)),
      0,
      S,
      400000,
    );
    // The proper-time branch carries its constraint drift, ~10⁻⁸ at rtol
    // 10⁻⁸, into the turnaround time (2×10⁻⁹ dex measured).
    const found = event(r, 'turn')!.logYears;
    assert.ok(Math.abs(found - Math.log10(turn / (c.H0 * H0_YEAR))) < 1e-8);
  }
  // Other dark matter or custom events: stopped at the extinction instead.
  const halt: Configuration['events'] = [
    { id: 'h', logTime: 50, action: 'halt', value: 0 },
  ];
  for (const patch of [
    { dmModel: 'decay', dmLogLifetime: 20 },
    { sandbox: true, events: halt },
  ] satisfies Partial<Configuration>[]) {
    const r = simulate({
      ...desi,
      omegaK: -0.001,
      omegaDE: desi.omegaDE + 0.001,
      ...patch,
    });
    assert.equal(r.status, 'limited');
    assert.match(r.diagnostics.reason, /grows back/);
    assert.equal(event(r, 'de-extinct'), undefined);
  }
});
test('the proofs apply only to pure CPL segments', () => {
  // A change of w or of the vacuum density voids both theorems.
  for (const action of ['change-w', 'vacuum-scale'] as const) {
    const r = simulate({
      ...desi,
      sandbox: true,
      events: [{ id: 'e', logTime: 40, action, value: 2 }],
    });
    assert.equal(r.derived!.cplContinuation, null);
    assert.equal(event(r, 'de-extinct'), undefined);
  }
  // A pending intervention defers the rip proof until it has executed.
  const g = simulate({
    ...desi,
    w0: -0.9,
    wa: 0.3,
    sandbox: true,
    events: [{ id: 'g', logTime: 10.41356, action: 'change-G', value: 2 }],
  });
  assert.equal(g.classification, `Big Rip · ${LITERAL_CPL}`);
  assert.ok(g.derived!.cplContinuation!.logYears >= 10.41356 - 1e-8);
  // Samples that would exceed |w| = 10⁵ stop with a warning; the rip stands.
  const steep = simulate({ ...desi, w0: -99990, wa: 1e5 });
  assert.equal(steep.status, 'terminated');
  assert.ok(steep.warnings.some((w) => /stop at .* unaffected/.test(w)));
  assert.match(report(steep), /finite-time Big Rip at 10\^5\.\d{6} yr/);
});
test('validation: CPL warnings and the reserved extinction id', () => {
  assert.ok(
    validate(desi).warnings.some((w) => /literal .* not a prediction/.test(w)),
  );
  assert.ok(!validate({ ...desi, wa: 0 }).warnings.some((w) => /CPL/.test(w)));
  const reserved = validate({
    ...desi,
    sandbox: true,
    events: [{ id: 'de-extinct', logTime: 5, action: 'halt', value: 0 }],
  });
  assert.ok(reserved.errors.some((e) => /reserved/.test(e)));
});
test('the theorem conditions of an accepted CPL state', () => {
  const segment = (patch: Partial<Segment>): Segment => ({
    g: 1,
    signDE: 1,
    deModel: 'cpl',
    w0: -0.9,
    wa: -0.3,
    ...patch,
  });
  const state = (w: number, fractions: number[]) =>
    ({ w, fractions }) as unknown as Background;
  const dead = [1, 0, 0, 1e-22, 0];
  assert.equal(cplTheorem(state(0.5, dead), segment({})), 'extinction');
  // |Ωde|(1+3w) must be below ε, and w at least 1/3.
  assert.equal(cplTheorem(state(40, dead), segment({})), null);
  assert.equal(cplTheorem(state(0.3, dead), segment({})), null);
  assert.equal(cplTheorem(state(40, dead), segment({}), 1e-18), 'extinction');
  // A negative dark energy is dropped alike, but never rips.
  const negative = [1, 0, 0, -1e-22, 0];
  assert.equal(
    cplTheorem(state(0.5, negative), segment({ signDE: -1 })),
    'extinction',
  );
  const phantom = [4e-9, 3e-9, 0, 1 - 8e-9, 1e-9];
  assert.equal(cplTheorem(state(-1, phantom), segment({ wa: 0.3 })), 'big-rip');
  assert.equal(
    cplTheorem(state(-1, phantom), segment({ wa: 0.3, signDE: -1 })),
    null,
  );
  assert.equal(cplTheorem(state(-0.99, phantom), segment({ wa: 0.3 })), null);
  const contaminated = [2e-8, 0, 0, 1 - 2e-8, 0];
  assert.equal(cplTheorem(state(-2, contaminated), segment({ wa: 0.3 })), null);
  // Only a present CPL law qualifies.
  assert.equal(cplTheorem(state(0.5, dead), segment({ signDE: 0 })), null);
  assert.equal(
    cplTheorem(state(0.5, dead), segment({ deModel: 'bounded' })),
    null,
  );
  assert.equal(cplLogDensity(0.7, 0.7, -3, segment({})), -3);
  // An extinction inside the first year is shown at one year.
  const early = extinctionEvent(-2, 1.0001, 5, 1e-30);
  assert.equal(early.logYears, 0);
  assert.match(early.detail, /first elapsed year/);
});
test('Big Rip beyond the endpoint, transfer models, crossings and work counting', () => {
  const rip = { ...desi, w0: -0.9, wa: 0.3 };
  // The proof holds before the endpoint; the rip lies after it.
  const early = simulate({ ...rip, endLogYears: 10.4134 });
  assert.equal(early.status, 'complete');
  assert.equal(early.classification, `Big Rip · ${LITERAL_CPL}`);
  assert.match(early.explanation, /after the selected endpoint/);
  assert.equal(event(early, 'rip'), undefined);
  const late = early.derived!.cplContinuation!.ripLogYears!;
  assert.ok(late > 10.4134);
  assert.equal(early.samples.at(-1)!.logYears, 10.4134);
  // A run that ends before the proof applies is not classified by it.
  const before = simulate({ ...rip, endLogYears: 10.4 });
  assert.equal(before.derived!.cplContinuation, null);
  assert.equal(before.classification, 'Undetermined with current physics');
  // Transfer models continue without detailed daughter radiation.
  const decay = simulate({ ...rip, dmModel: 'decay', dmLogLifetime: 10 });
  assert.equal(decay.status, 'terminated');
  const continued = decay.samples.filter((s) => s.regime === 'asymptotic');
  assert.ok(continued.length > 10);
  assert.ok(continued.every((s) => s.logRhoR === null && s.logRhoDM !== null));
  // A hole whose CMB crossing precedes the rip gets it located and sampled.
  const holes = simulate({ ...rip, blackHoleMasses: [3e-8, 1e-6] });
  const crossing = event(holes, 'cool-0.000001')!;
  assert.ok(crossing.logYears < event(holes, 'rip')!.logYears);
  assert.ok(holes.samples.some((s) => s.logYears === crossing.logYears));
  // The quadrature is counted and charged like any other evaluation.
  const counters = {
    derivativeEvaluations: 0,
    samplingEvaluations: 0,
    rootIterations: 0,
  };
  const budget = { limit: 1e7, used: 0 };
  simulate(rip, { counters, budget });
  assert.equal(
    budget.used,
    counters.derivativeEvaluations + counters.samplingEvaluations,
  );
  assert.throws(
    () => simulate(rip, { budget: { limit: budget.used - 1, used: 0 } }),
    /Work budget exceeded/,
  );
});
