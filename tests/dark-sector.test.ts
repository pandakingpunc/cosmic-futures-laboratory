import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate } from '../src/science/engine';
import { defaultConfig } from '../src/science/defaults';
import { near, pure } from './helpers';
test('decaying dark matter has conserved paired transfer and positive radiation', () => {
  const c = pure({
      omegaDM: 0.3,
      omegaDE: 0.7,
      dmModel: 'decay',
      dmLogLifetime: 10,
      endLogYears: 11,
    }),
    r = simulate(c);
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  for (const s of r.samples.slice(1)) {
    const tau = 10 ** (s.logYears - c.dmLogLifetime),
      expected = Math.log10(c.omegaDM) - 3 * s.logA! - tau / Math.LN10;
    near(s.logRhoDM!, expected, 3e-6);
    assert.ok(s.logRhoR !== null);
  }
});
test('zero daughter radiation is supported initially', () => {
  const r = simulate(
    pure({ omegaDM: 0.3, omegaDE: 0.7, dmModel: 'decay', dmLogLifetime: 12 }),
  );
  assert.notEqual(r.status, 'invalid');
  assert.ok(r.samples.at(-1)!.logRhoR !== null);
});
test('bounded model has conditional accelerated asymptote', () => {
  const r = simulate({
    ...defaultConfig(),
    deModel: 'bounded',
    w0: -0.9,
    wa: 0,
  });
  assert.equal(r.classification, 'Eternal accelerated power-law expansion');
});
test('decay tail matches elapsed donor survival across the numerical boundary', () => {
  const c = {
      ...defaultConfig(),
      dmModel: 'decay' as const,
      dmLogLifetime: 12,
      endLogYears: 13,
    },
    r = simulate(c);
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  for (const s of r.samples.filter((s) => s.regime === 'asymptotic'))
    near(
      s.logRhoDM!,
      Math.log10(c.omegaDM) - 3 * s.logA! - 10 ** (s.logYears - 12) / Math.LN10,
      1e-7,
    );
});
