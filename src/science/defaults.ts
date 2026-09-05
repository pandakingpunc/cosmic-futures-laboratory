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
