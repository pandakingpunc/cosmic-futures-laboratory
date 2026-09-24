import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate } from '../src/science/engine';
import { defaultConfig } from '../src/science/defaults';
import { near, pure } from './helpers';
test('custom tail w switch matches density continuously and updates w', () => {
  const r = simulate({
    ...defaultConfig(),
    sandbox: true,
    events: [{ id: 'w', logTime: 13, action: 'change-w', value: -0.8 }],
    endLogYears: 14,
  });
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  const s = r.samples.at(-1)!;
  near(s.w!, -0.8, 1e-10);
  const at = r.samples.find((s) => s.logYears === 13)!;
  const delta = s.logA! - at.logA!;
  near(s.logRhoDE!, at.logRhoDE! - 0.6 * delta, 1e-7);
});
test('nonstandard vacuum sign flip returns last valid state', () => {
  const r = simulate({
    ...defaultConfig(),
    sandbox: true,
    events: [
      { id: 'negative', logTime: 10, action: 'vacuum-scale', value: -10 },
    ],
  });
  assert.ok(r.status === 'terminated' || r.status === 'limited');
  assert.ok(r.samples.length > 0);
});
test('custom events remain disabled by default and are not ignored', () => {
  const c = {
    ...defaultConfig(),
    events: [{ id: 'a', logTime: 40, action: 'halt' as const, value: 0 }],
  };
  assert.equal(simulate(c).status, 'invalid');
  // A halt in the matched tail stops exactly as it does numerically.
  const r = simulate({ ...c, sandbox: true });
  assert.equal(r.status, 'terminated');
  assert.equal(r.classification, 'Custom intervention boundary');
  assert.ok(r.events.some((e) => e.id === 'a'));
});
test('simultaneous tail events compose without losing previous changes', () => {
  const c = {
      ...defaultConfig(),
      sandbox: true,
      endLogYears: 14,
      events: [
        { id: 'g', logTime: 13, action: 'change-G' as const, value: 4 },
        { id: 'v', logTime: 13, action: 'vacuum-scale' as const, value: 9 },
      ],
    },
    r = simulate(c);
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  const at = r.samples.find((s) => s.logYears === 13)!,
    last = r.samples.at(-1)!;
  near(last.logH! - at.logH!, Math.log10(6), 1e-9);
  near(last.logRhoDE! - at.logRhoDE!, Math.log10(9), 1e-9);
});
test('a vacuum suppression that removes dominance stops explicitly', () => {
  const r = simulate({
    ...defaultConfig(),
    sandbox: true,
    endLogYears: 14,
    events: [{ id: 'v', logTime: 12.1, action: 'vacuum-scale', value: 1e-200 }],
  });
  assert.equal(r.status, 'limited');
  assert.ok(r.diagnostics.reason.includes('dominance'));
  assert.ok(r.samples.at(-1)!.logYears <= 12.1);
});
test('a stiff tail intervention cannot pretend dark energy stays dominant', () => {
  const r = simulate({
    ...defaultConfig(),
    sandbox: true,
    endLogYears: 1000,
    events: [{ id: 'w', logTime: 13, action: 'change-w', value: 1 }],
  });
  assert.equal(r.status, 'limited');
  assert.ok(r.diagnostics.reason.includes('overtake'));
});
test('unsupported tiny H0 and nonflat G interventions are explicit boundaries', () => {
  assert.equal(simulate({ ...defaultConfig(), H0: 1e-320 }).status, 'invalid');
  const r = simulate(
    pure({
      omegaK: 1,
      sandbox: true,
      events: [{ id: 'g', logTime: 6, action: 'change-G', value: 4 }],
    }),
  );
  assert.equal(r.status, 'limited');
  assert.ok(r.diagnostics.reason.includes('curved'));
});
test('custom events after the requested endpoint are never executed', () => {
  const r = simulate(
    pure({
      omegaDE: 1,
      endLogYears: 6,
      sandbox: true,
      events: [{ id: 'halt', logTime: 8, action: 'halt', value: 0 }],
    }),
  );
  assert.equal(r.status, 'complete');
  assert.ok(!r.events.some((e) => e.id === 'halt'));
  near(r.samples.at(-1)!.logYears, 6);
});
test('simultaneous numerical interventions share one time boundary', () => {
  const c = pure({ omegaDE: 1, endLogYears: 11 }),
    a = simulate(c),
    b = simulate({
      ...c,
      sandbox: true,
      events: [
        { id: 'g', logTime: 10, action: 'change-G', value: 4 },
        { id: 'v', logTime: 10, action: 'vacuum-scale', value: 0.25 },
      ],
    });
  assert.equal(b.status, 'complete', b.diagnostics.reason);
  near(b.samples.at(-1)!.logA!, a.samples.at(-1)!.logA!, 1e-7);
});
