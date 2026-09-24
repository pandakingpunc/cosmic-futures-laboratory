import { H0_YEAR } from '../core/constants';
import { ln } from '../core/numeric';
import { compileExpression } from '../expression';
import type { Configuration } from '../types';
import type { Segment } from './segment';
/**
 * Configuration-derived constants of the expansion equations. Each is the
 * value version 0.2.0 recomputed inside every right-hand-side call; computing
 * it once yields the same double.
 */
export interface Model {
  readonly c: Configuration;
  /** log₁₀ of H₀ in yr⁻¹. */
  readonly logH0: number;
  /** Ωb + Ων: pressureless matter outside the dark sector. */
  readonly matter: number;
  readonly custom: ((a: number) => number) | null;
  readonly warm: number;
  readonly gamma: number;
  readonly xi: number;
  readonly annihilating: boolean;
  readonly lnMatter: number;
  readonly lnDM: number;
  readonly lnK: number;
  readonly signK: number;
}
export interface Background {
  logE: number;
  /** ln of the matter, dark-matter, radiation, dark-energy and |curvature| terms. */
  logs: number[];
  /** Signed density fractions in the same order. */
  fractions: number[];
  /** Dark-energy equation of state; NaN when dark energy is absent. */
  w: number;
  q: number;
  D: number;
  transfer: number;
}
export function createModel(c: Configuration): Model {
  const logH0 = Math.log10(c.H0 * H0_YEAR),
    matter = c.omegaB + c.omegaNu;
  return {
    c,
    logH0,
    matter,
    custom: c.deModel === 'custom' ? compileExpression(c.expression) : null,
    warm: c.dmModel === 'warm' ? c.warmW : 0,
    gamma:
      c.dmModel === 'decay'
        ? 10 ** Math.max(-310, -c.dmLogLifetime - logH0)
        : 0,
    xi: c.dmModel === 'interacting' ? c.interaction : 0,
    annihilating: c.dmModel === 'annihilation',
    lnMatter: ln(matter),
    lnDM: ln(c.omegaDM),
    lnK: ln(Math.abs(c.omegaK)),
    signK: Math.sign(c.omegaK),
  };
}
/** Dark-energy equation of state at x = ln a. */
export function wAt(x: number, s: Segment, m: Model): number {
  return s.deModel === 'lambda'
    ? -1
    : s.deModel === 'constant'
      ? s.w0
      : s.deModel === 'cpl'
        ? s.w0 + s.wa * (1 - Math.exp(x))
        : s.deModel === 'bounded'
          ? s.w0 + s.wa * (1 - Math.exp(-x))
          : m.custom!(Math.exp(x));
}
/**
 * Background at x = ln a for the state y = [τ, R, ln|ρde|, J]. Loops keep
 * the operation order of the former Math.max/map/reduce formulation.
 */
export function background(
  x: number,
  y: readonly number[],
  s: Segment,
  m: Model,
): Background {
  const { c, warm, gamma, xi } = m;
  const tau = y[0],
    R = y[1],
    lDE = y[2],
    J = y[3];
  if (R < -c.atol || J < -c.atol)
    throw new Error(
      'A conservative component became negative; timestep rejected.',
    );
  const ld =
    m.lnDM -
    3 * warm * x -
    xi * x -
    gamma * tau -
    (m.annihilating ? Math.log1p(c.omegaDM * J) : 0);
  const D = Math.exp(ld);
  const logs = [
    m.lnMatter - 3 * x,
    ld - 3 * x,
    ln(Math.max(0, R)) - 4 * x,
    s.signDE ? lDE : -Infinity,
    m.lnK - 2 * x,
  ];
  let max = -Infinity;
  for (let i = 0; i < 5; i++) max = Math.max(max, logs[i]);
  const signed = [0, 0, 0, 0, 0];
  let sum = 0;
  for (let i = 0; i < 5; i++) {
    signed[i] =
      Math.exp(logs[i] - max) * (i === 3 ? s.signDE : i === 4 ? m.signK : 1);
    sum = sum + signed[i];
  }
  if (!(sum > 0) || !Number.isFinite(max))
    throw new Error(
      'H² ≤ 0: expansion branch is undefined at this integration stage.',
    );
  const logE = 0.5 * (Math.log(s.g) + max + Math.log(sum));
  const fractions = [0, 0, 0, 0, 0];
  for (let i = 0; i < 5; i++) fractions[i] = signed[i] / sum;
  // An absent dark energy has no equation of state to evaluate or bound.
  const w = s.signDE ? wAt(x, s, m) : NaN;
  if (s.signDE && (!Number.isFinite(w) || Math.abs(w) > 1e5))
    throw new Error(
      'Dark-energy equation exceeded its supported finite range.',
    );
  const transfer =
    (gamma * Math.exp(-logE) + xi) * D +
    (m.annihilating ? c.annihilation * D * D * Math.exp(-3 * x - logE) : 0);
  return {
    logE,
    logs,
    fractions,
    w,
    q:
      0.5 *
      (fractions[0] +
        fractions[1] * (1 + 3 * warm) +
        2 * fractions[2] +
        (s.signDE ? fractions[3] * (1 + 3 * w) : 0)),
    D,
    transfer,
  };
}
/** Right-hand side d/dx of [τ, R, ln|ρde|, J]. */
export function derivative(
  x: number,
  y: readonly number[],
  s: Segment,
  m: Model,
): number[] {
  const b = background(x, y, s, m);
  return [
    Math.exp(-b.logE),
    b.transfer * Math.exp(x),
    s.signDE ? -3 * (1 + b.w) : 0,
    m.annihilating ? m.c.annihilation * Math.exp(-3 * x - b.logE) : 0,
  ];
}
