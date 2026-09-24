/** A finite number, or null so that JSON never receives ±Infinity or NaN. */
export const safe = (v: number): number | null =>
  Number.isFinite(v) ? v : null;
/** Natural logarithm with ln(v ≤ 0) = −∞ for absent components. */
export const ln = (v: number) => (v > 0 ? Math.log(v) : -Infinity);
