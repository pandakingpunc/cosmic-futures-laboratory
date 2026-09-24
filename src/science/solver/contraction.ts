import { astrophysics } from '../astrophysics';
import { C_KM_S } from '../core/constants';
import type { WorkBudget } from '../core/limits';
import { safe } from '../core/numeric';
import type { Model } from '../model/background';
import type { Stop } from '../model/segment';
import type { CosmicEvent, Sample } from '../types';
import { counted, rethrowBudget, type SimulationCounters } from './counters';
import { dopriStep, type Derivative } from './dopri5';
export interface ContractionOutcome {
  samples: Sample[];
  /** The first turnaround and the first bounce, when resolved. */
  events: CosmicEvent[];
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
const FIRST_YEAR =
  ' It occurs within the first elapsed year and is shown at one year.';
/**
 * Integrates constant-fluid models with negative dark energy or curvature in
 * proper time u = ln(1 + τ), with z = [a, da/dτ]. The acceleration equation
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
  const n = c.deModel === 'lambda' ? 0 : 3 * (1 + c.w0),
    M = model.matter + c.omegaDM;
  const density = (a: number) => [
    M / a ** 3,
    c.omegaR / a ** 4,
    c.omegaDE / a ** n,
    c.omegaK / a ** 2,
  ];
  const f: Derivative = (u, z) => {
    const [a, v] = z;
    if (a <= 0) throw new Error('Scale factor reached zero.');
    const [m, r, d] = density(a);
    return [
      Math.exp(u) * v,
      -0.5 * Math.exp(u) * a * (m + 2 * r + (n - 2) * d),
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
    const rootU = u0 + (lo + hi) / 2,
      raw = Math.log10(Math.expm1(rootU)) - logH0;
    return { logYears: Math.max(0, raw), early: !(raw >= 0) };
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
  const pts: { u: number; z: number[] }[] = [{ u, z: [...z] }];
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
  const samples: Sample[] = [];
  let maxConstraintResidual = 0;
  for (const p of outputPoints) {
    const a = p.z[0],
      v = p.z[1],
      tau = Math.expm1(p.u),
      lt = tau > 0 ? Math.max(0, Math.log10(tau) - logH0) : 0;
    if (lt > effectiveEnd + 1e-9) continue;
    const [m, r, d, k] = density(a),
      E = v / a,
      scale = Math.abs(m) + r + Math.abs(d) + Math.abs(k),
      residual = Math.abs(E * E - (m + r + d + k)) / Math.max(1e-300, scale);
    const la = Math.log10(a),
      eh = E === 0 ? null : Math.log10(c.H0 * Math.abs(E));
    maxConstraintResidual = Math.max(maxConstraintResidual, residual);
    samples.push({
      logYears: lt,
      isPresent: tau === 0,
      logA: la,
      expansionIndex: Math.sign(la) * Math.log10(1 + Math.abs(la)),
      logH: eh,
      logRhoB: safe(Math.log10(c.omegaB) - 3 * la),
      logRhoDM: safe(Math.log10(c.omegaDM) - 3 * la),
      logRhoR: safe(Math.log10(c.omegaR) - 4 * la),
      logRhoDE: safe(Math.log10(Math.abs(c.omegaDE)) - n * la),
      omegaM: E * E > 1e-20 ? m / (E * E) : null,
      omegaR: E * E > 1e-20 ? r / (E * E) : null,
      omegaDE: E * E > 1e-20 ? d / (E * E) : null,
      omegaK: E * E > 1e-20 ? k / (E * E) : null,
      logTcmb: Math.log10(c.Tcmb) - la,
      logRadiationEffectiveT: c.omegaR > 0 ? Math.log10(c.Tcmb) - la : null,
      q: E * E > 1e-20 ? (0.5 * (m + 2 * r + (n - 2) * d)) / (E * E) : null,
      w: c.omegaDE === 0 ? null : c.deModel === 'lambda' ? -1 : c.w0,
      logHubbleRadiusMpc: eh === null ? null : Math.log10(C_KM_S) - eh,
      logComovingHubbleMpc: eh === null ? null : Math.log10(C_KM_S) - eh - la,
      logHorizonEntropy: null,
      ...astrophysics(tau === 0 ? -Infinity : lt, c),
      regime: v < 0 ? 'contraction' : 'numerical',
      constraintResidual: residual,
    });
  }
  if (maxConstraintResidual > 1e-4)
    stop = {
      status: 'limited',
      reason:
        'Friedmann-constraint drift exceeded 10⁻⁴; time-domain solution requires tighter tolerances.',
    };
  return {
    samples,
    events,
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
/**
 * Output times that resolve the collapse after the turnaround, spaced about
 * evenly in log₁₀ a from the maximum down to a = 10⁻⁴. Each time is placed
 * by linear interpolation of log₁₀ a in u inside an accepted step; the
 * sample itself is then computed exactly at that time.
 */
function collapseTimes(
  pts: readonly { u: number; z: number[] }[],
  samples: number,
  logH0: number,
  stopLog: number,
): number[] {
  let top = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].z[0] > pts[top].z[0]) top = i;
  const count = Math.ceil(samples / 4),
    laTop = Math.log10(pts[top].z[0]),
    times: number[] = [];
  let j = top;
  for (let k = 1; k <= count; k++) {
    const la = laTop + ((-4 - laTop) * k) / count;
    while (j + 1 < pts.length && Math.log10(pts[j].z[0]) > la) j++;
    if (j === top || Math.log10(pts[j].z[0]) > la) break;
    const a0 = Math.log10(pts[j - 1].z[0]),
      a1 = Math.log10(pts[j].z[0]);
    const u =
      pts[j - 1].u + ((pts[j].u - pts[j - 1].u) * (a0 - la)) / (a0 - a1);
    const lt = Math.log10(Math.expm1(u)) - logH0;
    if (lt >= 0 && lt <= stopLog) times.push(lt);
  }
  return times;
}
