import type { Configuration, CosmicEvent, Sample } from './types';
export const BH_LIFETIME_LOG = 67.321325469;
export const BH_TEMPERATURE = 6.1700738e-8;
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
    ? Math.max(remaining, 2.176434e-8 / (mass * 1.98847e30))
    : remaining;
}
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
export function cosmicEvents(
  c: Configuration,
  samples: Sample[],
  stopLog: number,
): CosmicEvent[] {
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
  for (const m of c.blackHoleMasses) {
    if (c.evaporation !== 'disabled')
      add(
        `bh-${m}`,
        `${m.toExponential(0)} M☉ black hole: ideal evaporation`,
        blackHoleLifetime(Math.log10(m), c.evaporationFactor),
        'Isolated, uncharged, nonrotating Hawking blackbody estimate. Background accretion, greybody factors and changing particle species are omitted; the endpoint is uncertain.',
        'Model dependent',
        ['hawking1975', 'page1976'],
      );
    const threshold = Math.log10(BH_TEMPERATURE / m);
    const crossing = samples.find(
      (s) => s.logTcmb !== null && s.logTcmb < threshold,
    );
    if (crossing)
      add(
        `cool-${m}`,
        `CMB cooler than ${m.toExponential(0)} M☉ Hawking temperature`,
        crossing.logYears,
        'Temperature crossing only: suggests the background changes from hotter to colder than this ideal black hole. It is not a complete net-accretion calculation.',
        'Model dependent',
        ['hawking1975'],
      );
  }
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
  for (let j = 1; j < samples.length; j++) {
    const p = samples[j - 1],
      s = samples[j];
    if (
      p.omegaM !== null &&
      p.omegaDE !== null &&
      s.omegaM !== null &&
      s.omegaDE !== null &&
      (p.omegaM - p.omegaDE) * (s.omegaM - s.omegaDE) < 0
    )
      add(
        'equality',
        'Matter–dark-energy equality',
        s.logYears,
        'Numerically detected crossing of the homogeneous matter and dark-energy density fractions.',
        'Model dependent',
        ['planck2018'],
      );
  }
  return e.sort((a, b) => a.logYears - b.logYears);
}
