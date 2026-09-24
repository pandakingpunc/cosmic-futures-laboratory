import { charge, type WorkBudget } from '../core/limits';
import { exponents } from '../model/asymptote';
import { background, type Model } from '../model/background';
import { cplLogDensity } from '../model/cpl';
import type { CosmicEvent, Sample } from '../types';
import {
  rethrowBudget,
  type EvaluationPhase,
  type SimulationCounters,
} from './counters';
import type { Pending } from './crossings';
import type { Node } from './expanding';
import { decayingIntegral, integralTo, solveIntegral } from './quadrature';
import { toSample } from './sampling';
export interface RipInput {
  model: Model;
  /** The accepted state where the big-rip conditions hold. */
  final: Node;
  /** log₁₀ elapsed years at that state and at the requested end. */
  startLog: number;
  endLog: number;
  pending?: Pending;
  counters?: SimulationCounters;
  budget?: WorkBudget;
}
export type RipOutcome =
  | { proven: false; reason: string }
  | {
      proven: true;
      /** log₁₀ elapsed years of the singularity. */
      ripLog: number;
      /** The singularity lies within the requested interval. */
      reached: boolean;
      samples: Sample[];
      events: CosmicEvent[];
      /** Per selected mass, a CMB/Hawking crossing before the rip, or null. */
      cool: (number | null)[];
      tail: string;
      warnings: string[];
    };
const TRANSFER_MODELS = ['decay', 'annihilation', 'interacting'];
/**
 * Continues a CPL segment with wₐ > 0 from a state where w ≤ −1 and the
 * dark energy dominates to 10⁻⁸. E(x) is exact there: the closed-form ρde
 * and the other components at their constant exponents (for dark-matter
 * transfer models their exchange after this state, below 10⁻⁸ of E², is
 * neglected, as in the matched tails). The remaining proper time ∫dx/E is
 * integrated to its finite limit on adaptive Gauss–Kronrod panels; output
 * times are placed by inverting that integral. Samples follow the tail grid
 * and, when the rip is reached, about samples/4 more even in ln a up to where
 * log₁₀ t still resolves it; none is placed at or beyond the singularity.
 */
export function ripContinuation(input: RipInput): RipOutcome {
  const { model, final, startLog, endLog, pending, counters, budget } = input;
  const { c, logH0 } = model,
    s = final.segment,
    x0 = final.x,
    y0 = final.y;
  const b = background(x0, y0, s, model),
    n = exponents(model, s);
  const terms = [0, 1, 2, 4]
    .filter((i) => Number.isFinite(b.logs[i]))
    .map((i) => ({ l: b.logs[i], n: n[i], sign: i === 4 ? model.signK : 1 }));
  const lnG = Math.log(s.g);
  const lnDE = (x: number) => cplLogDensity(x, x0, y0[2], s);
  /** ln E² and its derivative d ln E²/dx at x ≥ x0. */
  const state = (x: number) => {
    const d = x - x0,
      l = lnDE(x);
    let max = l;
    for (const t of terms) max = Math.max(max, t.l - t.n * d);
    const u = Math.exp(l - max);
    let sum = u,
      slope = -3 * (1 + s.w0 + s.wa - s.wa * Math.exp(x)) * u;
    for (const t of terms) {
      const v = t.sign * Math.exp(t.l - t.n * d - max);
      sum += v;
      slope -= t.n * v;
    }
    return { lnE2: lnG + max + Math.log(sum), slope: slope / sum };
  };
  let phase: EvaluationPhase = 'derivativeEvaluations';
  const f = (x: number) => {
    if (counters) counters[phase]++;
    if (budget) charge(budget);
    return Math.exp(-0.5 * state(x).lnE2);
  };
  const panels = decayingIntegral(f, (x) => -0.5 * state(x).slope, x0);
  if (!panels)
    return {
      proven: false,
      reason:
        'The remaining proper time of the CPL phantom branch did not converge on 20000 quadrature panels; no singularity time is asserted.',
    };
  phase = 'samplingEvaluations';
  const tau0 = y0[0],
    ripLog = Math.log10(tau0 + panels.total) - logH0,
    reached = ripLog <= endLog;
  const logAt = (x: number) =>
    Math.log10(tau0 + integralTo(panels, f, x)) - logH0;
  const points: { x: number; lt: number }[] = [];
  const gridStart = Math.max(0, startLog);
  for (let i = 0; i < c.samples; i++) {
    const lt = gridStart + ((endLog - gridStart) * (i + 1)) / c.samples,
      target = 10 ** (lt + logH0) - tau0;
    if (lt > startLog && lt < ripLog && target < panels.total)
      points.push({ x: solveIntegral(panels, f, target), lt });
  }
  if (reached) {
    // The largest ln a whose log time still differs from the rip's.
    let lo = x0,
      hi = panels.edges[panels.edges.length - 1];
    for (let k = 0; k < 200 && hi - lo > 4 * Number.EPSILON * hi; k++) {
      const mid = 0.5 * (lo + hi);
      if (logAt(mid) < ripLog) lo = mid;
      else hi = mid;
    }
    const extra = Math.ceil(c.samples / 4);
    for (let k = 1; k <= extra; k++) {
      const x = x0 + ((lo - x0) * k) / extra;
      points.push({ x, lt: logAt(x) });
    }
  }
  const cool = c.blackHoleMasses.map((): number | null => null);
  pending?.targets.forEach((t, i) => {
    if (!(t > x0)) return;
    const lt = logAt(t);
    if (lt < ripLog && lt <= endLog) {
      cool[i] = lt;
      points.push({ x: t, lt });
    }
  });
  points.sort((p, q) => p.x - q.x);
  const samples: Sample[] = [],
    warnings: string[] = [];
  const transfer = TRANSFER_MODELS.includes(c.dmModel);
  for (const p of points) {
    if (!(p.lt > startLog && p.lt < ripLog && p.lt <= endLog)) continue;
    try {
      const sample = toSample(
        p.x,
        [10 ** (p.lt + logH0), y0[1], lnDE(p.x), y0[3]],
        s,
        p.lt,
        model,
        'asymptotic',
      );
      if (transfer) {
        sample.logRhoR = null;
        sample.logRadiationEffectiveT = null;
      }
      samples.push(sample);
    } catch (e) {
      rethrowBudget(e);
      warnings.push(
        `Samples approaching the CPL Big Rip stop at 10^${p.lt.toPrecision(8)} yr: ${(e as Error).message} The singularity time is unaffected.`,
      );
      break;
    }
  }
  const events: CosmicEvent[] = reached
    ? [
        {
          id: 'rip',
          title: 'Finite-time Big Rip (literal CPL extrapolation)',
          logYears: ripLog,
          detail: `With wₐ > 0 the CPL law w(a)=w₀+wₐ(1−a) falls without bound. From a = ${Math.exp(x0).toPrecision(6)}, w ≤ −1 and the dark energy dominates to 10⁻⁸, so its density grows super-exponentially and the remaining proper time ∫dx/E converges: a, H and ρde diverge at this finite time, computed by quadrature of the closed-form density. A literal extrapolation of an observational fit ansatz, not a prediction. Samples stop before this boundary.`,
          reliability: 'Model dependent',
          sources: ['chevallier2001', 'linder2003', 'nojiri2005'],
        },
      ]
    : [];
  return {
    proven: true,
    ripLog,
    reached,
    samples,
    events,
    cool,
    tail: `Closed-form CPL continuation from ln a = ${x0.toFixed(5)} (w = ${b.w.toPrecision(6)}, non-dark-energy fraction < 10⁻⁸): the proper time ∫dx/E is integrated on ${panels.edges.length - 1} adaptive Gauss–Kronrod panels to its finite limit. Numeric integration ends at log10(elapsed yr)=${startLog.toFixed(5)}.`,
    warnings,
  };
}
