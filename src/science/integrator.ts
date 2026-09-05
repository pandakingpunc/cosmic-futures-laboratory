export type Derivative = (x: number, y: number[]) => number[];
/** Dormand–Prince embedded 5(4), local RMS error using mixed absolute/relative scale. */
export function dopriStep(
  f: Derivative,
  x: number,
  y: number[],
  h: number,
  rtol: number,
  atol: number,
) {
  const a = [
    [],
    [1 / 5],
    [3 / 40, 9 / 40],
    [44 / 45, -56 / 15, 32 / 9],
    [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
    [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
  ];
  const c = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
  const b = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
  const low = [
    5179 / 57600,
    0,
    7571 / 16695,
    393 / 640,
    -92097 / 339200,
    187 / 2100,
    1 / 40,
  ];
  const k: number[][] = [];
  for (let s = 0; s < 7; s++) {
    const yy = y.map(
      (v, j) => v + h * a[s].reduce((t, coef, l) => t + coef * k[l][j], 0),
    );
    const d = f(x + c[s] * h, yy);
    if (d.some((v) => !Number.isFinite(v)))
      throw new Error('Non-finite derivative encountered.');
    k.push(d);
  }
  const next = y.map(
    (v, j) => v + h * b.reduce((t, coef, l) => t + coef * k[l][j], 0),
  );
  const errors = y.map(
    (v, j) =>
      (h * b.reduce((t, coef, l) => t + (coef - low[l]) * k[l][j], 0)) /
      (atol + rtol * Math.max(Math.abs(v), Math.abs(next[j]))),
  );
  const error = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / y.length);
  return {
    y: next,
    error,
    factor: error === 0 ? 4 : Math.max(0.1, Math.min(4, 0.9 * error ** -0.2)),
  };
}
