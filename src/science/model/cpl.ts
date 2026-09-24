import type { CosmicEvent, PhysicsEvent } from '../types';
import { DOMINANCE } from './asymptote';
import type { Background } from './background';
import type { Segment } from './segment';
/**
 * Proof-based futures of the CPL law w(a) = w₀ + wₐ(1 − a), whose density
 * has the closed form |ρde|/ρc,0 = |Ωde| a^(−3(1+w₀+wₐ)) exp(3wₐ(a − 1)).
 * w(a) is monotonic, so one state can settle the whole future:
 *
 * - extinction (wₐ < 0): w grows without bound. Once w ≥ 1/3, no other
 *   supported component dilutes faster (matter 0, warm dark matter ≤ 1/3,
 *   radiation together with any dark-matter transfer into it ≤ 1/3,
 *   curvature −1/3), so |ρde| relative to each can never grow again.
 * - big-rip (wₐ > 0): w falls without bound. Once w ≤ −1 and dark energy
 *   dominates to 10⁻⁸, ρde never decreases while every other density never
 *   increases, and ln ρde ≈ 3wₐa, so ∫dx/E converges: a, H and ρde diverge
 *   at a finite proper time.
 */
export type CplTheorem = 'extinction' | 'big-rip';
/**
 * Default ε: dark energy is dropped once |Ωde|(1 + 3w) < ε, so E² and the
 * acceleration equation change by less than ε, far below double precision.
 */
export const EXTINCTION = 1e-20;
/** Which theorem's conditions hold at an accepted state of a CPL segment. */
export function cplTheorem(
  b: Background,
  s: Segment,
  threshold = EXTINCTION,
): CplTheorem | null {
  if (s.deModel !== 'cpl' || s.signDE === 0) return null;
  const f = b.fractions;
  if (s.wa < 0 && b.w >= 1 / 3 && Math.abs(f[3]) * (1 + 3 * b.w) < threshold)
    return 'extinction';
  if (
    s.wa > 0 &&
    s.signDE > 0 &&
    b.w <= -1 &&
    Math.abs(f[0]) + Math.abs(f[1]) + Math.abs(f[2]) + Math.abs(f[4]) <=
      DOMINANCE
  )
    return 'big-rip';
  return null;
}
/** Custom events that change w or the vacuum density void both proofs. */
export const altersDarkEnergy = (e: PhysicsEvent) =>
  e.action === 'change-w' || e.action === 'vacuum-scale';
/** ln|ρde/ρc,0| at x = ln a from its value l0 at x0, in closed form. */
export function cplLogDensity(
  x: number,
  x0: number,
  l0: number,
  s: Segment,
): number {
  return (
    l0 -
    3 * (1 + s.w0 + s.wa) * (x - x0) +
    3 * s.wa * Math.exp(x0) * Math.expm1(x - x0)
  );
}
const FIRST_YEAR =
  ' It occurs within the first elapsed year and is shown at one year.';
/** The timeline event of a dropped CPL dark energy at log₁₀ time `raw`. */
export function extinctionEvent(
  raw: number,
  a: number,
  w: number,
  omegaDE: number,
): CosmicEvent {
  return {
    id: 'de-extinct',
    title:
      'Dark energy becomes dynamically negligible (literal CPL extrapolation)',
    logYears: Math.max(0, raw),
    detail: `With wₐ < 0 the CPL law w(a)=w₀+wₐ(1−a) grows without bound. At a = ${a.toPrecision(6)}, w = ${w.toPrecision(6)} ≥ 1/3 and the dark-energy fraction is ${omegaDE.toPrecision(3)}, below the extinction threshold even when weighted by 1+3w. No supported component dilutes faster, so the fraction can never grow again; the dark energy is dropped from the background, changing H by a relative amount far below double precision. A literal extrapolation of an observational fit ansatz, not a prediction.${raw < 0 ? FIRST_YEAR : ''}`,
    reliability: 'Model dependent',
    sources: ['chevallier2001', 'linder2003'],
  };
}
