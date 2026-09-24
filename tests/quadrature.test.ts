import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decayingIntegral,
  gaussKronrod,
  integralTo,
  solveIntegral,
} from '../src/science/solver/quadrature';
import { near } from './helpers';
test('the 15-point Kronrod rule is exact to degree 22 and its error estimate is Kronrod − Gauss', () => {
  // Gauss 7 is exact to degree 13 and Kronrod 15 to degree 22.
  near(gaussKronrod((x) => x ** 22, 0, 1).value, 1 / 23, 1e-15);
  const low = gaussKronrod((x) => x ** 13, -1, 2);
  near(low.value, (2 ** 14 - 1) / 14, 1e-15);
  assert.ok(low.error <= 1e-12);
  assert.ok(gaussKronrod((x) => x ** 22, 0, 1).error > 1e-6);
});
test('decaying integrals to infinity: exponential and super-exponential tails', () => {
  // ∫₀^∞ exp(−eˣ) dx = E₁(1), the exponential integral (A&S 5.1.1, 5.1.53).
  const f = (x: number) => Math.exp(-Math.exp(x));
  const p = decayingIntegral(f, (x) => -Math.exp(x), 0)!;
  near(p.total, 0.21938393439552026, 1e-14);
  const q = decayingIntegral(
    (x) => Math.exp(-2 * x),
    () => -2,
    0,
  )!;
  near(q.total, 0.5, 1e-14);
  // Inversion recovers the upper limit: ∫₀ˣ e⁻²ᵗ dt = (1 − e⁻²ˣ)/2.
  // Near the end the inverse is ill-conditioned: ∂x/∂target = e²ˣ.
  for (const x of [1e-3, 0.3, 2, 5]) {
    const target = -0.5 * Math.expm1(-2 * x);
    near(
      solveIntegral(q, (t) => Math.exp(-2 * t), target),
      x,
      1e-12,
    );
    near(
      integralTo(q, (t) => Math.exp(-2 * t), x),
      target,
      1e-14,
    );
  }
  // Beyond the last panel only the negligible remainder is added.
  const end = q.edges[q.edges.length - 1];
  near(
    integralTo(q, (t) => Math.exp(-2 * t), end + 5),
    0.5,
    1e-14,
  );
  assert.equal(
    integralTo(q, (t) => Math.exp(-2 * t), 0),
    0,
  );
  // An integrand that never decays is refused rather than truncated.
  assert.equal(
    decayingIntegral(
      () => 1,
      () => 0,
      0,
    ),
    null,
  );
});
test('a jump is resolved to the minimum panel width', () => {
  // Panels shrink to 10⁻⁹ around the discontinuity and are then accepted.
  const step = (x: number) => (x < 0.3 ? 1 : 0);
  const p = decayingIntegral(step, () => -1, 0)!;
  assert.ok(Math.abs(p.total - 0.3) < 1e-8);
});
