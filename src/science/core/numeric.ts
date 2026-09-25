/** A finite number, or null so that JSON never receives ±Infinity or NaN. */
export const safe = (v: number): number | null =>
  Number.isFinite(v) ? v : null;
/** Natural logarithm with ln(v ≤ 0) = −∞ for absent components. */
export const ln = (v: number) => (v > 0 ? Math.log(v) : -Infinity);
/**
 * tanh x by fdlibm's formula from expm1, bit-identical to Math.tanh in
 * Node.js 24. Newer V8 versions evaluate Math.tanh with the C library, which
 * differs between operating systems; check:arch rejects it in src/science.
 */
export function tanhPortable(x: number): number {
  const ax = Math.abs(x);
  // tanh x = x for |x| < 2⁻²⁸, also for ±0; NaN falls through to x.
  if (!(ax >= 3.725290298461914e-9)) return x;
  let z: number;
  if (ax >= 22) z = 1;
  else if (ax >= 1) z = 1 - 2 / (Math.expm1(2 * ax) + 2);
  else {
    const t = Math.expm1(-2 * ax);
    z = -t / (t + 2);
  }
  return x < 0 ? -z : z;
}
