import { pow10 } from '../core/pow';
import { asymptoticW } from '../model/asymptote';
import {
  CURVED_G_REASON,
  NONPOSITIVE_G_REASON,
  forcedStopReason,
  lifetimeReason,
  undefinedBranchReason,
  type Stop,
} from '../model/segment';
import type { Configuration, PhysicsEvent, Sample } from '../types';
/** State of the matched single-fluid tail that interventions may change. */
export interface TailState {
  /** Exponent of the dominant density, ρ ∝ a⁻ⁿ. */
  n: number;
  /** Exponent of the dark-energy density, or null when it is absent. */
  deN: number | null;
  /** log₁₀ a and log₁₀ H at the anchor sample. */
  anchorA: number;
  anchorH: number;
  /** G multiplier in force. */
  g: number;
  anchor: Sample;
}
export interface TailContext {
  /** Dark energy alone dominates the tail. */
  deAlone: boolean;
  /** Smallest exponent among the other finite components. */
  competitor: number;
  c: Configuration;
}
/**
 * Applies a custom event to the matched tail, or stops where it is unproven.
 * Stops share the status and reason of the same event in the numerical
 * segment wherever the physics is the same.
 */
export function applyTailIntervention(
  e: PhysicsEvent,
  lt: number,
  s: TailState,
  ctx: TailContext,
): TailState | Stop {
  const { c } = ctx;
  if (e.action === 'change-w' && ctx.deAlone) {
    const w = asymptoticW({
      g: 1,
      signDE: 1,
      deModel: 'constant',
      w0: e.value,
      wa: 0,
    })!;
    const candidate = 3 * (1 + w);
    if (candidate >= ctx.competitor)
      return {
        status: 'limited',
        reason:
          'The new w permits another fluid to overtake dark energy; a single-fluid tail is no longer justified.',
      };
    return { ...s, n: candidate, deN: candidate };
  }
  if (e.action === 'change-G') {
    if (c.omegaK !== 0) return { status: 'limited', reason: CURVED_G_REASON };
    if (e.value <= 0)
      return { status: 'terminated', reason: NONPOSITIVE_G_REASON };
    return {
      ...s,
      anchorH: s.anchorH + Math.log10(e.value / s.g) / 2,
      g: e.value,
    };
  }
  if (e.action === 'halt' || e.action === 'reverse')
    return { status: 'terminated', reason: forcedStopReason(e.action) };
  if (e.action === 'dm-lifetime')
    return { status: 'limited', reason: lifetimeReason(c) };
  // Flipping the sign of a vacuum that dominates to 10⁻⁸ makes H² negative.
  if (e.action === 'vacuum-scale' && e.value < 0 && ctx.deAlone)
    return {
      status: 'terminated',
      reason: undefinedBranchReason(
        'H² ≤ 0: expansion branch is undefined at this integration stage.',
      ),
    };
  if (e.action === 'vacuum-scale' && e.value > 0 && ctx.deAlone) {
    const { anchor, anchorA: a } = s;
    const changedDE =
      anchor.logRhoDE === null ? null : anchor.logRhoDE + Math.log10(e.value);
    // Recheck physical source ratios, including signed curvature, after a discontinuous vacuum change.
    const competing = [
      anchor.logRhoB,
      anchor.logRhoDM,
      anchor.logRhoR,
      c.omegaNu > 0 ? Math.log10(c.omegaNu) - 3 * a : null,
      c.omegaK !== 0 ? Math.log10(Math.abs(c.omegaK)) - 2 * a : null,
    ];
    const contamination =
      changedDE === null
        ? Infinity
        : competing.reduce<number>(
            (sum, v) => sum + (v === null ? 0 : pow10(v - changedDE)),
            0,
          );
    if (contamination > 1e-8)
      return {
        status: 'limited',
        reason:
          'Vacuum rescaling invalidated the single-fluid dominance threshold; a new multi-fluid segment is required.',
      };
    return {
      ...s,
      anchorH: s.anchorH + Math.log10(e.value) / 2,
      anchor: { ...anchor, logRhoDE: changedDE },
    };
  }
  return {
    status: 'limited',
    reason: `Custom ${e.action} boundary reached at 10^${lt.toPrecision(5)} years. This rule invalidates the proven asymptote; no valid continuation is asserted.`,
  };
}
