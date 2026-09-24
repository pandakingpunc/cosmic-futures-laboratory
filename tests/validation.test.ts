import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate, validate } from '../src/science/engine';
import { defaultConfig } from '../src/science/defaults';
import type { Configuration } from '../src/science/types';
test('validation rejects invalid closure and negative matter', () => {
  assert.ok(validate({ ...defaultConfig(), omegaDM: -1 }).errors.length);
  assert.equal(simulate({ ...defaultConfig(), omegaDE: 0 }).status, 'invalid');
});
test('malformed imported arrays and booleans return explicit validation errors', () => {
  const c = {
    ...defaultConfig(),
    events: null,
    blackHoleMasses: null,
    protonDecay: 'true',
  } as unknown as Configuration;
  assert.equal(simulate(c).status, 'invalid');
});
test('duplicate black-hole masses are rejected with a field message', () => {
  const v = validate({ ...defaultConfig(), blackHoleMasses: [10, 10] });
  assert.ok(v.errors.some((e) => e.includes('distinct')));
  assert.ok(v.fields.blackHoleMasses);
  assert.equal(validate(defaultConfig()).errors.length, 0);
});
test('validation maps errors to configuration fields', () => {
  const v = validate({
    ...defaultConfig(),
    H0: -1,
    rtol: 1,
    atol: 1,
    omegaDE: 0.5,
    warmW: 2,
  });
  for (const f of ['H0', 'rtol', 'atol', 'closure', 'warmW'] as const)
    assert.ok(v.fields[f], `missing field message for ${f}`);
  assert.equal(new Set(v.errors).size, v.errors.length);
  assert.equal(validate(defaultConfig()).fields.H0, undefined);
});
