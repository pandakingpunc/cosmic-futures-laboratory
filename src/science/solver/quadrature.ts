// Gauss–Kronrod 7–15 abscissae and weights on [−1, 1] (QUADPACK qk15,
// rounded to double): Kronrod nodes descending to 0; the odd entries are
// also the 7-point Gauss nodes.
const XGK = [
  0.9914553711208126, 0.9491079123427585, 0.8648644233597691,
  0.7415311855993945, 0.5860872354676911, 0.4058451513773972,
  0.20778495500789848, 0,
];
const WGK = [
  0.022935322010529224, 0.06309209262997856, 0.10479001032225019,
  0.14065325971552592, 0.1690047266392679, 0.19035057806478542,
  0.20443294007529889, 0.20948214108472782,
];
const WG = [
  0.1294849661688697, 0.27970539148927664, 0.3818300505051189,
  0.4179591836734694,
];
/** ∫ₐᵇ f by the 15-point Kronrod rule, with |Kronrod − Gauss| as error. */
export function gaussKronrod(
  f: (x: number) => number,
  a: number,
  b: number,
): { value: number; error: number } {
  const c = 0.5 * (a + b),
    h = 0.5 * (b - a),
    fc = f(c);
  let k = fc * WGK[7],
    g = fc * WG[3];
  for (let j = 0; j < 7; j++) {
    const d = h * XGK[j],
      pair = f(c - d) + f(c + d);
    k += WGK[j] * pair;
    if (j % 2 === 1) g += WG[(j - 1) / 2] * pair;
  }
  return { value: k * h, error: Math.abs((k - g) * h) };
}
/** Accepted panels of ∫ f from edges[0]; cumulative[k] = ∫ to edges[k]. */
export interface Panels {
  edges: number[];
  cumulative: number[];
  total: number;
}
const PANEL_TOLERANCE = 1e-12,
  NEGLIGIBLE = 1e-18,
  MIN_WIDTH = 1e-9,
  MAX_PANELS = 20000;
/**
 * ∫_{x0}^∞ f for a positive f whose logarithm is eventually concave and
 * decreasing, on adaptive Gauss–Kronrod panels (each accepted when
 * |K − G| ≤ 10⁻¹²·K, far above the Kronrod error itself). The sum is
 * compensated. It stops where both the last panel and the bound f(b)/λ(b)
 * on the rest, with λ = −d ln f/dx > 0, are below 10⁻¹⁸ of the total, or
 * returns null after 20000 panels.
 */
export function decayingIntegral(
  f: (x: number) => number,
  logSlope: (x: number) => number,
  x0: number,
): Panels | null {
  const edges = [x0],
    cumulative = [0];
  let a = x0,
    h = 0.125,
    sum = 0,
    carry = 0;
  while (edges.length <= MAX_PANELS) {
    const r = gaussKronrod(f, a, a + h);
    if (r.error > PANEL_TOLERANCE * r.value && h > MIN_WIDTH) {
      h /= 2;
      continue;
    }
    // Neumaier summation keeps the total exact to rounding.
    const t = sum + r.value;
    carry += Math.abs(sum) >= r.value ? sum - t + r.value : r.value - t + sum;
    sum = t;
    a += h;
    edges.push(a);
    cumulative.push(sum + carry);
    const slope = logSlope(a),
      total = sum + carry;
    if (
      slope < 0 &&
      r.value <= NEGLIGIBLE * total &&
      f(a) <= -slope * NEGLIGIBLE * total
    )
      return { edges, cumulative, total };
    if (r.error < (PANEL_TOLERANCE / 64) * r.value) h = Math.min(4, 2 * h);
  }
  return null;
}
/** ∫ f from edges[0] to x ≥ edges[0] on the panels of `p`. */
export function integralTo(
  p: Panels,
  f: (x: number) => number,
  x: number,
): number {
  let lo = 0,
    hi = p.edges.length - 1;
  if (x >= p.edges[hi])
    return (
      p.cumulative[hi] +
      (x > p.edges[hi] ? gaussKronrod(f, p.edges[hi], x).value : 0)
    );
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p.edges[mid] <= x) lo = mid;
    else hi = mid;
  }
  return (
    p.cumulative[lo] +
    (x > p.edges[lo] ? gaussKronrod(f, p.edges[lo], x).value : 0)
  );
}
/**
 * The x at which ∫ f from edges[0] reaches `target` in [0, total): a
 * bracketed Newton iteration inside the panel holding it, with slope f, that
 * ends at floating-point resolution of x.
 */
export function solveIntegral(
  p: Panels,
  f: (x: number) => number,
  target: number,
): number {
  let k = 0;
  while (k + 2 < p.edges.length && p.cumulative[k + 1] <= target) k++;
  let lo = p.edges[k],
    hi = p.edges[k + 1];
  const base = p.cumulative[k],
    width = p.cumulative[k + 1] - base;
  let x = lo + (width > 0 ? ((target - base) / width) * (hi - lo) : 0);
  for (let i = 0; i < 100; i++) {
    if (!(x > lo && x < hi)) x = 0.5 * (lo + hi);
    const g = base + gaussKronrod(f, p.edges[k], x).value - target;
    if (g === 0) return x;
    if (g < 0) lo = x;
    else hi = x;
    if (hi - lo <= 4 * Number.EPSILON * Math.max(1, Math.abs(x))) break;
    const slope = f(x),
      step = slope > 0 ? g / slope : NaN;
    if (Math.abs(step) <= 2 * Number.EPSILON * Math.abs(x)) break;
    x = Number.isFinite(step) ? x - step : 0.5 * (lo + hi);
  }
  return x;
}
