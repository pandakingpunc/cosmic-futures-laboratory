export type Derivative = (x: number, y: number[]) => number[];
// Dormand–Prince 5(4) Butcher tableau, allocated once rather than per step.
const A: readonly (readonly number[])[] = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1] as const;
const B = [
  35 / 384,
  0,
  500 / 1113,
  125 / 192,
  -2187 / 6784,
  11 / 84,
  0,
] as const;
const LOW = [
  5179 / 57600,
  0,
  7571 / 16695,
  393 / 640,
  -92097 / 339200,
  187 / 2100,
  1 / 40,
] as const;
const ERROR = B.map((b, l) => b - LOW[l]);
export interface Step {
  y: number[];
  error: number;
  factor: number;
  /** f(x, y), or undefined when stage one was not evaluated exactly there. */
  k1: number[] | undefined;
  /** f(x + h, y_next): the first stage of the next step (FSAL). */
  k7: number[];
}
function evaluate(f: Derivative, x: number, y: number[]) {
  const d = f(x, y);
  for (let j = 0; j < d.length; j++)
    if (!Number.isFinite(d[j]))
      throw new Error('Non-finite derivative encountered.');
  return d;
}
/**
 * Dormand–Prince embedded 5(4), local RMS error using mixed absolute/relative
 * scale. Sums run over every tableau entry, zeros included, in the order of
 * version 0.2.0, so results are bit-identical to that implementation.
 *
 * `k1`, when given, must be f(x, y) for the same f. Stage one evaluates
 * f(x + 0·h, y + 0·h); the cache is used only when those arguments equal
 * (x, y) bit for bit, which fails solely for a −0 coordinate or a
 * nonfinite h.
 */
export function dopriStep(
  f: Derivative,
  x: number,
  y: readonly number[],
  h: number,
  rtol: number,
  atol: number,
  k1?: number[],
): Step {
  const n = y.length,
    k: number[][] = [];
  // Stage one: x + c₁h and y + h·(empty sum), both offset by 0·h.
  const shift = C[0] * h,
    x1 = x + shift,
    y1 = y.map((v) => v + shift);
  let exact = Object.is(x1, x);
  for (let j = 0; j < n; j++) exact = exact && Object.is(y1[j], y[j]);
  k.push(k1 && exact ? k1 : evaluate(f, x1, y1));
  for (let s = 1; s < 7; s++) {
    const a = A[s],
      yy: number[] = [];
    for (let j = 0; j < n; j++) {
      let t = 0;
      for (let l = 0; l < s; l++) t = t + a[l] * k[l][j];
      yy[j] = y[j] + h * t;
    }
    k.push(evaluate(f, x + C[s] * h, yy));
  }
  const next: number[] = [];
  let squares = 0;
  for (let j = 0; j < n; j++) {
    let t = 0;
    for (let l = 0; l < 7; l++) t = t + B[l] * k[l][j];
    next[j] = y[j] + h * t;
  }
  for (let j = 0; j < n; j++) {
    let t = 0;
    for (let l = 0; l < 7; l++) t = t + ERROR[l] * k[l][j];
    const e =
      (h * t) / (atol + rtol * Math.max(Math.abs(y[j]), Math.abs(next[j])));
    squares = squares + e * e;
  }
  const error = Math.sqrt(squares / n);
  return {
    y: next,
    error,
    factor: error === 0 ? 4 : Math.max(0.1, Math.min(4, 0.9 * error ** -0.2)),
    k1: exact ? k[0] : undefined,
    k7: k[6],
  };
}
