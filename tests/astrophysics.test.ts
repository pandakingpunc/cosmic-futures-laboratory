import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate } from '../src/science/engine';
import { defaultConfig } from '../src/science/defaults';
import {
  blackHoleFraction,
  blackHoleLifetime,
  survival,
  cosmicEvents,
} from '../src/science/astrophysics';
import { near, pure } from './helpers';
test('Hawking mass cubed scaling, half-mass time, stable remnants', () => {
  near(
    10 **
      (blackHoleLifetime(Math.log10(20)) - blackHoleLifetime(Math.log10(10))),
    8,
    1e-10,
  );
  const c = defaultConfig(),
    t = blackHoleLifetime(1) + Math.log10(7 / 8);
  near(blackHoleFraction(t, 10, c), 0.5, 1e-10);
  assert.ok(blackHoleFraction(100, 10, { ...c, evaporation: 'remnant' }) > 0);
  near(blackHoleFraction(100, 10, { ...c, evaporation: 'disabled' }), 1);
});
test('particle mean lifetime leaves exp(-1)', () => {
  near(survival(36, 36), Math.exp(-1), 1e-12);
});
test('future matter–dark-energy equality is detected with unique event ids', () => {
  // The reference universe is already dark-energy dominated, so its equality
  // lies in the past; a matter-dominated start crosses in the future.
  const c = pure({ omegaB: 0.7, omegaDE: 0.3, endLogYears: 11 }),
    r = simulate(c);
  const equality = r.events.filter((e) => e.id.startsWith('equality'));
  assert.equal(equality.length, 1);
  assert.equal(equality[0].id, 'equality');
  const at = r.samples.find((s) => s.logYears === equality[0].logYears)!;
  assert.ok(Math.abs(at.omegaM! - at.omegaDE!) < 0.06);
  assert.equal(r.events.filter((e) => e.id === 'equality').length, 1);
  // A later w switch lets matter overtake again: ids stay unique.
  const two = simulate({
    ...c,
    endLogYears: 12,
    sandbox: true,
    events: [{ id: 'w', logTime: 10.5, action: 'change-w', value: 1 }],
  });
  const ids = cosmicEvents(two.config, two.samples, 12).map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.filter((id) => id.startsWith('equality')).length >= 1);
});
