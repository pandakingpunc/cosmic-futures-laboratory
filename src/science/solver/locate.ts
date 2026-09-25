import { LN10 } from '../core/constants';
import { pow10 } from '../core/pow';
import type { SimulationCounters } from './counters';
/** Brackets narrower than this, relative to max(1, |x|), end a root search. */
const WIDTH = 4 * Number.EPSILON;
/**
 * Root of f inside [lo, hi], where f(lo) and f(hi) lie on different sides of
 * zero (f < 0 against f ≥ 0). Illinois iteration: regula falsi that halves
 * the retained end's value when one end is kept twice, with a bisection
 * whenever two iterations fail to halve the bracket. It stops when the
 * bracket is 4ε wide, so the result is the root to floating-point
 * resolution of f, and returns the end with the smaller |f|.
 */
export function illinois(
  f: (x: number) => number,
  lo: number,
  flo: number,
  hi: number,
  fhi: number,
  counters?: SimulationCounters,
): number {
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  let a = flo,
    b = fhi,
    kept = 0;
  const widths = [Infinity, Infinity];
  for (let k = 0; k < 200; k++) {
    const width = hi - lo;
    if (width <= WIDTH * Math.max(1, Math.abs(lo), Math.abs(hi))) break;
    if (counters) counters.rootIterations++;
    let x = hi - (b * width) / (b - a);
    if (!(x > lo && x < hi) || width > widths[0] / 2) x = lo + width / 2;
    widths.shift();
    widths.push(width);
    const fx = f(x);
    if (fx === 0) return x;
    if (fx < 0 === flo < 0) {
      lo = x;
      flo = a = fx;
      if (kept === -1) b /= 2;
      kept = -1;
    } else {
      hi = x;
      fhi = b = fx;
      if (kept === 1) a /= 2;
      kept = 1;
    }
  }
  return Math.abs(flo) <= Math.abs(fhi) ? lo : hi;
}
/** log₁₀(10^a + 10^b) without overflow; −∞ terms are absent. */
export function logSum(a: number, b: number): number {
  const m = Math.max(a, b);
  return m === -Infinity ? m : m + Math.log10(pow10(a - m) + pow10(b - m));
}
/**
 * log₁₀ of the proper time Δt in years for ln a to grow by dx ≥ 0 along a
 * single-fluid tail ρ ∝ a⁻ⁿ with p = n/2 and anchor rate log₁₀ E* in yr⁻¹:
 * Δt = (e^{p·dx} − 1)/(pE*), or dx/E* for p = 0, the exact inverse of the
 * tail law. Evaluated in log space, so extreme expansions stay finite.
 */
export function tailLogElapsed(dx: number, p: number, logRate: number) {
  if (!(dx > 0)) return -Infinity;
  if (p === 0) return Math.log10(dx) - logRate;
  const growth = p * dx;
  return growth > 700
    ? growth / LN10 - Math.log10(p) - logRate
    : Math.log10(Math.expm1(growth) / p) - logRate;
}
