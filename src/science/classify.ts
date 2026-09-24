import type { Segment } from './model/segment';
import type { Configuration } from './types';
export interface Fate {
  classification: string;
  explanation: string;
}
export const UNDETERMINED: Fate = {
  classification: 'Undetermined',
  explanation:
    'Ultimate fate cannot be uniquely determined under current observational and theoretical uncertainty.',
};
/** Replaces the classification of every run that ends at a numerical or model boundary. */
export const BOUNDARY_CLASSIFICATION =
  'Undetermined · numerical/model boundary';
export const INTERVENTION_NOTE =
  ' Custom interventions are nonstandard; energy or momentum conservation at their boundaries is not established.';
/** Fate of a run whose requested interval ended inside the numerical segment. */
export function classifyFinite(c: Configuration, s: Segment): Fate {
  if (c.omegaK < 0)
    return {
      classification: 'Undetermined · closed-model branch',
      explanation:
        'A closed model can encounter a future turnaround even when its dark-energy density is positive. The computed interval has not established a globally expanding branch.',
    };
  if (
    s.signDE > 0 &&
    (s.deModel === 'lambda' || (s.deModel === 'constant' && s.w0 === -1))
  )
    return {
      classification: 'Asymptotic de Sitter expansion',
      explanation:
        'Under a positive cosmological constant and the selected conserved fluids, matter and radiation dilute while vacuum density remains constant. Expansion tends to a constant Hubble rate. A heat-death interpretation additionally assumes long-term stability of this physics.',
    };
  if (s.signDE > 0 && s.deModel === 'constant' && s.w0 < -1)
    return {
      classification: 'Big Rip under constant phantom energy',
      explanation:
        'The selected persistent w < −1 causes dark-energy density to grow with expansion. The integral of da/(aH) to infinite scale factor converges: this model has a finite future singularity, although the selected endpoint may precede it.',
    };
  if (s.signDE > 0 && s.deModel === 'constant')
    return {
      classification:
        s.w0 < -1 / 3
          ? 'Eternal accelerated power-law expansion'
          : 'Long-lived decelerating expansion',
      explanation:
        'For the selected constant equation of state, the dominant positive component dilutes as a power of the scale factor. This conditional continuation does not determine the ultimate microphysical fate.',
    };
  if (s.signDE === 0 && c.omegaK >= 0)
    return {
      classification: 'Long-lived decelerating expansion',
      explanation:
        'With the selected nonnegative matter, radiation and curvature terms and no dark energy, the expansion persists with a declining Hubble rate.',
    };
  return {
    classification: 'Undetermined with current physics',
    explanation:
      'The computed interval is conditional on the selected dynamical model. This implementation does not establish a unique infinite-future asymptote for this model.',
  };
}
/**
 * Fate along a matched tail ρ ∝ a⁻ⁿ. An intervention in the tail makes the
 * classification nonstandard; reaching the rip boundary overrides both.
 */
export function classifyTail(
  n: number,
  nonstandard = false,
  rip = false,
): Fate {
  const classification =
    n === 0
      ? 'Asymptotic de Sitter expansion'
      : n < 0
        ? 'Big Rip under constant phantom energy'
        : n < 2
          ? 'Eternal accelerated power-law expansion'
          : 'Long-lived decelerating expansion';
  return {
    classification: rip
      ? 'Big Rip'
      : nonstandard
        ? 'Custom / nonstandard evolution'
        : classification,
    explanation:
      n === 0
        ? 'The resolved background approaches a positive constant-density fluid. With the specified stable future law, H tends to a constant and expansion continues. Heat death remains an additional conditional thermodynamic interpretation.'
        : n < 0
          ? 'The proven phantom asymptote increases H and density as expansion proceeds. Its proper-time integral to infinite scale factor converges, giving a finite model singularity.'
          : 'The selected model approaches a proven constant-fluid power law. Density decreases with expansion, and the future proper-time integral does not end at a finite Big Rip. Microphysical ultimate fate remains uncertain.',
  };
}
/** Fate of a time-domain branch whose expansion velocity reached zero. */
export function classifyRecollapse(crunch: boolean): Fate {
  return {
    classification: crunch ? 'Big Crunch approach' : 'Recollapsing Universe',
    explanation:
      'The selected curvature or negative dark energy permits the expansion velocity to reach zero. The acceleration equation then evolves a contracting branch. This is a conditional classical solution; a final singularity is outside the resolved domain.',
  };
}
