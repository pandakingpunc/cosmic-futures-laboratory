import { hasControl } from '../core/text';
import { compileExpression } from '../expression';
import type { Configuration } from '../types';
export type ValidationField = keyof Configuration | 'closure';
export interface Validation {
  errors: string[];
  warnings: string[];
  /** First error per configuration field, for inline form feedback. */
  fields: Partial<Record<ValidationField, string>>;
}
/** Ids of built-in timeline events, and prefixes of their families. */
const RESERVED_EVENT_ID =
  /^(?:starformation|laststars|relaxation|proton|electron|dark|equality|rip|turn|bounce|crunch|vacuum)$|^(?:bh|cool|equality)-/;
/** Largest |Ω|: beyond it closure cancellation exceeds double precision. */
const DENSITY_LIMIT = 1e12;
/** Largest |w| of the supported dark-energy equations. */
const W_LIMIT = 1e5;
export function validate(c: Configuration): Validation {
  const errors: string[] = [],
    warnings: string[] = [],
    fields: Validation['fields'] = {};
  const fail = (field: ValidationField, message: string) => {
    errors.push(message);
    fields[field] ??= message;
  };
  if (!c || typeof c !== 'object' || Array.isArray(c)) {
    fail('closure', 'The configuration must be an object.');
    return { errors, warnings, fields };
  }
  const numeric = [
    'H0',
    'omegaB',
    'omegaDM',
    'omegaNu',
    'omegaR',
    'omegaDE',
    'omegaK',
    'Tcmb',
    'Neff',
    'w0',
    'wa',
    'dmLogLifetime',
    'annihilation',
    'interaction',
    'warmW',
    'endLogYears',
    'samples',
    'seed',
    'rtol',
    'atol',
    'protonLogLifetime',
    'electronLogLifetime',
    'evaporationFactor',
    'vacuumLogLifetime',
  ] as const;
  for (const k of numeric)
    if (!Number.isFinite(c[k])) fail(k, `${k} must be finite.`);
  if (c.H0 < 1e-6 || c.H0 > 1000)
    fail(
      'H0',
      'H₀ must be between 10⁻⁶ and 1000 km/s/Mpc, the supported numerical range.',
    );
  for (const k of ['omegaB', 'omegaDM', 'omegaNu', 'omegaR'] as const)
    if (c[k] < 0)
      fail(
        k,
        `${k} cannot be negative in the supported fluid equations, including the sandbox.`,
      );
  for (const k of [
    'omegaB',
    'omegaDM',
    'omegaNu',
    'omegaR',
    'omegaDE',
    'omegaK',
  ] as const)
    if (Math.abs(c[k]) > DENSITY_LIMIT)
      fail(
        k,
        `${k} must lie within ±10¹²; larger cancelling densities exceed the precision of the Friedmann constraint.`,
      );
  const sum = Number(
    c.omegaB + c.omegaDM + c.omegaNu + c.omegaR + c.omegaDE + c.omegaK,
  );
  if (Math.abs(sum - 1) > 1e-5)
    fail(
      'closure',
      `Density closure fails: ΣΩ = ${sum.toPrecision(7)}. Set Ωde or Ωk explicitly so ΣΩ=1; values are never silently renormalized.`,
    );
  if (c.Tcmb <= 0) fail('Tcmb', 'CMB temperature must be positive.');
  if (c.Neff < 0 || c.Neff > 20)
    fail('Neff', 'Effective relativistic species must be between zero and 20.');
  for (const k of [
    'protonLogLifetime',
    'electronLogLifetime',
    'vacuumLogLifetime',
  ] as const)
    if (c[k] < 0 || c[k] > 1000) fail(k, `${k} must lie between 0 and 1000.`);
  if (c.endLogYears < 0 || c.endLogYears > 1000)
    fail('endLogYears', 'Endpoint must be from 1 to 10^1000 elapsed years.');
  if (c.samples < 40 || c.samples > 1000 || !Number.isInteger(c.samples))
    fail('samples', 'Choose 40–1000 output samples.');
  if (c.rtol < 1e-12 || c.rtol > 1e-3)
    fail('rtol', 'Relative tolerance must lie between 10⁻¹² and 10⁻³.');
  if (c.atol < 1e-14 || c.atol > 1e-5)
    fail('atol', 'Absolute tolerance must lie between 10⁻¹⁴ and 10⁻⁵.');
  if (c.evaporationFactor <= 0)
    fail('evaporationFactor', 'Evaporation multiplier must be positive.');
  if (
    !Array.isArray(c.blackHoleMasses) ||
    c.blackHoleMasses.length < 1 ||
    c.blackHoleMasses.length > 12 ||
    c.blackHoleMasses.some((m) => m <= 0 || !Number.isFinite(m) || m > 1e30)
  )
    fail(
      'blackHoleMasses',
      'Supply 1–12 black-hole masses in (0, 10^30] solar masses.',
    );
  else if (new Set(c.blackHoleMasses).size !== c.blackHoleMasses.length)
    fail('blackHoleMasses', 'Black-hole masses must be distinct.');
  if (!['hawking', 'disabled', 'remnant'].includes(c.evaporation))
    fail('evaporation', 'Unknown black-hole evaporation model.');
  if (typeof c.name !== 'string') fail('name', 'Universe name must be text.');
  else if (c.name.length > 120 || hasControl(c.name))
    fail(
      'name',
      'Universe name must be at most 120 characters without line breaks or control characters.',
    );
  if (typeof c.preset !== 'string' || c.preset.length > 64)
    fail(
      'preset',
      'Preset must be a text identifier of at most 64 characters.',
    );
  if (!Number.isInteger(c.seed) || c.seed < 0 || c.seed > 0xffffffff)
    fail('seed', 'Seed must be an integer from 0 to 4294967295.');
  if (
    ['constant', 'cpl', 'bounded'].includes(c.deModel) &&
    Math.abs(c.w0) > W_LIMIT
  )
    fail('w0', 'w₀ must lie within ±10⁵, the supported finite range.');
  if (c.deModel === 'bounded' && Math.abs(c.w0 + c.wa) > W_LIMIT)
    fail(
      'wa',
      'The bounded limit w₀+wₐ must lie within ±10⁵, the supported finite range.',
    );
  if (typeof c.expression !== 'string')
    fail('expression', 'Custom expression must be text.');
  for (const k of [
    'sandbox',
    'protonDecay',
    'electronDecay',
    'vacuumDecay',
  ] as const)
    if (typeof c[k] !== 'boolean') fail(k, `${k} must be a boolean.`);
  if (!['lambda', 'constant', 'cpl', 'bounded', 'custom'].includes(c.deModel))
    fail('deModel', 'Unknown dark-energy model.');
  if (
    !['stable', 'decay', 'annihilation', 'warm', 'interacting'].includes(
      c.dmModel,
    )
  )
    fail('dmModel', 'Unknown dark-matter model.');
  if (c.dmLogLifetime < 0 || c.dmLogLifetime > 1000)
    fail(
      'dmLogLifetime',
      'Dark-matter log lifetime must lie between 0 and 1000.',
    );
  if (c.interaction < 0)
    fail('interaction', 'Transfer coefficient ξ cannot be negative.');
  if (c.annihilation < 0)
    fail('annihilation', 'Annihilation coefficient A cannot be negative.');
  if (c.warmW < 0 || c.warmW > 1 / 3)
    fail('warmW', 'Warm-fluid w must lie between 0 and 1/3.');
  if (!Array.isArray(c.events))
    fail('events', 'Custom events must be an array.');
  else {
    if (c.events.length > 20)
      fail('events', 'At most 20 custom events are supported.');
    if (c.events.length && !c.sandbox)
      fail('sandbox', 'Enable the nonstandard sandbox to apply custom events.');
    for (const e of c.events)
      if (
        !e ||
        typeof e.id !== 'string' ||
        !Number.isFinite(e.logTime) ||
        e.logTime < 0 ||
        e.logTime > 1000 ||
        !Number.isFinite(e.value) ||
        ![
          'change-w',
          'vacuum-scale',
          'change-G',
          'halt',
          'reverse',
          'dm-lifetime',
        ].includes(e.action)
      )
        fail('events', 'Invalid custom event.');
      else if (!e.id || e.id.length > 64 || hasControl(e.id))
        fail(
          'events',
          'Custom event ids must be 1–64 characters without control characters.',
        );
      else if (RESERVED_EVENT_ID.test(e.id))
        fail(
          'events',
          `Custom event id "${e.id}" is reserved for a built-in timeline event.`,
        );
    const ids = c.events.map((e) => e?.id);
    if (new Set(ids).size !== ids.length)
      fail('events', 'Custom event ids must be unique.');
  }
  if (c.deModel === 'custom') {
    try {
      const f = compileExpression(c.expression);
      for (const a of [1, 1.01, 2, 10]) f(a);
    } catch (e) {
      fail('expression', (e as Error).message);
    }
  }
  if (c.deModel === 'cpl')
    warnings.push(
      'CPL is an observational parametrization, w(a)=w₀+wₐ(1−a), and generally diverges as a→∞. Its simulated future is an unvalidated mathematical extrapolation.',
    );
  if (c.deModel === 'bounded')
    warnings.push(
      'The bounded model w(a)=w₀+wₐ(1−1/a) is a phenomenological future continuation, not a scalar-field calculation or an observational posterior.',
    );
  if (c.deModel === 'custom')
    warnings.push(
      'A finite sample of w(a) cannot establish its asymptotic fate. Custom equations terminate at the supported numerical boundary.',
    );
  if (c.dmModel !== 'stable')
    warnings.push(
      'Dark-matter microphysics is unknown. Decay/annihilation/interaction rates here are user assumptions, not measured constraints. Warm-fluid pressure does not model free streaming or structure formation.',
    );
  if (c.protonDecay || c.electronDecay)
    warnings.push(
      'Particle survival is a tracer module: decay products do not feed back into the Friedmann densities. Expansion at decay-dominated epochs is therefore conditional on this test-population approximation.',
    );
  if (c.sandbox)
    warnings.push(
      'NONSTANDARD PHYSICS SANDBOX — THESE SETTINGS MAY VIOLATE KNOWN PHYSICS. Instantaneous parameter changes can require external energy or momentum.',
    );
  warnings.push(
    'Massive neutrinos are pressureless over this future-only integration. Ωr is an independently specified photons + effective massless-neutrino density. Tcmb and Neff do not silently recompute Ωr.',
  );
  warnings.push(
    'Stellar populations and remnant eras are phenomenological proxies; no N-body dynamics, stellar population synthesis, or exact entropy budget is computed.',
  );
  return { errors, warnings, fields };
}
