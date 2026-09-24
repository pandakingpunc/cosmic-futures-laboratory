import assert from 'node:assert/strict';
import { defaultConfig } from '../src/science/defaults';
import type { Configuration } from '../src/science/types';
export function near(a: number, b: number, tol = 1e-5) {
  assert.ok(
    Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)),
    `${a} != ${b} within ${tol}`,
  );
}
/** An empty flat universe to which a test adds single components. */
export const pure = (patch: Partial<Configuration>) => ({
  ...defaultConfig(),
  omegaB: 0,
  omegaDM: 0,
  omegaNu: 0,
  omegaR: 0,
  omegaDE: 0,
  omegaK: 0,
  samples: 60,
  endLogYears: 11,
  ...patch,
});
