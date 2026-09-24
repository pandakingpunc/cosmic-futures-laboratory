import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BH_LIFETIME_LOG,
  BH_TEMPERATURE,
  logHawkingTemperature,
} from '../src/science/astrophysics';
import { logHorizonTemperature } from '../src/science/core/constants';
import { defaultConfig } from '../src/science/defaults';
import { simulate, validate } from '../src/science/engine';
import { report } from '../src/science/report';
import type { Configuration, Result } from '../src/science/types';
import { near, pure } from './helpers';
// Independent CODATA 2018 SI values (c, h, k_B exact; G measured) and the
// solar mass and megaparsec the engine documents.
const c = 299792458,
  hbar = 6.62607015e-34 / (2 * Math.PI),
  G = 6.6743e-11,
  kB = 1.380649e-23,
  Msun = 1.98847e30,
  Mpc = 3.085677581491367e22;
const perSecond = (H: number) => (H * 1e3) / Mpc;
const base = defaultConfig();
test('the solar Hawking constants follow from the CODATA module', () => {
  near(BH_TEMPERATURE, (hbar * c ** 3) / (8 * Math.PI * G * kB * Msun), 1e-15);
  // The lifetime keeps its 0.1.0 rounding, 1.7×10⁻⁹ dex below the formula.
  const exact = Math.log10(
    (5120 * Math.PI * G ** 2 * Msun ** 3) / (hbar * c ** 4) / 31557600,
  );
  assert.ok(Math.abs(BH_LIFETIME_LOG - exact) < 2e-9);
});
test('T_GH = ħH/(2πk_B) is reported exactly where the horizon entropy is', () => {
  const r = simulate(base);
  let shown = 0;
  for (const s of r.samples) {
    assert.equal(
      s.logHorizonTemperature === null,
      s.logHorizonEntropy === null,
    );
    if (s.logHorizonTemperature === null) continue;
    shown++;
    near(
      s.logHorizonTemperature!,
      Math.log10((hbar * perSecond(10 ** s.logH!)) / (2 * Math.PI * kB)),
      1e-13,
    );
  }
  assert.ok(shown > 50);
  // The Planck vacuum: H_Λ = H₀√Ωde and T_GH = 2.1958×10⁻³⁰ K.
  const T =
    (hbar * perSecond(base.H0 * Math.sqrt(base.omegaDE))) / (2 * Math.PI * kB);
  near(10 ** r.samples.at(-1)!.logHorizonTemperature!, T, 1e-12);
  near(T, 2.1958e-30, 1e-4);
  // No de Sitter temperature for quintessence or on a contracting branch.
  for (const other of [
    simulate({ ...base, deModel: 'constant', w0: -0.99 }),
    simulate(pure({ omegaB: 2, omegaK: -1, endLogYears: 12 })),
  ])
    assert.ok(other.samples.every((s) => s.logHorizonTemperature === null));
});
test('T_GH and S_dS stay G-consistent across a G change and the tail boundary', () => {
  const r = simulate({
    ...base,
    sandbox: true,
    endLogYears: 20,
    events: [{ id: 'g', logTime: 10.5, action: 'change-G', value: 4 }],
  });
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  // S T² = c⁵ħ/(4π gG k_B²) in de Sitter: log S + 2 log T + log g is fixed.
  const invariant = (logS: number, logT: number, g: number) =>
    logS + 2 * logT + Math.log10(g);
  const expected = Math.log10((c ** 5 * hbar) / (4 * Math.PI * G * kB ** 2));
  const after = r.samples.filter(
    (s) => s.logYears > 10.5 && s.logHorizonTemperature !== null,
  );
  assert.ok(after.some((s) => s.regime === 'numerical'));
  assert.ok(after.some((s) => s.regime === 'asymptotic'));
  for (const s of after)
    near(
      invariant(s.logHorizonEntropy!, s.logHorizonTemperature!, 4),
      expected,
      1e-13,
    );
  const i = r.samples.findIndex((s) => s.regime === 'asymptotic');
  near(
    r.samples[i - 1].logHorizonTemperature!,
    r.samples[i].logHorizonTemperature!,
    1e-12,
  );
  near(
    r.samples[i].logHorizonTemperature!,
    logHorizonTemperature(r.samples[i].logH!),
    1e-15,
  );
});
test('the Nariai mass of the Planck preset bounds its black holes', () => {
  const MN =
    c ** 3 /
    (3 * Math.sqrt(3) * G * perSecond(base.H0 * Math.sqrt(base.omegaDE))) /
    Msun;
  near(MN, 2.1631e22, 1e-4);
  const r = simulate(base);
  near(r.derived!.nariaiMass!, MN, 1e-12);
  assert.equal(r.derived!.blackHoleMassLimit, r.derived!.nariaiMass);
  for (const m of [1e30, 3e22]) {
    const v = validate({ ...base, blackHoleMasses: [m] });
    assert.match(v.fields.blackHoleMasses!, /Nariai mass 2\.16e\+22/);
    assert.equal(simulate({ ...base, blackHoleMasses: [m] }).status, 'invalid');
  }
  const accepted = validate({ ...base, blackHoleMasses: [1e9] });
  assert.deepEqual(accepted.errors, []);
  assert.ok(!accepted.warnings.some((w) => /Nariai/.test(w)));
  // Beyond 10⁻³ M_N the horizons interact: accepted with a warning that
  // also states the evaporation condition T_H > T_GH.
  const near1e20 = validate({ ...base, blackHoleMasses: [1e20] });
  assert.deepEqual(near1e20.errors, []);
  assert.ok(near1e20.warnings.some((w) => /Nariai.*T_H > T_GH/.test(w)));
  // Every accepted mass is hotter than the horizon: M_N < c³/(4GH_Λ).
  const logTGH = Math.log10(
    (hbar * perSecond(base.H0 * Math.sqrt(base.omegaDE))) / (2 * Math.PI * kB),
  );
  assert.ok(logHawkingTemperature(MN) > logTGH);
});
test('other dark energy is bounded by the mass whose horizon is today’s Hubble radius', () => {
  const hubble = (H0: number) => c ** 3 / (2 * G * perSecond(H0)) / Msun;
  const phantom: Configuration = { ...base, deModel: 'constant', w0: -1.5 };
  const r = simulate(phantom);
  assert.equal(r.derived!.nariaiMass, null);
  near(r.derived!.blackHoleMassLimit, hubble(base.H0), 1e-12);
  near(hubble(67.36), 4.65e22, 1e-3);
  assert.match(
    validate({ ...phantom, blackHoleMasses: [5e22] }).fields.blackHoleMasses!,
    /today's Hubble radius/,
  );
  const warned = validate({ ...phantom, blackHoleMasses: [1e22] });
  assert.deepEqual(warned.errors, []);
  assert.ok(warned.warnings.some((w) => /Hubble-radius mass/.test(w)));
  assert.ok(!warned.warnings.some((w) => /T_GH/.test(w)));
  // A dilute Λ has M_N above the Hubble-radius mass; the smaller one binds.
  const dilute = pure({ omegaB: 0.99, omegaDE: 0.01 });
  const bound = simulate(dilute).derived!;
  assert.ok(bound.nariaiMass! > bound.blackHoleMassLimit);
  assert.match(
    validate({ ...dilute, blackHoleMasses: [5e22] }).fields.blackHoleMasses!,
    /Hubble radius/,
  );
  // Invalid inputs report their own errors without a derived bound.
  const broken = simulate({ ...base, H0: Number.NaN });
  assert.equal(broken.status, 'invalid');
  assert.equal(broken.derived, undefined);
});
test('the report states the derived bound only when a file carries it', () => {
  const r = simulate(base);
  assert.match(report(r), /limited to 2\.163e\+22 M☉: the Nariai mass/);
  // Older files have no derived object; the import check also accepts one
  // of another version, which the report then skips instead of throwing.
  for (const derived of [undefined, { x: 1 }]) {
    const text = report({ ...r, derived } as unknown as Result);
    assert.doesNotMatch(text, /Black-hole masses are limited/);
  }
});
