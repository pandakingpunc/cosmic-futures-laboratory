import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dopriStep, type Derivative } from '../src/science/solver/dopri5';
import { integrateContraction } from '../src/science/solver/contraction';
import { createModel } from '../src/science/model/background';
import { H0_YEAR } from '../src/science/core/constants';
import { near, pure } from './helpers';
const decay: Derivative = (_, y) => [-y[0]];
function countingCalls(f: Derivative) {
  const calls = { n: 0 };
  const g: Derivative = (x, y) => {
    calls.n++;
    return f(x, y);
  };
  return { g, calls };
}
test('Dormand–Prince on y′ = −y reproduces its stability polynomial', () => {
  // R(z) = Σ_{k≤5} zᵏ/k! + z⁶/600 for the fifth-order DOPRI5 solution.
  for (const h of [0.1, 0.5, 1]) {
    const z = -h,
      R = 1 + z + z ** 2 / 2 + z ** 3 / 6 + z ** 4 / 24 + z ** 5 / 120;
    const step = dopriStep(decay, 0, [1], h, 1e-8, 1e-11);
    near(step.y[0], R + z ** 6 / 600, 1e-14);
    assert.ok(step.error > 0 && step.factor > 0);
  }
});
test('the last stage is exactly the next first stage (FSAL)', () => {
  const f: Derivative = (x, y) => [Math.cos(x) * y[1], -y[0] / (1 + x * x)];
  const x = 0.3,
    h = 0.07,
    step = dopriStep(f, x, [1, 0.5], h, 1e-8, 1e-11);
  assert.deepEqual(step.k7, f(x + h, step.y));
  assert.deepEqual(step.k1, f(x, [1, 0.5]));
  const cold = countingCalls(f),
    warm = countingCalls(f);
  const a = dopriStep(cold.g, x + h, step.y, h, 1e-8, 1e-11);
  const b = dopriStep(warm.g, x + h, step.y, h, 1e-8, 1e-11, step.k7);
  assert.deepEqual(b, a);
  assert.equal(cold.calls.n, 7);
  assert.equal(warm.calls.n, 6);
});
test('a cached first stage is ignored unless its arguments match bit for bit', () => {
  const f: Derivative = (_, y) => [Object.is(y[0], -0) ? 7 : 3 - y[0]];
  const fresh = dopriStep(f, 0, [-0], 0.1, 1e-8, 1e-11);
  // The first stage evaluates f(x, y + 0·h), which turns −0 into +0.
  assert.deepEqual(dopriStep(f, 0, [-0], 0.1, 1e-8, 1e-11, f(0, [-0])), fresh);
  assert.equal(fresh.k1, undefined);
  assert.throws(
    () => dopriStep(() => [NaN], 0, [1], 0.1, 1e-8, 1e-11),
    /Non-finite derivative/,
  );
});
test('the contraction solver reports its turnaround and crunch outcomes', () => {
  const dust = pure({ omegaB: 2, omegaK: -1, endLogYears: 10.8 });
  const closed = integrateContraction(createModel(dust), 10.8),
    crunch = integrateContraction(
      createModel(pure({ omegaB: 1.1, omegaDE: -0.1, endLogYears: 12 })),
      12,
    );
  assert.ok(closed.turned);
  assert.equal(closed.events.length, 1);
  near(Math.max(...closed.samples.map((s) => 10 ** s.logA!)), 2, 0.003);
  near(
    10 ** closed.events[0].logYears * dust.H0 * H0_YEAR,
    Math.PI / 2 + 1,
    0.02,
  );
  assert.equal(closed.crunch, false);
  assert.ok(crunch.turned && crunch.crunch);
  assert.equal(crunch.stop?.status, 'terminated');
});
