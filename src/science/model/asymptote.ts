import type { Background, Model } from './background';
import type { Segment } from './segment';
/**
 * Asymptotic analysis shared by the finite classification, the matched tail
 * and the routing of closed models. Components are indexed as in
 * Background.logs: matter, dark matter, radiation, dark energy, curvature.
 */
export interface Asymptote {
  /** Density exponent of the dominant term, ρ ∝ a⁻ⁿ. */
  n: number;
  /** Components sharing that exponent; ties form one effective fluid. */
  dominant: number[];
  /** Exponent of the dark energy when it is present, otherwise null. */
  deN: number | null;
  /**
   * Why a single constant-w tail cannot continue this branch although its
   * asymptotic class is known, or null when the tail is supported.
   */
  tailReason: string | null;
}
/** Largest deviation from exact dominance accepted as a single-fluid limit. */
export const DOMINANCE = 1e-8;
export const UNSUPPORTED =
  'No proven constant-fluid asymptote for this model. Numerical expansion stops at ln(a)=60; arbitrary CPL/custom extrapolation is not continued.';
const NEGATIVE_DE =
  'Negative dark energy dilutes no faster than the dominant positive component, so it can halt the expansion; no single-fluid asymptote is proven.';
const CLOSED =
  'Closed curvature decays no faster than the dominant positive component, so a turnaround cannot be excluded; no single-fluid asymptote is proven.';
const TRANSFER =
  'The dominant component exchanges energy with dark matter or radiation; a single constant-w tail is proven only when dark energy dominates alone.';
/**
 * The limit of w(a) for dark-energy laws with a proven constant asymptote,
 * or null. Deviations from −1 at the rounding level of w₀ (+ wₐ) are snapped
 * to −1, so decimal inputs whose sum is −1 cannot turn into a spurious
 * phantom or power-law fate.
 */
export function asymptoticW(s: Segment): number | null {
  if (s.deModel === 'lambda') return -1;
  if (s.deModel === 'constant') return snap(s.w0, Math.abs(s.w0));
  if (s.deModel === 'bounded')
    return snap(s.w0 + s.wa, Math.abs(s.w0) + Math.abs(s.wa));
  return null;
}
const snap = (w: number, scale: number) =>
  Math.abs(1 + w) <= 8 * Number.EPSILON * (1 + scale) ? -1 : w;
/**
 * A dark-energy w that equals −1 at the rounding level of the segment's
 * parameters: the numerical counterpart of a snapped asymptote n = 0.
 */
export function isVacuumW(w: number, s: Segment): boolean {
  const scale =
    s.deModel === 'custom'
      ? Math.abs(w)
      : s.deModel === 'constant'
        ? Math.abs(s.w0)
        : Math.abs(s.w0) + Math.abs(s.wa);
  return snap(w, scale) === -1;
}
/** Density exponents n of ρ ∝ a⁻ⁿ; dark energy only for a proven limit. */
export function exponents(model: Model, s: Segment): number[] {
  const { c } = model,
    w = asymptoticW(s);
  return [
    3,
    c.dmModel === 'warm'
      ? 3 * (1 + c.warmW)
      : c.dmModel === 'interacting'
        ? 3 + c.interaction
        : 3,
    4,
    w === null ? NaN : 3 * (1 + w),
    2,
  ];
}
const TIE = 1e-12;
/**
 * The component that dominates as a → ∞ along an expanding branch, from the
 * components present in `b`. Returns a reason when the model family does not
 * guarantee one.
 */
export function asymptote(
  model: Model,
  b: Background,
  s: Segment,
): Asymptote | { reason: string } {
  const n = exponents(model, s);
  if (s.signDE !== 0 && Number.isNaN(n[3])) return { reason: UNSUPPORTED };
  const positive = [0, 1, 2, 3, 4].filter(
    (i) =>
      Number.isFinite(b.logs[i]) &&
      (i !== 3 || s.signDE > 0) &&
      (i !== 4 || model.signK > 0),
  );
  if (!positive.length) return { reason: UNSUPPORTED };
  const nMin = Math.min(...positive.map((i) => n[i]));
  const dominant = positive.filter((i) => n[i] - nMin <= TIE);
  // Negative terms must dilute strictly faster than the dominant one.
  if (model.signK < 0 && !(nMin < 2)) return { reason: CLOSED };
  if (s.signDE < 0 && !(n[3] > nMin + TIE)) return { reason: NEGATIVE_DE };
  // Transfers only move energy between components that dilute at least as
  // fast as matter, so they cannot change the class; they do prevent a
  // single constant-w tail unless dark energy dominates alone.
  const alone = dominant.length === 1 && dominant[0] === 3;
  return {
    n: nMin,
    dominant,
    deN: s.signDE !== 0 ? n[3] : null,
    tailReason:
      alone || ['stable', 'warm'].includes(model.c.dmModel) ? null : TRANSFER,
  };
}
/**
 * True when E² stays positive for every future scale factor, so the branch
 * never turns around. Requires positive fluids of constant exponent and a
 * closed curvature term: then g(s) = a²E²/const is a sum of exponentials in
 * s = ln(a/a₀) plus a constant, which is convex, and its minimum decides.
 */
export function neverTurnsAround(
  model: Model,
  b: Background,
  s: Segment,
): boolean {
  const { c } = model;
  if (s.signDE < 0) return false;
  if (model.signK >= 0) return true;
  if (!['stable', 'warm'].includes(c.dmModel)) return false;
  if (s.signDE > 0 && s.deModel !== 'lambda' && s.deModel !== 'constant')
    return false;
  const n = exponents(model, s);
  const max = Math.max(...b.logs.filter(Number.isFinite));
  const terms = [0, 1, 2, 3]
    .filter((i) => Number.isFinite(b.logs[i]))
    .map((i) => ({ A: Math.exp(b.logs[i] - max), k: 2 - n[i] }))
    .filter((t) => t.A > 0);
  // Only a component decaying slower than curvature can keep E² > 0.
  if (!terms.some((t) => t.k > 0)) return false;
  const K = -Math.exp(b.logs[4] - max);
  const g = (v: number) =>
      terms.reduce((sum, t) => sum + t.A * Math.exp(t.k * v), 0),
    slope = (v: number) =>
      terms.reduce((sum, t) => sum + t.A * t.k * Math.exp(t.k * v), 0);
  let lo = 0,
    hi = 0;
  if (slope(0) < 0) {
    hi = 1;
    while (slope(hi) < 0) {
      lo = hi;
      hi *= 2;
    }
    for (let k = 0; k < 200 && hi - lo > 1e-12 * Math.max(1, hi); k++) {
      const mid = (lo + hi) / 2;
      if (slope(mid) < 0) lo = mid;
      else hi = mid;
    }
  }
  const positive = g(hi);
  return positive + K > 1e-9 * positive;
}
