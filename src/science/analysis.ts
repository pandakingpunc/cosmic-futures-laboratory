import type { Configuration, Result } from './types';
import { simulate, seededRandom } from './engine';
export type Parameter = 'H0' | 'omegaM' | 'w0' | 'wa';
export interface EnsembleOptions {
  runs: number;
  seed: number;
  distribution: 'gaussian' | 'uniform';
  sigmas: number[];
  covariance?: number[][];
  posterior?: number[][];
  interval: number;
}
export interface EnsembleResult {
  runs: number;
  accepted: number;
  rejected: number;
  seed: number;
  interval: number;
  bands: {
    logYears: number;
    median: number;
    low68: number;
    high68: number;
    low95: number;
    high95: number;
    low: number;
    high: number;
    surviving: number;
  }[];
  outcomes: Record<string, number>;
  notes: string[];
}
const params: Parameter[] = ['H0', 'omegaM', 'w0', 'wa'];
function center(c: Configuration) {
  return [c.H0, c.omegaB + c.omegaDM + c.omegaNu, c.w0, c.wa];
}
export function setParameters(
  c: Configuration,
  values: number[],
): Configuration {
  const old = c.omegaB + c.omegaDM + c.omegaNu,
    scale = old > 0 ? values[1] / old : 1;
  return {
    ...c,
    H0: values[0],
    omegaB: old > 0 ? c.omegaB * scale : values[1],
    omegaDM: c.omegaDM * scale,
    omegaNu: c.omegaNu * scale,
    omegaDE: 1 - values[1] - c.omegaR - c.omegaK,
    w0: values[2],
    wa: values[3],
  };
}
export function cholesky(cov: number[][]): number[][] {
  if (
    cov.length !== 4 ||
    cov.some((r) => r.length !== 4 || r.some((v) => !Number.isFinite(v)))
  )
    throw new Error(
      'Covariance must be a finite 4×4 matrix, ordered H0, Ωm, w0, wa.',
    );
  const L = Array.from({ length: 4 }, () => Array(4).fill(0));
  for (let i = 0; i < 4; i++)
    for (let j = 0; j <= i; j++) {
      if (Math.abs(cov[i][j] - cov[j][i]) > 1e-10)
        throw new Error('Covariance must be symmetric.');
      let v = cov[i][j];
      for (let k = 0; k < j; k++) v -= L[i][k] * L[j][k];
      if (i === j) {
        if (v <= 0) throw new Error('Covariance must be positive definite.');
        L[i][j] = Math.sqrt(v);
      } else L[i][j] = v / L[j][j];
    }
  return L;
}
export function quantile(a: number[], p: number) {
  if (!a.length) return NaN;
  const b = [...a].sort((x, y) => x - y),
    j = (b.length - 1) * p;
  return b[Math.floor(j)] + (b[Math.ceil(j)] - b[Math.floor(j)]) * (j % 1);
}
export function interpolate(
  r: Result,
  logYears: number,
  key: 'expansionIndex' | 'logH' = 'expansionIndex',
): number | null {
  const arr = r.samples.filter((s) => !s.isPresent);
  if (
    !arr.length ||
    logYears < arr[0].logYears - 1e-8 ||
    logYears > arr[arr.length - 1].logYears + 1e-8
  )
    return null;
  let i = 0;
  while (i + 1 < arr.length && arr[i + 1].logYears < logYears) i++;
  const a = arr[i],
    b = arr[Math.min(i + 1, arr.length - 1)],
    v = a[key],
    w = b[key];
  if (v === null || w === null) return null;
  return b.logYears === a.logYears
    ? v
    : v + ((w - v) * (logYears - a.logYears)) / (b.logYears - a.logYears);
}
export function ensemble(c: Configuration, o: EnsembleOptions): EnsembleResult {
  if (!Number.isInteger(o.runs) || o.runs < 4 || o.runs > 256)
    throw new Error('Ensemble size must be 4–256.');
  if (
    !Number.isFinite(o.seed) ||
    o.sigmas.length !== 4 ||
    o.sigmas.some((v) => v < 0 || !Number.isFinite(v))
  )
    throw new Error(
      'Seed and four nonnegative distribution widths are required.',
    );
  if (o.interval <= 0 || o.interval >= 1)
    throw new Error('Central interval must be between 0 and 1.');
  if (o.covariance && o.distribution !== 'gaussian')
    throw new Error('Covariance is supported with Gaussian sampling only.');
  if (
    o.posterior &&
    (o.posterior.length < 1 ||
      o.posterior.some(
        (r) => r.length !== 4 || r.some((v) => !Number.isFinite(v)),
      ))
  )
    throw new Error('Posterior rows must contain four finite parameters.');
  const random = seededRandom(o.seed),
    mu = center(c),
    L = o.covariance ? cholesky(o.covariance) : null;
  const times = Array.from({ length: 80 }, (_, i) => (c.endLogYears * i) / 79),
    values = times.map(() => [] as number[]),
    outcomes: Record<string, number> = {};
  let rejected = 0,
    accepted = 0;
  for (let i = 0; i < o.runs; i++) {
    const z = mu.map(() =>
      o.distribution === 'uniform'
        ? (random() * 2 - 1) * Math.sqrt(3)
        : Math.sqrt(-2 * Math.log(Math.max(random(), 1e-15))) *
          Math.cos(2 * Math.PI * random()),
    );
    const v = o.posterior
      ? o.posterior[Math.floor(random() * o.posterior.length)]
      : mu.map(
          (m, j) =>
            m +
            (L
              ? L[j].reduce((s, a, k) => s + a * z[k], 0)
              : o.sigmas[j] * z[j]),
        );
    const run = simulate({
      ...setParameters(c, v),
      seed: o.seed + i,
      samples: 80,
    });
    if (run.status === 'invalid') {
      rejected++;
      continue;
    }
    accepted++;
    outcomes[run.classification] = (outcomes[run.classification] ?? 0) + 1;
    times.forEach((t, j) => {
      const v = interpolate(run, t);
      if (v !== null && Number.isFinite(v)) values[j].push(v);
    });
  }
  return {
    runs: o.runs,
    accepted,
    rejected,
    seed: o.seed,
    interval: o.interval,
    bands: times.flatMap((t, j) =>
      values[j].length
        ? [
            {
              logYears: t,
              median: quantile(values[j], 0.5),
              low68: quantile(values[j], 0.16),
              high68: quantile(values[j], 0.84),
              low95: quantile(values[j], 0.025),
              high95: quantile(values[j], 0.975),
              low: quantile(values[j], (1 - o.interval) / 2),
              high: quantile(values[j], (1 + o.interval) / 2),
              surviving: values[j].length,
            },
          ]
        : [],
    ),
    outcomes,
    notes: [
      o.posterior
        ? 'Resampling user-supplied posterior rows. Their provenance and fit assumptions must be supplied by the user.'
        : L
          ? 'User-supplied Gaussian covariance; not an automatically verified observational posterior.'
          : 'Independent illustrative distributions anchored to marginal errors; this is sensitivity sampling, not a joint observational posterior.',
      'Outcome frequencies describe this sampled assumption set, not probabilities for the actual ultimate fate.',
      'Bands are conditional on branches surviving to each plotted time. Rejected physical configurations are counted, not silently replaced.',
      'Ωde is explicitly derived by closure per draw; baryon/CDM/neutrino ratios are held fixed while Ωm varies.',
    ],
  };
}
export function sensitivity(c: Configuration) {
  const base = center(c),
    deltas = [1, 0.01, 0.02, 0.05];
  const horizon = Math.min(c.endLogYears, 11);
  return params
    .map((parameter, i) => {
      const plus = [...base],
        minus = [...base];
      plus[i] += deltas[i];
      minus[i] -= deltas[i];
      const a = simulate({
          ...setParameters(c, plus),
          endLogYears: horizon,
          samples: 60,
        }),
        b = simulate({
          ...setParameters(c, minus),
          endLogYears: horizon,
          samples: 60,
        });
      const av = interpolate(a, horizon),
        bv = interpolate(b, horizon);
      return {
        parameter,
        step: deltas[i],
        derivative:
          av === null || bv === null ? null : (av - bv) / (2 * deltas[i]),
        response: av === null || bv === null ? null : Math.abs(av - bv) / 2,
        plusOutcome: a.classification,
        minusOutcome: b.classification,
        horizon,
      };
    })
    .sort((a, b) => (b.response ?? 0) - (a.response ?? 0));
}
export function sweep(
  c: Configuration,
  range: {
    w0Min: number;
    w0Max: number;
    waMin: number;
    waMax: number;
    resolution: number;
  },
) {
  if (
    !Object.values(range).every(Number.isFinite) ||
    range.resolution < 3 ||
    range.resolution > 15 ||
    !Number.isInteger(range.resolution) ||
    range.w0Min >= range.w0Max ||
    range.waMin >= range.waMax
  )
    throw new Error('Sweep needs ordered finite ranges and a 3–15 point grid.');
  const rows = [];
  for (let j = 0; j < range.resolution; j++)
    for (let i = 0; i < range.resolution; i++) {
      const w0 =
          range.w0Min +
          ((range.w0Max - range.w0Min) * i) / (range.resolution - 1),
        wa =
          range.waMin +
          ((range.waMax - range.waMin) * j) / (range.resolution - 1);
      const r = simulate({ ...c, deModel: 'bounded', w0, wa, samples: 40 });
      rows.push({
        w0,
        wa,
        outcome: r.classification,
        status: r.status,
        finalExpansion: r.samples.at(-1)?.expansionIndex ?? null,
      });
    }
  return rows;
}
