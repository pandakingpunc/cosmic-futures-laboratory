import {
  PLANCK_MASS,
  SOLAR_EVAPORATION_LOG_YEARS,
  SOLAR_HAWKING_TEMPERATURE,
  SOLAR_MASS,
  hubbleMass,
  logHorizonTemperature,
  nariaiMass,
} from './core/constants';
import { asymptoticW } from './model/asymptote';
import { darkEnergyLaw } from './model/segment';
import type { Configuration, CosmicEvent, Sample } from './types';
export const BH_LIFETIME_LOG = SOLAR_EVAPORATION_LOG_YEARS;
export const BH_TEMPERATURE = SOLAR_HAWKING_TEMPERATURE;
export function survival(logYears: number, logLifetime: number): number {
  const d = logYears - logLifetime;
  return d > 3 ? 0 : d < -15 ? 1 : Math.exp(-(10 ** d));
}
export function blackHoleLifetime(logMass: number, factor = 1): number {
  return BH_LIFETIME_LOG + 3 * logMass - Math.log10(factor);
}
export function blackHoleFraction(
  logYears: number,
  mass: number,
  c: Configuration,
): number {
  if (c.evaporation === 'disabled') return 1;
  const ratio =
    10 **
    Math.min(
      4,
      logYears - blackHoleLifetime(Math.log10(mass), c.evaporationFactor),
    );
  const remaining = Math.max(0, 1 - ratio) ** (1 / 3);
  return c.evaporation === 'remnant'
    ? Math.max(remaining, PLANCK_MASS / (mass * SOLAR_MASS))
    : remaining;
}
/** log₁₀ of the Hawking temperature in kelvin of a mass in M☉. */
export const logHawkingTemperature = (mass: number) =>
  Math.log10(BH_TEMPERATURE / mass);
export interface MassLimit {
  /** Largest black-hole mass accepted by validation, in M☉. */
  limit: number;
  /** Nariai mass in M☉ of a positive cosmological constant, or null. */
  nariai: number | null;
}
/**
 * Black-hole masses whose horizon fits the configured background: below the
 * mass whose Schwarzschild radius is today's Hubble radius c/H₀ and, for a
 * positive cosmological constant, below the Nariai mass for H_Λ = H₀√Ωde.
 */
export function blackHoleMassLimit(c: Configuration): MassLimit {
  const law = darkEnergyLaw(c);
  const lambda =
    c.omegaDE > 0 &&
    (law === 'lambda' ||
      (law === 'constant' &&
        asymptoticW({
          g: 1,
          signDE: 1,
          deModel: 'constant',
          w0: c.w0,
          wa: 0,
        }) === -1));
  const nariai = lambda ? nariaiMass(c.H0 * Math.sqrt(c.omegaDE)) : null,
    hubble = hubbleMass(c.H0);
  return { limit: nariai === null ? hubble : Math.min(nariai, hubble), nariai };
}
/** A mass in M☉ to three significant figures, e.g. 15 → 1.5e+1. */
const massLabel = (m: number) => Number(m.toPrecision(3)).toExponential();
export function astrophysics(logYears: number, c: Configuration) {
  return {
    stellarFraction: 1 / (1 + 10 ** Math.min(300, 1.4 * (logYears - 12.5))),
    baryonSurvival: c.protonDecay ? survival(logYears, c.protonLogLifetime) : 1,
    electronSurvival: c.electronDecay
      ? survival(logYears, c.electronLogLifetime)
      : 1,
    bhMassFractions: c.blackHoleMasses.map((m) =>
      blackHoleFraction(logYears, m, c),
    ),
  };
}
/**
 * Crossing times located on the continuous solution, as log₁₀ elapsed years;
 * negative values lie within the first elapsed year.
 */
export interface LocatedEvents {
  /** Every matter–dark-energy equality, in time order. */
  equality: number[];
  /** Per selected mass: the CMB falls below its Hawking temperature. */
  cool: number[][];
  /** Per selected mass: the CMB rises above its Hawking temperature. */
  warm: number[][];
  /** The CMB first falls below the de Sitter horizon temperature. */
  horizon: number | null;
}
const FIRST_YEAR =
  ' It occurs within the first elapsed year and is shown at one year.';
const HORIZON_DETAIL =
  'The adiabatically redshifted photon temperature Tγ,0/a falls below the Gibbons–Hawking temperature ħH/(2πk_B), defined here only while dark energy with w = −1 dominates to 10⁻⁸. The horizon radiation is not added to the background.';
/**
 * Sign changes of a sample quantity relative to a threshold, reported at the
 * later sample: the fallback for results without located crossing times.
 */
function scan(
  samples: readonly Sample[],
  gap: (s: Sample) => number | null,
): { down: number[]; up: number[] } {
  const down: number[] = [],
    up: number[] = [];
  for (let j = 1; j < samples.length; j++) {
    const p = gap(samples[j - 1]),
      s = gap(samples[j]);
    if (p === null || s === null) continue;
    if (p >= 0 && s < 0) down.push(samples[j].logYears);
    if (p < 0 && s >= 0) up.push(samples[j].logYears);
  }
  return { down, up };
}
/** Crossing times from the samples alone, as older result files hold them. */
export function scanEvents(c: Configuration, samples: Sample[]): LocatedEvents {
  const hawking = c.blackHoleMasses.map((m) => {
    const threshold = logHawkingTemperature(m);
    return scan(samples, (s) =>
      s.logTcmb === null ? null : s.logTcmb - threshold,
    );
  });
  const horizon = scan(samples, (s) =>
    s.logTcmb === null || s.logHorizonTemperature == null
      ? null
      : s.logTcmb - s.logHorizonTemperature,
  ).down;
  // Only a change between nonzero signs is a crossing: leading-order tail
  // fractions of subdominant components are exactly zero, which is none. A
  // run of exact zeros between opposite signs dates the crossing.
  const equality: number[] = [];
  let sign = 0,
    zero: number | null = null;
  for (const s of samples) {
    const d =
      s.omegaM === null || s.omegaDE === null ? null : s.omegaM - s.omegaDE;
    if (d === null) sign = 0;
    else if (d === 0) zero ??= s.logYears;
    else {
      if (sign && Math.sign(d) !== sign) equality.push(zero ?? s.logYears);
      sign = Math.sign(d);
    }
    if (d !== 0) zero = null;
  }
  return {
    equality,
    cool: hawking.map((h) => h.down),
    warm: hawking.map((h) => h.up),
    horizon: horizon[0] ?? null,
  };
}
export function cosmicEvents(
  c: Configuration,
  samples: Sample[],
  stopLog: number,
  exact?: LocatedEvents | null,
): CosmicEvent[] {
  const located = exact ?? scanEvents(c, samples);
  const e: CosmicEvent[] = [];
  const add = (
    id: string,
    title: string,
    logYears: number,
    detail: string,
    reliability: CosmicEvent['reliability'],
    sources: string[],
    range?: [number, number],
  ) => {
    if (logYears <= Math.min(c.endLogYears, stopLog) && logYears >= 0)
      e.push({ id, title, logYears, detail, reliability, sources, range });
  };
  /**
   * A located crossing; inside the first year it is shown at one year. A
   * crossing exactly at the present (raw −∞) is not a future event.
   */
  const crossing = (
    id: string,
    title: string,
    raw: number,
    detail: string,
    sources: string[],
  ) => {
    if (raw > -Infinity)
      add(
        id,
        title,
        Math.max(0, raw),
        raw < 0 ? detail + FIRST_YEAR : detail,
        'Model dependent',
        sources,
      );
  };
  /** Ids of repeated crossings: `base`, `base-2`, `base-3`, … */
  const numbered = (base: string, i: number) =>
    i === 0 ? base : `${base}-${i + 1}`;
  add(
    'starformation',
    'Star formation becomes scarce',
    12,
    'Illustrative depletion range for gas and long-lived stellar populations; not a computed galaxy-formation history.',
    'Model dependent',
    ['adams1997'],
    [11, 13],
  );
  add(
    'laststars',
    'Long-lived normal stars fade',
    14,
    'Low-mass stellar lifetimes motivate this broad transition into a remnant-rich era. The plotted stellar fraction is a phenomenological proxy.',
    'Model dependent',
    ['adams1997'],
    [13, 14.5],
  );
  add(
    'relaxation',
    'Bound systems may disperse',
    20,
    'Repeated gravitational encounters can eject members of bound stellar systems. Environment-dependent order-of-magnitude range.',
    'Model dependent',
    ['adams1997'],
    [19, 22],
  );
  if (c.protonDecay)
    add(
      'proton',
      'One assumed proton mean lifetime',
      c.protonLogLifetime,
      'About 37% survives under the selected exponential survival proxy. Proton decay has not been observed; experimental bounds are channel-specific partial lifetimes. This module does not feed back into the homogeneous expansion.',
      'Theoretically speculative',
      ['superk2020'],
    );
  if (c.electronDecay)
    add(
      'electron',
      'One assumed electron mean lifetime',
      c.electronLogLifetime,
      'Hypothetical exponential survival, not a measured lifetime; charge conservation may be violated depending on the channel.',
      'Pure what-if',
      ['borexino2015'],
    );
  c.blackHoleMasses.forEach((m, k) => {
    if (c.evaporation !== 'disabled')
      add(
        `bh-${m}`,
        `${massLabel(m)} M☉ black hole: ideal evaporation`,
        blackHoleLifetime(Math.log10(m), c.evaporationFactor),
        'Isolated, uncharged, nonrotating Hawking blackbody estimate. Background accretion, greybody factors and changing particle species are omitted; net evaporation also requires the hole to be hotter than any horizon radiation (T_H > T_GH). The endpoint is uncertain.',
        'Model dependent',
        ['hawking1975', 'page1976'],
      );
    located.cool[k]?.forEach((t, i) =>
      crossing(
        numbered(`cool-${m}`, i),
        `CMB cooler than ${massLabel(m)} M☉ Hawking temperature`,
        t,
        'Located temperature crossing: the redshifted CMB changes from hotter to colder than this ideal black hole. It is not a complete net-accretion calculation.',
        ['hawking1975'],
      ),
    );
    located.warm[k]?.forEach((t, i) =>
      crossing(
        numbered(`warm-${m}`, i),
        `CMB hotter than ${massLabel(m)} M☉ Hawking temperature`,
        t,
        'Located temperature crossing on a contracting branch: the blueshifted CMB becomes hotter than this ideal black hole, so background absorption can again exceed its Hawking emission. It is not a complete net-accretion calculation.',
        ['hawking1975'],
      ),
    );
  });
  if (c.evaporation !== 'disabled' && c.blackHoleMasses.length) {
    const last = Math.max(
      ...c.blackHoleMasses.map((m) =>
        blackHoleLifetime(Math.log10(m), c.evaporationFactor),
      ),
    );
    add(
      'dark',
      'Selected black-hole population depleted',
      last,
      c.evaporation === 'remnant'
        ? 'Assumed stable remnants remain. This is not proof that every black hole in the Universe has vanished.'
        : `The largest selected representative mass reaches its ideal evaporation endpoint. ${c.protonDecay ? 'Matter survival depends on the selected decay assumption.' : 'Stable matter and degenerate remnants may remain.'}`,
      'Model dependent',
      ['adams1997', 'page1976'],
    );
  }
  [...located.equality]
    .sort((a, b) => a - b)
    .forEach((t, i) =>
      crossing(
        numbered('equality', i),
        'Matter–dark-energy equality',
        t,
        exact
          ? 'Crossing of the homogeneous matter and dark-energy density fractions, located on the continuous solution.'
          : 'Numerically detected crossing of the homogeneous matter and dark-energy density fractions.',
        ['planck2018'],
      ),
    );
  if (located.horizon !== null)
    crossing(
      'horizon-temperature',
      'CMB photons fall below the de Sitter horizon temperature',
      located.horizon,
      HORIZON_DETAIL,
      ['gibbons1977'],
    );
  return e.sort((a, b) => a.logYears - b.logYears);
}
/** log₁₀ Tγ − log₁₀ T_GH for log₁₀ a and log₁₀ H in km s⁻¹ Mpc⁻¹. */
export function horizonGap(c: Configuration, logA: number, logH: number) {
  return Math.log10(c.Tcmb) - logA - logHorizonTemperature(logH);
}
