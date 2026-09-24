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
