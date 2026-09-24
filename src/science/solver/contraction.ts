import type { LocatedEvents } from '../astrophysics';
import type { WorkBudget } from '../core/limits';
import type { Model } from '../model/background';
import type { Stop } from '../model/segment';
import type { CosmicEvent, Sample } from '../types';
import { counted, rethrowBudget, type SimulationCounters } from './counters';
import {
  hawkingTargets,
  noEvents,
  passages,
  type TimePoint,
} from './crossings';
import { dopriStep, type Derivative } from './dopri5';
import {
  collapseTimes,
  equalities,
  timeDomainFluids,
  timeDomainSample,
} from './time-domain';
export interface ContractionOutcome {
  samples: Sample[];
  /** The first turnaround and the first bounce, when resolved. */
  events: CosmicEvent[];
  /** Equality and CMB/Hawking crossings located on the resolved branch. */
  located: LocatedEvents;
  stop: Stop | null;
  turned: boolean;
  /** The contraction reversed into a new expansion at a finite minimum. */
  bounced: boolean;
  /** The contracting scale factor reached the a = 10⁻⁴ boundary. */
  crunch: boolean;
  acceptedSteps: number;
  rejectedSteps: number;
  maxConstraintResidual: number;
  numericalUntilLogYears: number;
}
const MAX_STEPS = 30000;
/** Largest Friedmann residual |E² − Σuᵢ|/Σ|uᵢ| of a trusted time-domain state. */
const CONSTRAINT_LIMIT = 1e-4;
const DRIFT_REASON =
  'Friedmann-constraint drift exceeded 10⁻⁴; time-domain solution requires tighter tolerances.';
const FIRST_YEAR =
  ' It occurs within the first elapsed year and is shown at one year.';
/**
 * Integrates models with negative dark energy or curvature whose fluids
 * depend on a alone (constant w, or a closed-form CPL density) in proper
 * time u = ln(1 + τ), with z = [a, da/dτ]. The acceleration equation
 * crosses H = 0 without selecting an unphysical square root; the Friedmann
 * constraint is checked independently at every sample.
 */
export function integrateContraction(
  model: Model,
  effectiveEnd: number,
  counters?: SimulationCounters,
  budget?: WorkBudget,
): ContractionOutcome {
  const { c, logH0 } = model;
  const { density, residual, weight } = timeDomainFluids(model);
  const f: Derivative = (u, z) => {
    const [a, v] = z;
    if (a <= 0) throw new Error('Scale factor reached zero.');
    const [m, r, d] = density(a);
    return [
      Math.exp(u) * v,
      -0.5 * Math.exp(u) * a * (m + 2 * r + weight(a) * d),
    ];
  };
  const integrationF = counted(f, counters, 'derivativeEvaluations', budget),
    samplingF = counted(f, counters, 'samplingEvaluations', budget);
  const endU =
    effectiveEnd + logH0 > 300 ? 700 : Math.log1p(10 ** (effectiveEnd + logH0));
  const events: CosmicEvent[] = [];
  /** Event at the root of v inside the accepted step from (u0, z0). */
  const root = (
    u0: number,
    z0: number[],
    k0: number[] | undefined,
    h: number,
    rising: boolean,
  ) => {
    let lo = 0,
      hi = h;
    for (let k = 0; k < 42; k++) {
      if (counters) counters.rootIterations++;
      const mid = (lo + hi) / 2;
      const at = dopriStep(integrationF, u0, z0, mid, c.rtol, c.atol, k0);
      if (rising ? at.y[1] < 0 : at.y[1] > 0) lo = mid;
      else hi = mid;
    }
    const mid = (lo + hi) / 2,
      rootU = u0 + mid,
      raw = Math.log10(Math.expm1(rootU)) - logH0;
    const z = dopriStep(integrationF, u0, z0, mid, c.rtol, c.atol, k0).y;
    return { logYears: Math.max(0, raw), early: !(raw >= 0), z };
  };
  let rejectedTurn = 0;
  /**
   * A velocity root is a turning point only where the constraint confirms
   * that ΣΩ vanishes there to the trusted residual; otherwise the sign
   * change is integration drift and the branch stops without an event.
   */
  const confirmed = (at: { logYears: number; z: number[] }) => {
    const drift = residual(at.z);
    if (drift <= CONSTRAINT_LIMIT) return true;
    rejectedTurn = drift;
    stop = {
      status: 'limited',
      reason: `${DRIFT_REASON} The velocity changes sign near 10^${at.logYears.toPrecision(5)} yr where the densities do not sum to zero (residual ${drift.toPrecision(2)}), so no turning point is asserted.`,
    };
    return false;
  };
  let u = 0,
    z = [1, 1],
    h = 0.002,
    k1: number[] | undefined,
    turned = false,
    bounced = false,
    crunch = false,
    stop: Stop | null = null,
    acceptedSteps = 0,
    rejectedSteps = 0,
    steps = 0;
  const pts: TimePoint[] = [{ u, z: [...z] }];
  while (steps++ < MAX_STEPS && u < endU) {
    h = Math.min(h, endU - u);
    let s;
    try {
      s = dopriStep(integrationF, u, z, h, c.rtol, c.atol, k1);
    } catch (e) {
      rethrowBudget(e);
      h *= 0.2;
      if (h < 1e-13) {
        stop = {
          status: 'limited',
          reason: 'Time-domain branch reached minimum step near a singularity.',
        };
        break;
      }
      continue;
    }
    k1 = s.k1;
    if (s.error > 1) {
      h *= s.factor;
      rejectedSteps++;
      continue;
    }
    const previousU = u,
      previousZ = z,
      previousK1 = s.k1;
    u += h;
    z = s.y;
    k1 = s.k7;
    acceptedSteps++;
    pts.push({ u, z: [...z] });
    if (!turned && z[1] < 0) {
      const at = root(previousU, previousZ, previousK1, h, false);
      if (!confirmed(at)) {
        pts.pop();
        break;
      }
      turned = true;
      events.push({
        id: 'turn',
        title: 'Expansion turns into contraction',
        logYears: at.logYears,
        detail:
          'Velocity changes sign at a root refined within an accepted step of the regular time-domain acceleration equation. The Friedmann constraint is checked independently.' +
          (at.early ? FIRST_YEAR : ''),
        reliability: 'Model dependent',
        sources: ['friedmann1922'],
      });
    } else if (turned && !bounced && previousZ[1] <= 0 && z[1] > 0) {
      const at = root(previousU, previousZ, previousK1, h, true);
      if (!confirmed(at)) {
        pts.pop();
        break;
      }
      bounced = true;
      events.push({
        id: 'bounce',
        title: 'Contraction reverses at a classical bounce',
        logYears: at.logYears,
        detail:
          'Velocity changes sign from contraction to expansion at a finite minimum scale factor, refined within an accepted step. The acceleration equation depends on a alone, so the solution is time-reversible and oscillates between its turning points; later turning points are not listed.' +
          (at.early ? FIRST_YEAR : ''),
        reliability: 'Model dependent',
        sources: ['friedmann1922'],
      });
    }
    if (turned && z[0] < 1e-4) {
      crunch = true;
      stop = {
        status: 'terminated',
        reason:
          'Contracting scale factor reached a=10⁻⁴. The singularity itself and quantum-gravity regime are not integrated.',
      };
      break;
    }
    if (z[0] > 1e12) {
      stop = {
        status: 'limited',
        reason:
          'Time-domain signed-curvature branch reached the supported expansion scale; no unproven continuation.',
      };
      break;
    }
    h = Math.min(0.02, h * s.factor);
  }
  if (steps >= MAX_STEPS)
    stop = {
      status: 'limited',
      reason: 'Time-domain integration budget reached.',
    };
  const lastU = pts[pts.length - 1].u;
  const reached = lastU > 0 ? Math.log10(Math.expm1(lastU)) - logH0 : -Infinity;
  const stopLog = Math.min(effectiveEnd, reached);
  const firstLog = 0;
  const times = [
    ...new Set([
      ...(stopLog >= 0
        ? Array.from(
            { length: c.samples },
            (_, i) => firstLog + ((stopLog - firstLog) * i) / (c.samples - 1),
          )
        : []),
      ...events
        .filter((e) => e.logYears > 0 && e.logYears <= stopLog)
        .map((e) => e.logYears),
      ...(crunch ? collapseTimes(pts, c.samples, logH0, stopLog) : []),
    ]),
  ].sort((a, b) => a - b);
  let pointIndex = 0,
    cached = -1,
    startK1: number[] | undefined;
  const outputPoints = [pts[0]];
  try {
    for (const lt of times) {
      const targetU = Math.min(lastU, Math.log1p(10 ** (lt + logH0)));
      while (pointIndex + 1 < pts.length && pts[pointIndex + 1].u < targetU)
        pointIndex++;
      const start = pts[pointIndex];
      if (targetU === start.u) {
        outputPoints.push({ u: targetU, z: start.z });
        continue;
      }
      const step = dopriStep(
        samplingF,
        start.u,
        start.z,
        targetU - start.u,
        c.rtol,
        c.atol,
        cached === pointIndex ? startK1 : undefined,
      );
      cached = pointIndex;
      startK1 = step.k1;
      outputPoints.push({ u: targetU, z: step.y });
    }
  } catch (e) {
    rethrowBudget(e);
    stop = {
      status: 'limited',
      reason: `Output sample reconstruction failed: ${(e as Error).message} Samples end at the last reconstructed time.`,
    };
  }
  // Crossings depend on a alone: equality at the roots of ρm = ρde (see
  // timeDomainFluids) and CMB/Hawking crossings at a* = Tγ,0/T_H. Each gets
  // its own output point.
  const located = noEvents(c),
    extra: TimePoint[] = [],
    lastOutput = outputPoints[outputPoints.length - 1].u;
  const stateAt = (i: number, v: number) =>
    dopriStep(samplingF, pts[i].u, pts[i].z, v - pts[i].u, c.rtol, c.atol).y;
  const locate = (target: number, list: (rising: boolean) => number[]) => {
    for (const p of passages(pts, stateAt, target, counters)) {
      if (!(p.u > 0)) continue;
      const raw = Math.log10(Math.expm1(p.u)) - logH0;
      list(p.rising).push(raw);
      if (raw >= 0 && p.u <= lastOutput) extra.push(p);
    }
  };
  hawkingTargets(c).forEach((t, i) =>
    locate(Math.exp(t), (rising) =>
      rising ? located.cool[i] : located.warm[i],
    ),
  );
  for (const target of equalities(model))
    locate(target, () => located.equality);
  outputPoints.push(...extra);
  outputPoints.sort((p, q) => p.u - q.u);
  const samples: Sample[] = [];
  let maxConstraintResidual = 0;
  for (const p of outputPoints) {
    const tau = Math.expm1(p.u),
      lt = tau > 0 ? Math.max(0, Math.log10(tau) - logH0) : 0;
    if (lt > effectiveEnd + 1e-9) continue;
    const sample = timeDomainSample(model, p, lt);
    maxConstraintResidual = Math.max(
      maxConstraintResidual,
      sample.constraintResidual,
    );
    samples.push(sample);
  }
  maxConstraintResidual = Math.max(maxConstraintResidual, rejectedTurn);
  if (maxConstraintResidual > CONSTRAINT_LIMIT && !rejectedTurn)
    stop = { status: 'limited', reason: DRIFT_REASON };
  return {
    samples,
    events,
    located,
    stop,
    turned,
    bounced,
    crunch,
    acceptedSteps,
    rejectedSteps,
    maxConstraintResidual,
    numericalUntilLogYears: Math.max(0, reached),
  };
}
