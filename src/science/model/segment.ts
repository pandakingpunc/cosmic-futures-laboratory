import type { Configuration, DarkEnergy, PhysicsEvent } from '../types';
/**
 * The physical rules that hold between two interventions: the G multiplier,
 * the dark-energy sign and its equation of state. Interventions never modify
 * a segment; they return a new one.
 */
export interface Segment {
  readonly g: number;
  /** Sign of the dark-energy density; zero once the vacuum is removed. */
  readonly signDE: number;
  readonly deModel: DarkEnergy;
  readonly w0: number;
  readonly wa: number;
}
/** An explicit end of the integration with its reported reason. */
export interface Stop {
  readonly status: 'limited' | 'terminated';
  readonly reason: string;
}
export type Intervention =
  | { readonly segment: Segment; readonly y: number[] }
  | { readonly stop: Stop };
export const CURVED_G_REASON =
  'Changing G in a curved model requires separate curvature and density matching. This intervention is supported only for flat models.';
export const NONPOSITIVE_G_REASON =
  'A nonpositive G multiplier makes this solver formulation undefined.';
export const forcedStopReason = (action: string) =>
  `Forced ${action} reached. H cannot be instantaneously changed consistently with the unmodified Friedmann stress-energy; expansion evolution stops at this intervention.`;
export const undefinedBranchReason = (message: string) =>
  `Custom event made the expansion branch undefined: ${message} Last valid state retained.`;
export const lifetimeReason = (c: Configuration) =>
  c.dmModel !== 'decay'
    ? 'A lifetime switch requires an already active decay model.'
    : 'Lifetime discontinuity reached. Donor survival history requires a new matched interacting segment; this version stops explicitly.';
/**
 * The dark-energy law of a configuration. CPL with wₐ = 0 is the constant-w
 * law: w₀ + 0·(1 − a) equals w₀ bit for bit, so it shares its asymptote.
 */
export function darkEnergyLaw(c: Configuration): DarkEnergy {
  return c.deModel === 'cpl' && c.wa === 0 ? 'constant' : c.deModel;
}
export function initialSegment(c: Configuration): Segment {
  return {
    g: 1,
    signDE: Math.sign(c.omegaDE),
    deModel: darkEnergyLaw(c),
    w0: c.w0,
    wa: c.wa,
  };
}
/**
 * Applies a custom event inside the numerical segment to the state
 * y = [τ, R, ln|ρde|, J]. The caller still checks that the new branch has
 * H² > 0 before adopting it.
 */
export function applyNumericalIntervention(
  segment: Segment,
  y: readonly number[],
  e: PhysicsEvent,
  c: Configuration,
): Intervention {
  if (e.action === 'change-w')
    return {
      segment: { ...segment, deModel: 'constant', w0: e.value, wa: 0 },
      y: [...y],
    };
  if (e.action === 'vacuum-scale')
    return e.value === 0
      ? { segment: { ...segment, signDE: 0 }, y: [...y] }
      : {
          segment: { ...segment, signDE: segment.signDE * Math.sign(e.value) },
          y: [y[0], y[1], y[2] + Math.log(Math.abs(e.value)), y[3]],
        };
  if (e.action === 'change-G') {
    if (c.omegaK !== 0)
      return { stop: { status: 'limited', reason: CURVED_G_REASON } };
    if (e.value <= 0)
      return { stop: { status: 'terminated', reason: NONPOSITIVE_G_REASON } };
    return { segment: { ...segment, g: e.value }, y: [...y] };
  }
  if (e.action === 'dm-lifetime')
    return { stop: { status: 'limited', reason: lifetimeReason(c) } };
  return { stop: { status: 'terminated', reason: forcedStopReason(e.action) } };
}
