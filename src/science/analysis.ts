import type { Configuration, Result } from './types';
import { ValidationError } from './core/limits';
import { isSeed, mix32, seededRandom } from './core/random';
import { simulate, validate, type SimulateOptions } from './engine';
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
/**
 * Optional work counters and work budget, accumulated over every simulation
 * of an analysis; one budget is shared by all of its runs.
 */
export type AnalysisContext = Pick<SimulateOptions, 'counters' | 'budget'>;
const params: Parameter[] = ['H0', 'omegaM', 'w0', 'wa'];
function center(c: Configuration) {
  return [c.H0, c.omegaB + c.omegaDM + c.omegaNu, c.w0, c.wa];
}
/** Analyses start from a configuration that would itself simulate. */
function requireValidBase(c: Configuration) {
  const { errors } = validate(c);
  if (errors.length)
    throw new ValidationError(
      `Base configuration is invalid: ${errors.join(' ')}`,
    );
}
/** Indices of H0, Ωm, w0, wa that the selected dark-energy model never reads. */
function inactive(c: Configuration): number[] {
  return c.deModel === 'lambda' || c.deModel === 'custom'
    ? [2, 3]
    : c.deModel === 'constant'
      ? [3]
      : [];
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
const isMatrix = (m: unknown, columns: number): m is number[][] =>
  Array.isArray(m) &&
  m.every(
    (r) =>
      Array.isArray(r) &&
      r.length === columns &&
      r.every((v) => typeof v === 'number' && Number.isFinite(v)),
  );
export function cholesky(cov: number[][]): number[][] {
  if (!isMatrix(cov, 4) || cov.length !== 4)
    throw new ValidationError(
      'Covariance must be a finite 4×4 matrix, ordered H0, Ωm, w0, wa.',
    );
  const L = Array.from({ length: 4 }, () => Array(4).fill(0));
  for (let i = 0; i < 4; i++)
    for (let j = 0; j <= i; j++) {
      if (Math.abs(cov[i][j] - cov[j][i]) > 1e-10)
        throw new ValidationError('Covariance must be symmetric.');
      let v = cov[i][j];
      for (let k = 0; k < j; k++) v -= L[i][k] * L[j][k];
      if (i === j) {
        if (v <= 0)
          throw new ValidationError('Covariance must be positive definite.');
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
function checkEnsembleOptions(o: EnsembleOptions) {
  const fail = (message: string) => {
    throw new ValidationError(message);
  };
  if (!o || typeof o !== 'object' || !Array.isArray(o.sigmas))
    fail(
      'Ensemble options must include runs, seed, distribution, four sigmas and an interval.',
    );
  if (!Number.isInteger(o.runs) || o.runs < 4 || o.runs > 256)
    fail('Ensemble size must be an integer from 4 to 256.');
  if (!isSeed(o.seed)) fail('Seed must be an integer from 0 to 4294967295.');
  if (!isMatrix([o.sigmas], 4) || o.sigmas.some((v) => v < 0))
    fail('Four finite nonnegative distribution widths are required.');
  if (typeof o.interval !== 'number' || !(o.interval > 0 && o.interval < 1))
    fail('Central interval must be a number between 0 and 1.');
  if (o.distribution !== 'gaussian' && o.distribution !== 'uniform')
    fail('Distribution must be "gaussian" or "uniform".');
  if (o.covariance != null && o.distribution !== 'gaussian')
    fail('Covariance is supported with Gaussian sampling only.');
  if (o.covariance != null) cholesky(o.covariance);
  if (
    o.posterior != null &&
    (!isMatrix(o.posterior, 4) || o.posterior.length < 1)
  )
    fail('Posterior rows must contain four finite parameters.');
}
export function ensemble(
  c: Configuration,
  o: EnsembleOptions,
  context: AnalysisContext = {},
): EnsembleResult {
  checkEnsembleOptions(o);
  requireValidBase(c);
  const random = seededRandom(o.seed),
    // Per-run seeds of the vacuum clock come from a separate stream, so they
    // never repeat the parameter draws or a neighbouring ensemble seed.
    seeds = seededRandom(mix32(o.seed ^ 0x5bd1e995)),
    mu = center(c),
    posterior = o.posterior ?? null,
    L = !posterior && o.covariance ? cholesky(o.covariance) : null;
  const times = Array.from({ length: 80 }, (_, i) => (c.endLogYears * i) / 79),
    values = times.map(() => [] as number[]),
    outcomes: Record<string, number> = {};
  let rejected = 0,
    accepted = 0;
  for (let i = 0; i < o.runs; i++) {
    let v: number[];
    if (posterior) v = posterior[Math.floor(random() * posterior.length)];
    else {
      const z = mu.map(() =>
        o.distribution === 'uniform'
          ? (random() * 2 - 1) * Math.sqrt(3)
          : Math.sqrt(-2 * Math.log(Math.max(random(), 1e-15))) *
            Math.cos(2 * Math.PI * random()),
      );
      v = mu.map(
        (m, j) =>
          m +
          (L ? L[j].reduce((s, a, k) => s + a * z[k], 0) : o.sigmas[j] * z[j]),
      );
    }
    const run = simulate(
      {
        ...setParameters(c, v),
        seed: Math.floor(seeds() * 4294967296),
        samples: 80,
      },
      context,
    );
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
  const varies = (j: number) =>
    posterior
      ? posterior.some((r) => r[j] !== posterior[0][j])
      : L
        ? o.covariance![j][j] > 0
        : o.sigmas[j] > 0;
  const unused = inactive(c).filter(varies);
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
      posterior
        ? 'Resampling user-supplied posterior rows. Their provenance and fit assumptions must be supplied by the user.'
        : L
          ? 'User-supplied Gaussian covariance; not an automatically verified observational posterior.'
          : 'Independent illustrative distributions anchored to marginal errors; this is sensitivity sampling, not a joint observational posterior.',
      'Outcome frequencies describe this sampled assumption set, not probabilities for the actual ultimate fate.',
      'Bands are conditional on branches surviving to each plotted time. Rejected physical configurations are counted, not silently replaced.',
      'Ωde is explicitly derived by closure per draw; baryon/CDM/neutrino ratios are held fixed while Ωm varies.',
      ...(unused.length
        ? [
            `${unused.map((j) => params[j]).join(' and ')} draws have no effect under the selected dark-energy model (${c.deModel}).`,
          ]
        : []),
      ...(posterior && o.covariance != null
        ? [
            'Posterior rows were resampled; the supplied covariance was not used.',
          ]
        : []),
    ],
  };
}
/**
 * Finite-difference response of the expansion coordinate at
 * min(endpoint, 10¹¹ yr). Steps shrink with small H0 or Ωm; when one probe
 * is invalid the difference is one-sided against the unperturbed run, and
 * the scheme is reported. Rows without a response sort last.
 */
export function sensitivity(c: Configuration, context: AnalysisContext = {}) {
  requireValidBase(c);
  const base = center(c),
    deltas = [
      Math.min(1, 0.5 * c.H0),
      base[1] > 0 ? Math.min(0.01, 0.5 * base[1]) : 0.01,
      0.02,
      0.05,
    ];
  const horizon = Math.min(c.endLogYears, 11);
  const probe = (values: number[]) => {
    const run = simulate(
      { ...setParameters(c, values), endLogYears: horizon, samples: 60 },
      context,
    );
    return { run, value: interpolate(run, horizon) };
  };
  let unperturbed: number | null | undefined;
  const reference = () => (unperturbed ??= probe(base).value);
  return params
    .map((parameter, i) => {
      const plus = [...base],
        minus = [...base];
      plus[i] += deltas[i];
      minus[i] -= deltas[i];
      const a = probe(plus),
        b = probe(minus);
      let derivative: number | null = null,
        response: number | null = null,
        scheme: 'central' | 'forward' | 'backward' | null = null;
      if (a.value !== null && b.value !== null) {
        derivative = (a.value - b.value) / (2 * deltas[i]);
        response = Math.abs(a.value - b.value) / 2;
        scheme = 'central';
      } else if (a.value !== null || b.value !== null) {
        const mid = reference();
        if (mid !== null) {
          const side = a.value ?? b.value!,
            sign = a.value !== null ? 1 : -1;
          derivative = (sign * (side - mid)) / deltas[i];
          response = Math.abs(side - mid);
          scheme = a.value !== null ? 'forward' : 'backward';
        }
      }
      return {
        parameter,
        step: deltas[i],
        derivative,
        response,
        scheme,
        plusOutcome: a.run.classification,
        minusOutcome: b.run.classification,
        horizon,
      };
    })
    .sort(
      (a, b) =>
        Number(a.response === null) - Number(b.response === null) ||
        (b.response ?? 0) - (a.response ?? 0),
    );
}
const SWEEP_KEYS = ['w0Min', 'w0Max', 'waMin', 'waMax', 'resolution'] as const;
export function sweep(
  c: Configuration,
  range: {
    w0Min: number;
    w0Max: number;
    waMin: number;
    waMax: number;
    resolution: number;
  },
  context: AnalysisContext = {},
) {
  if (
    !range ||
    typeof range !== 'object' ||
    SWEEP_KEYS.some(
      (k) => typeof range[k] !== 'number' || !Number.isFinite(range[k]),
    ) ||
    !Number.isFinite(range.w0Max - range.w0Min) ||
    !Number.isFinite(range.waMax - range.waMin) ||
    range.resolution < 3 ||
    range.resolution > 15 ||
    !Number.isInteger(range.resolution) ||
    range.w0Min >= range.w0Max ||
    range.waMin >= range.waMax
  )
    throw new ValidationError(
      'Sweep needs finite ordered w0Min < w0Max and waMin < waMax and an integer 3–15 point grid.',
    );
  requireValidBase(c);
  const rows = [];
  for (let j = 0; j < range.resolution; j++)
    for (let i = 0; i < range.resolution; i++) {
      const w0 =
          range.w0Min +
          ((range.w0Max - range.w0Min) * i) / (range.resolution - 1),
        wa =
          range.waMin +
          ((range.waMax - range.waMin) * j) / (range.resolution - 1);
      const r = simulate(
        { ...c, deModel: 'bounded', w0, wa, samples: 40 },
        context,
      );
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
