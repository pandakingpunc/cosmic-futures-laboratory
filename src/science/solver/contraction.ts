import { astrophysics } from '../astrophysics';
import { C_KM_S } from '../core/constants';
import { safe } from '../core/numeric';
import type { Model } from '../model/background';
import type { Stop } from '../model/segment';
import type { CosmicEvent, Sample } from '../types';
import { counted, type SimulationCounters } from './counters';
import { dopriStep, type Derivative } from './dopri5';
export interface ContractionOutcome {
  samples: Sample[];
  /** The turnaround event, when one was resolved. */
  events: CosmicEvent[];
  stop: Stop | null;
  turned: boolean;
  /** The contracting scale factor reached the a = 10⁻⁴ boundary. */
  crunch: boolean;
  acceptedSteps: number;
  rejectedSteps: number;
  maxConstraintResidual: number;
  numericalUntilLogYears: number;
}
const MAX_STEPS = 30000;
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
  const integrationF = counted(f, counters, 'derivativeEvaluations'),
    samplingF = counted(f, counters, 'samplingEvaluations');
  const endU =
    effectiveEnd + logH0 > 300 ? 700 : Math.log1p(10 ** (effectiveEnd + logH0));
  const events: CosmicEvent[] = [];
  let u = 0,
    z = [1, 1],
    h = 0.002,
    k1: number[] | undefined,
    turned = false,
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
    } catch {
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
      let lo = 0,
        hi = h;
      for (let k = 0; k < 42; k++) {
        if (counters) counters.rootIterations++;
        const mid = (lo + hi) / 2;
        const at = dopriStep(
          integrationF,
          previousU,
          previousZ,
          mid,
          c.rtol,
          c.atol,
          previousK1,
        );
        if (at.y[1] > 0) lo = mid;
        else hi = mid;
      }
      const rootU = previousU + (lo + hi) / 2;
      turned = true;
      events.push({
        id: 'turn',
        title: 'Expansion turns into contraction',
        logYears: Math.log10(Math.expm1(rootU)) - logH0,
        detail:
          'Velocity changes sign at a root refined within an accepted step of the regular time-domain acceleration equation. The Friedmann constraint is checked independently.',
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
  const stopLog = Math.min(effectiveEnd, Math.log10(Math.expm1(lastU)) - logH0);
  const firstLog = Math.min(0, stopLog);
  const times = [
    ...new Set([
      ...Array.from(
        { length: c.samples },
        (_, i) => firstLog + ((stopLog - firstLog) * i) / (c.samples - 1),
      ),
      ...events
        .filter((e) => e.id === 'turn' && e.logYears <= stopLog)
        .map((e) => e.logYears),
    ]),
  ].sort((a, b) => a - b);
  let pointIndex = 0,
    cached = -1,
    startK1: number[] | undefined;
  const outputPoints = [
    pts[0],
    ...times.map((lt) => {
      const targetU = Math.min(lastU, Math.log1p(10 ** (lt + logH0)));
      while (pointIndex + 1 < pts.length && pts[pointIndex + 1].u < targetU)
        pointIndex++;
      const start = pts[pointIndex];
      if (targetU === start.u) return { u: targetU, z: start.z };
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
      return { u: targetU, z: step.y };
    }),
  ];
  const samples: Sample[] = [];
  let maxConstraintResidual = 0;
  for (const p of outputPoints) {
    const a = p.z[0],
      v = p.z[1],
      tau = Math.expm1(p.u),
      lt = tau > 0 ? Math.log10(tau) - logH0 : 0;
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
      logRadiationEffectiveT: Math.log10(c.Tcmb) - la,
      q: E * E > 1e-20 ? (0.5 * (m + 2 * r + (n - 2) * d)) / (E * E) : null,
      w: c.deModel === 'lambda' ? -1 : c.w0,
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
    crunch,
    acceptedSteps,
    rejectedSteps,
    maxConstraintResidual,
    numericalUntilLogYears: Math.log10(Math.expm1(lastU)) - logH0,
  };
}
