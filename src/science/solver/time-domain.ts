import { astrophysics } from '../astrophysics';
import { C_KM_S, LN10 } from '../core/constants';
import { ln, safe } from '../core/numeric';
import { powPortable } from '../core/pow';
import type { Model } from '../model/background';
import { darkEnergyLaw } from '../model/segment';
import type { Sample } from '../types';
import type { TimePoint } from './crossings';
/**
 * The fluids of the time-domain branch as functions of a alone: stable
 * matter, radiation, curvature and dark energy with ρde ∝ a⁻ⁿ, or the CPL
 * closed form ρde ∝ a^(−3(1+w₀+wₐ)) exp(3wₐ(a − 1)).
 */
export function timeDomainFluids({ c, matter }: Model) {
  const cpl = darkEnergyLaw(c) === 'cpl',
    n = c.deModel === 'lambda' ? 0 : 3 * (1 + c.w0),
    M = matter + c.omegaDM;
  /** ln|ρde/ρc,0| of the CPL law at a. */
  const lnCpl = (a: number) =>
    ln(Math.abs(c.omegaDE)) +
    3 * (c.wa * (a - 1) - (1 + c.w0 + c.wa) * Math.log(a));
  /** Matter, radiation, dark-energy and curvature terms of E² at a. */
  const density = (a: number) => [
    M / powPortable(a, 3),
    c.omegaR / powPortable(a, 4),
    cpl
      ? Math.sign(c.omegaDE) * Math.exp(lnCpl(a))
      : c.omegaDE / powPortable(a, n),
    c.omegaK / powPortable(a, 2),
  ];
  /** The dark-energy w at a and the weight 1 + 3w of its term in ä/a. */
  const w = (a: number) =>
    cpl ? c.w0 + c.wa * (1 - a) : c.deModel === 'lambda' ? -1 : c.w0;
  const weight = (a: number) => (cpl ? 1 + 3 * w(a) : n - 2);
  /** log₁₀|ρde/ρc,0| at a, with la = log₁₀ a. */
  const logDE = (a: number, la: number) =>
    cpl ? lnCpl(a) / LN10 : Math.log10(Math.abs(c.omegaDE)) - n * la;
  /** |E² − Σuᵢ|/Σ|uᵢ| with E = v/a: zero wherever the constraint holds. */
  const residual = ([a, v]: readonly number[]) => {
    const [m, r, d, k] = density(a),
      E = v / a,
      scale = Math.abs(m) + r + Math.abs(d) + Math.abs(k);
    return Math.abs(E * E - (m + r + d + k)) / Math.max(1e-300, scale);
  };
  return { cpl, n, M, lnCpl, density, residual, w, weight, logDE };
}
/**
 * Scale factors of matter–dark-energy equality for positive dark energy:
 * (M/Ωde)^(1/(3−n)) for ρde ∝ a⁻ⁿ; for CPL the roots of ln(ρm/ρde), which is
 * convex in ln a for wₐ < 0 (at most two), found on a scan of ln a over the
 * time-domain range [−10, 30] and refined by bisection.
 */
export function equalities(model: Model): number[] {
  const { c } = model,
    { cpl, n, M, lnCpl } = timeDomainFluids(model);
  if (!(c.omegaDE > 0 && M > 0)) return [];
  if (!cpl)
    return n !== 3
      ? [Math.exp((Math.log(M) - Math.log(c.omegaDE)) / (3 - n))]
      : [];
  const g = (y: number) => Math.log(M) - 3 * y - lnCpl(Math.exp(y)),
    roots: number[] = [];
  for (let y = -10; y < 30; y += 0.05) {
    let lo = y,
      hi = y + 0.05;
    const glo = g(lo);
    if (glo < 0 === g(hi) < 0) continue;
    while (hi - lo > 4 * Number.EPSILON * Math.max(1, Math.abs(hi))) {
      const mid = 0.5 * (lo + hi);
      if (g(mid) < 0 === glo < 0) lo = mid;
      else hi = mid;
    }
    roots.push(Math.exp(0.5 * (lo + hi)));
  }
  return roots;
}
/** The output sample of a time-domain state at log₁₀ elapsed years `lt`. */
export function timeDomainSample(
  model: Model,
  { u, z }: TimePoint,
  lt: number,
): Sample {
  const { c } = model,
    { density, residual, w, weight, logDE } = timeDomainFluids(model);
  const [a, v] = z,
    tau = Math.expm1(u);
  const [m, r, d, k] = density(a),
    E = v / a;
  const la = Math.log10(a),
    eh = E === 0 ? null : Math.log10(c.H0 * Math.abs(E));
  return {
    logYears: lt,
    isPresent: tau === 0,
    logA: la,
    expansionIndex: Math.sign(la) * Math.log10(1 + Math.abs(la)),
    logH: eh,
    logRhoB: safe(Math.log10(c.omegaB) - 3 * la),
    logRhoDM: safe(Math.log10(c.omegaDM) - 3 * la),
    logRhoR: safe(Math.log10(c.omegaR) - 4 * la),
    logRhoDE: safe(logDE(a, la)),
    omegaM: E * E > 1e-20 ? m / (E * E) : null,
    omegaR: E * E > 1e-20 ? r / (E * E) : null,
    omegaDE: E * E > 1e-20 ? d / (E * E) : null,
    omegaK: E * E > 1e-20 ? k / (E * E) : null,
    logTcmb: Math.log10(c.Tcmb) - la,
    logRadiationEffectiveT: c.omegaR > 0 ? Math.log10(c.Tcmb) - la : null,
    q: E * E > 1e-20 ? (0.5 * (m + 2 * r + weight(a) * d)) / (E * E) : null,
    w: c.omegaDE === 0 ? null : w(a),
    logHubbleRadiusMpc: eh === null ? null : Math.log10(C_KM_S) - eh,
    logComovingHubbleMpc: eh === null ? null : Math.log10(C_KM_S) - eh - la,
    logHorizonEntropy: null,
    logHorizonTemperature: null,
    ...astrophysics(tau === 0 ? -Infinity : lt, c),
    regime: v < 0 ? 'contraction' : 'numerical',
    constraintResidual: residual(z),
  };
}
/**
 * Output times that resolve the collapse after the turnaround, spaced about
 * evenly in log₁₀ a from the maximum down to a = 10⁻⁴. Each time is placed
 * by linear interpolation of log₁₀ a in u inside an accepted step; the
 * sample itself is then computed exactly at that time.
 */
export function collapseTimes(
  pts: readonly TimePoint[],
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
