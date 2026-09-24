import { astrophysics } from '../astrophysics';
import {
  C_KM_S,
  LN10,
  LOG10_INV_PLANCK_M,
  LOG10_MPC_M,
} from '../core/constants';
import { ln, safe } from '../core/numeric';
import { background, derivative, type Model } from '../model/background';
import type { Segment } from '../model/segment';
import type { Sample } from '../types';
import { counted, type SimulationCounters } from './counters';
import { dopriStep, type Derivative } from './dopri5';
import type { Node } from './expanding';
/** Observable quantities of a numerical state at the given elapsed time. */
export function toSample(
  x: number,
  y: readonly number[],
  segment: Segment,
  logYears: number,
  model: Model,
  regime: Sample['regime'] = 'numerical',
): Sample {
  const { c } = model;
  const b = background(x, y, segment, model),
    logA = x / LN10,
    logH = Math.log10(c.H0) + b.logE / LN10;
  const radius = Math.log10(C_KM_S) - logH;
  return {
    logYears,
    isPresent: y[0] === 0,
    logA,
    expansionIndex: Math.sign(logA) * Math.log10(1 + Math.abs(logA)),
    logH,
    logRhoB: safe(ln(c.omegaB) / LN10 - 3 * logA),
    logRhoDM: safe(b.logs[1] / LN10),
    logRhoR: safe(b.logs[2] / LN10),
    logRhoDE: safe(b.logs[3] / LN10),
    omegaM: b.fractions[0] + b.fractions[1],
    omegaR: b.fractions[2],
    omegaDE: b.fractions[3],
    omegaK: b.fractions[4],
    logTcmb: Math.log10(c.Tcmb) - logA,
    logRadiationEffectiveT:
      c.omegaR > 0
        ? Math.log10(c.Tcmb) + (b.logs[2] / LN10 - Math.log10(c.omegaR)) / 4
        : null,
    q: b.q,
    w: b.w,
    logHubbleRadiusMpc: radius,
    logComovingHubbleMpc: radius - logA,
    logHorizonEntropy:
      b.q === -1
        ? Math.log10(Math.PI) + 2 * (radius + LOG10_MPC_M + LOG10_INV_PLANCK_M)
        : null,
    ...astrophysics(y[0] === 0 ? -Infinity : logYears, c),
    regime,
    constraintResidual: 0,
  };
}
/**
 * Samples the present and `samples` elapsed times spread evenly in log time
 * up to numericalEnd. Each sample is an exact partial Dormand–Prince step
 * from the preceding node, placed by a bracketed Newton iteration on τ(x).
 */
export function sampleExpansion(
  model: Model,
  nodes: readonly Node[],
  numericalEnd: number,
  counters?: SimulationCounters,
): Sample[] {
  const { c, logH0 } = model;
  const targets = [
    -Infinity,
    ...new Set(
      Array.from(
        { length: c.samples },
        (_, i) => (i * numericalEnd) / (c.samples - 1),
      ),
    ),
  ];
  const samples: Sample[] = [];
  let segment = nodes[0].segment,
    j = 0,
    // f at nodes[cached], shared by every partial step from that node.
    cached = -1,
    k1: number[] | undefined;
  const rhs: Derivative = counted(
    (u, v) => derivative(u, v, segment, model),
    counters,
    'samplingEvaluations',
  );
  for (const lt of targets) {
    const tau = lt === -Infinity ? 0 : 10 ** (lt + logH0);
    while (j + 1 < nodes.length && nodes[j + 1].y[0] < tau) j++;
    const n = nodes[j],
      next = nodes[Math.min(j + 1, nodes.length - 1)];
    segment = n.segment;
    let px = n.x,
      py = n.y;
    if (next.x > n.x && tau > n.y[0]) {
      // Refine τ(x)=target inside the accepted step with a bracketed Newton
      // iteration; dτ/dx = 1/E is available from the ODE itself. The
      // bracket guarantees convergence and the exit test ends at
      // floating-point resolution, matching a full bisection.
      let lo = n.x,
        hi = next.x,
        guess = n.x + ((tau - n.y[0]) / (next.y[0] - n.y[0])) * (next.x - n.x),
        py2 = n.y;
      for (let k = 0; k < 64; k++) {
        if (counters) counters.rootIterations++;
        if (!(guess > lo && guess < hi)) guess = (lo + hi) / 2;
        const h = guess - n.x;
        const t = dopriStep(
          rhs,
          n.x,
          n.y,
          h,
          c.rtol,
          c.atol,
          cached === j ? k1 : undefined,
        );
        cached = j;
        k1 = t.k1;
        const f = t.y[0] - tau;
        if (f < 0) lo = guess;
        else hi = guess;
        px = guess;
        py2 = t.y;
        if (f === 0 || hi - lo <= 2 * Number.EPSILON * Math.max(1, hi)) break;
        // The last stage is f(n.x + h, t.y); it is the slope at the guess
        // whenever n.x + h reproduces the guess exactly.
        const slope = Object.is(n.x + h, guess) ? t.k7[0] : rhs(guess, t.y)[0];
        guess = slope > 0 ? guess - f / slope : (lo + hi) / 2;
      }
      py = py2;
    }
    samples.push(toSample(px, py, segment, lt === -Infinity ? 0 : lt, model));
  }
  return samples;
}
