import type { Configuration } from './types';
import observations from '../../data/observations/cosmology-constraints.json';
export const presets = observations.presets;
export function defaultConfig(preset = 'planck2018'): Configuration {
  const p = presets.find((p) => p.id === preset) ?? presets[0];
  return {
    name: p.label,
    preset: p.id,
    H0: p.H0,
    omegaB: p.omegaB,
    omegaDM: p.omegaDM,
    omegaNu: p.omegaNu,
    omegaR: p.omegaR,
    omegaDE: p.omegaDE,
    omegaK: 0,
    Tcmb: 2.7255,
    Neff: p.Neff,
    deModel: p.deModel as Configuration['deModel'],
    w0: p.w0,
    wa: p.wa,
    expression: '-1 + 0.1 * sin(log(a))',
    dmModel: 'stable',
    dmLogLifetime: 12,
    annihilation: 0.01,
    interaction: 0.02,
    warmW: 0.001,
    protonDecay: false,
    protonLogLifetime: 36,
    electronDecay: false,
    electronLogLifetime: 30,
    evaporation: 'hawking',
    evaporationFactor: 1,
    blackHoleMasses: [10, 1e5, 1e9],
    vacuumDecay: false,
    vacuumLogLifetime: 100,
    sandbox: false,
    events: [],
    endLogYears: 100,
    samples: 240,
    seed: 42,
    rtol: 1e-8,
    atol: 1e-11,
  };
}
/** Configuration keys in their canonical (serialization and hashing) order. */
export const CONFIGURATION_KEYS = Object.keys(
  defaultConfig(),
) as readonly (keyof Configuration)[];
const own = (o: object, k: string) =>
  Object.prototype.hasOwnProperty.call(o, k);
/**
 * The known keys present in `input`, in canonical order, and the names of
 * every other own key. Missing keys stay missing; nothing is filled in.
 */
export function canonicalConfig(input: unknown): {
  config: Configuration;
  unknown: string[];
} {
  const source = (
    input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  ) as Record<string, unknown>;
  const config: Record<string, unknown> = {};
  for (const k of CONFIGURATION_KEYS) if (own(source, k)) config[k] = source[k];
  const known = new Set<string>(CONFIGURATION_KEYS);
  return {
    config: config as unknown as Configuration,
    unknown: Object.keys(source).filter((k) => !known.has(k)),
  };
}
/** Deeper nesting is rejected before any recursive copy is attempted. */
const MAX_DEPTH = 64;
/**
 * So are more values than this, counted as JSON writes them: an object
 * shared by several parents counts once per parent, so shared references
 * cannot make the traversal or the JSON text grow exponentially.
 */
const MAX_VALUES = 100_000;
/**
 * Why objects nest deeper than MAX_DEPTH (or cyclically) or hold more than
 * MAX_VALUES values, checked iteratively; null when neither holds.
 */
function copyProblem(value: unknown): string | null {
  const stack: [unknown, number][] = [[value, 0]];
  let values = 0;
  while (stack.length) {
    const [v, depth] = stack.pop()!;
    if (!v || typeof v !== 'object') continue;
    if (depth >= MAX_DEPTH)
      return `values are nested deeper than ${MAX_DEPTH} levels.`;
    const children = Object.values(v);
    values += children.length;
    if (values > MAX_VALUES) return `it holds more than ${MAX_VALUES} values.`;
    for (const child of children) stack.push([child, depth + 1]);
  }
  return null;
}
/**
 * An independent copy of the known keys of `input`, as canonicalConfig
 * selects them. Values that cannot be copied as JSON data (nesting deeper
 * than 64 levels, cycles, more than 10⁵ values as JSON would write them,
 * BigInts, functions or objects that refuse to be cloned) are never cloned
 * recursively: `problem` then explains why, and the copy keeps only the
 * fields that are JSON primitives.
 */
export function copyConfiguration(input: unknown): {
  config: Configuration;
  unknown: string[];
  problem: string | null;
} {
  const { config, unknown } = canonicalConfig(input);
  let problem: string;
  try {
    const reason = copyProblem(config);
    if (reason) throw new Error(reason);
    const copy = structuredClone(config);
    JSON.stringify(copy);
    return { config: copy, unknown, problem: null };
  } catch (e) {
    problem = `The configuration cannot be read as JSON data: ${(e as Error).message}`;
  }
  const primitive: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config))
    if (v === null || ['number', 'string', 'boolean'].includes(typeof v))
      primitive[k] = v;
  return { config: primitive as unknown as Configuration, unknown, problem };
}
/**
 * A complete configuration from a partial one: its known keys over the named
 * preset when `preset` is a known id, otherwise over the default preset.
 * Unknown keys are dropped.
 */
export function withDefaults(partial: unknown): Configuration {
  const { config } = canonicalConfig(partial);
  const id = typeof config.preset === 'string' ? config.preset : undefined;
  const base = defaultConfig(presets.some((p) => p.id === id) ? id : undefined);
  return { ...base, ...config };
}
