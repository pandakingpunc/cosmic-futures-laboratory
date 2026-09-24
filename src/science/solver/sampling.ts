import { astrophysics } from '../astrophysics';
import {
  C_KM_S,
  LN10,
  logDeSitterEntropy,
  logHorizonTemperature,
} from '../core/constants';
import type { WorkBudget } from '../core/limits';
import { ln, safe } from '../core/numeric';
import { DOMINANCE, isVacuumW } from '../model/asymptote';
import {
  background,
  derivative,
  type Background,
  type Model,
} from '../model/background';
import type { Segment } from '../model/segment';
import type { Sample } from '../types';
import { counted, rethrowBudget, type SimulationCounters } from './counters';
import { dopriStep, type Derivative } from './dopri5';
import type { Node } from './expanding';
export { DOMINANCE } from '../model/asymptote';
/**
 * The explicit de Sitter criterion of the horizon entropy and temperature: a
 * positive vacuum whose w is −1 to rounding, as in the matched tails, and
 * that dominates to the tail threshold. Laws such as w₀+wₐ(1−1/a) with
 * w₀+wₐ = −1 qualify once w(a) itself rounds to −1, so the numerical branch
 * and its tail agree.
 */
export function isDeSitter(b: Background, segment: Segment): boolean {
  return (
    segment.signDE > 0 &&
    isVacuumW(b.w, segment) &&
    Math.abs(1 - b.fractions[3]) <= DOMINANCE
  );
}
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
  const deSitter = isDeSitter(b, segment);
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
    w: segment.signDE ? b.w : null,
    logHubbleRadiusMpc: radius,
    logComovingHubbleMpc: radius - logA,
    logHorizonEntropy: deSitter ? logDeSitterEntropy(radius, segment.g) : null,
    logHorizonTemperature: deSitter ? logHorizonTemperature(logH) : null,
    ...astrophysics(y[0] === 0 ? -Infinity : logYears, c),
    regime,
    constraintResidual: 0,
  };
}
export interface Sampling {
  samples: Sample[];
  /** Why reconstruction stopped before the last target, or null. */
  failure: string | null;
}
/** A located event state that receives its own output sample. */
export interface EventPoint {
  x: number;
  y: readonly number[];
  segment: Segment;
  logYears: number;
}
/**
 * Samples the present and `samples` elapsed times spread evenly in log time
 * up to numericalEnd; a negative numericalEnd leaves only the present. Each
 * sample is an exact partial Dormand–Prince step from the preceding node,
 * placed by a bracketed Newton iteration on τ(x). `extra` further samples,
 * evenly spaced in ln a over the branch that log time still resolves,
 * resolve a Big Rip approach. Located events inside [0, numericalEnd], or up
 * to the last reconstructed time where reconstruction fails, add their own
 * samples unless a sample already has their time.
 */
export function sampleExpansion(
  model: Model,
  nodes: readonly Node[],
  numericalEnd: number,
  extra = 0,
  counters?: SimulationCounters,
  budget?: WorkBudget,
  events: readonly EventPoint[] = [],
): Sampling {
  const { c, logH0 } = model;
  const targets = [
    -Infinity,
    ...(numericalEnd >= 0
      ? new Set(
          Array.from(
            { length: c.samples },
            (_, i) => (i * numericalEnd) / (c.samples - 1),
          ),
        )
      : []),
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
    budget,
  );
  const step = (index: number, h: number) => {
    const n = nodes[index];
    const t = dopriStep(
      rhs,
      n.x,
      n.y,
      h,
      c.rtol,
      c.atol,
      cached === index ? k1 : undefined,
    );
    cached = index;
    k1 = t.k1;
    return t;
  };
  const added: Sample[] = [];
  let failure: string | null = null;
  try {
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
          guess =
            n.x + ((tau - n.y[0]) / (next.y[0] - n.y[0])) * (next.x - n.x),
          py2 = n.y;
        for (let k = 0; k < 64; k++) {
          if (counters) counters.rootIterations++;
          if (!(guess > lo && guess < hi)) guess = (lo + hi) / 2;
          const h = guess - n.x;
          const t = step(j, h);
          const f = t.y[0] - tau;
          if (f < 0) lo = guess;
          else hi = guess;
          px = guess;
          py2 = t.y;
          if (f === 0 || hi - lo <= 2 * Number.EPSILON * Math.max(1, hi)) break;
          // The last stage is f(n.x + h, t.y); it is the slope at the guess
          // whenever n.x + h reproduces the guess exactly.
          const slope = Object.is(n.x + h, guess)
            ? t.k7[0]
            : rhs(guess, t.y)[0];
          guess = slope > 0 ? guess - f / slope : (lo + hi) / 2;
        }
        py = py2;
      }
      samples.push(toSample(px, py, segment, lt === -Infinity ? 0 : lt, model));
    }
    if (extra > 0 && numericalEnd >= 0) {
      // Approaching a Big Rip, τ reaches its limit in floating point before
      // ln a does; beyond the first node at the final log time, samples even
      // in ln a could not be told apart in time.
      const lt = (n: Node) => Math.log10(n.y[0]) - logH0;
      let r = nodes.length - 1;
      while (r > 0 && lt(nodes[r - 1]) === lt(nodes[nodes.length - 1])) r--;
      const xEnd = nodes[r].x;
      j = 0;
      for (let k = 1; k < extra; k++) {
        const x = (xEnd * k) / extra;
        while (j + 1 < nodes.length && nodes[j + 1].x <= x) j++;
        const n = nodes[j];
        segment = n.segment;
        const y = x > n.x ? step(j, x - n.x).y : n.y;
        const lt = Math.log10(y[0]) - logH0;
        if (lt >= 0 && lt <= numericalEnd)
          added.push(toSample(x, y, segment, lt, model));
      }
    }
  } catch (e) {
    rethrowBudget(e);
    failure = (e as Error).message;
    added.length = 0;
  }
  // Located events keep their own sample up to the last reconstructed time,
  // also where reconstruction stopped early; their states are already known.
  const last =
    failure === null ? numericalEnd : (samples.at(-1)?.logYears ?? -1);
  const times = new Set(samples.map((s) => s.logYears));
  for (const p of events)
    if (p.logYears >= 0 && p.logYears <= last && !times.has(p.logYears))
      added.push(toSample(p.x, p.y, p.segment, p.logYears, model));
  if (added.length) {
    // The present stays first; the added samples interleave by time and,
    // where a Big Rip approach exhausts the resolution of τ, by scale factor.
    const present = samples.shift()!;
    samples.push(...added);
    samples.sort((a, b) => a.logYears - b.logYears || a.logA! - b.logA!);
    samples.unshift(present);
  }
  return { samples, failure };
}
/**
 * The samples after the present in strictly increasing time: a sample whose
 * log time equals its predecessor's cannot be placed on the time axis, which
 * happens where elapsed time runs out of floating-point resolution.
 */
export function distinctTimes(samples: readonly Sample[]): Sample[] {
  return samples.filter(
    (s, i) =>
      i === 0 ||
      samples[i - 1].isPresent ||
      s.logYears > samples[i - 1].logYears,
  );
}
