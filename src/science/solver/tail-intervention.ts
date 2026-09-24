import { CURVED_G_REASON, type Stop } from '../model/segment';
import type { Configuration, PhysicsEvent, Sample } from '../types';
/** State of the matched single-fluid tail that interventions may change. */
export interface TailState {
  /** Exponent of the dominant density, ρ ∝ a⁻ⁿ. */
  n: number;
  /** log₁₀ a and log₁₀ H at the anchor sample. */
  anchorA: number;
  anchorH: number;
  /** G multiplier in force. */
  g: number;
  anchor: Sample;
}
export interface TailContext {
  dominant: number;
  /** Smallest exponent among the other finite components. */
  competitor: number;
  c: Configuration;
}
/** Applies a custom event to the matched tail, or stops where it is unproven. */
export function applyTailIntervention(
  e: PhysicsEvent,
  lt: number,
  s: TailState,
  ctx: TailContext,
): TailState | Stop {
  const { c } = ctx;
  if (e.action === 'change-w' && ctx.dominant === 3) {
    const candidate = 3 * (1 + e.value);
    if (candidate >= ctx.competitor)
      return {
        status: 'limited',
        reason:
          'The new w permits another fluid to overtake dark energy; a single-fluid tail is no longer justified.',
      };
    return { ...s, n: candidate };
  }
  if (e.action === 'change-G' && e.value > 0) {
    if (c.omegaK !== 0) return { status: 'limited', reason: CURVED_G_REASON };
    return {
      ...s,
      anchorH: s.anchorH + Math.log10(e.value / s.g) / 2,
      g: e.value,
    };
  }
  if (e.action === 'vacuum-scale' && e.value > 0 && ctx.dominant === 3) {
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
            (sum, v) => sum + (v === null ? 0 : 10 ** (v - changedDE)),
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
