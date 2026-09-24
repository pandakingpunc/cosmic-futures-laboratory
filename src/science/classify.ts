import type { CplTheorem } from './model/cpl';
import { asymptote, neverTurnsAround, type Asymptote } from './model/asymptote';
import type { Background, Model } from './model/background';
import type { Segment } from './model/segment';
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
/** Fate of a branch deliberately ended by a custom intervention. */
export const INTERVENTION_BOUNDARY: Fate = {
  classification: 'Custom intervention boundary',
  explanation:
    'A custom intervention ended the resolved branch. The stop is part of the requested nonstandard scenario, not a prediction of the selected physics, and no continuation beyond it is asserted.',
};
/** Exponents within this distance of 2 give q → 0: coasting, a ∝ t. */
const COASTING = 1e-12;
/** The name of a proven asymptote ρ ∝ a⁻ⁿ. */
function asymptoteName(n: number): string {
  return n === 0
    ? 'Asymptotic de Sitter expansion'
    : n < 0
      ? 'Big Rip under constant phantom energy'
      : Math.abs(n - 2) <= COASTING
        ? 'Coasting expansion'
        : n < 2
          ? 'Eternal accelerated power-law expansion'
          : 'Long-lived decelerating expansion';
}
const COASTING_EXPLANATION =
  'The dominant component dilutes as a⁻², like spatial curvature, so the deceleration parameter tends to zero and the scale factor grows in proportion to time. This conditional continuation does not determine the ultimate microphysical fate.';
/**
 * Fate of a run whose requested interval ended inside the numerical segment:
 * the same asymptote a matched tail would continue from its final state.
 */
export function classifyFinite(model: Model, b: Background, s: Segment): Fate {
  if (model.signK < 0 && !neverTurnsAround(model, b, s))
    return {
      classification: 'Undetermined · closed-model branch',
      explanation:
        'A closed model can encounter a future turnaround even when its dark-energy density is positive. The computed interval has not established a globally expanding branch.',
    };
  // A negative vacuum may halt the expansion before it becomes negligible;
  // only a matched tail, which starts after that, can exclude it.
  const fate = s.signDE < 0 ? null : asymptote(model, b, s);
  if (!fate || 'reason' in fate)
    return {
      classification: 'Undetermined with current physics',
      explanation:
        'The computed interval is conditional on the selected dynamical model. This implementation does not establish a unique infinite-future asymptote for this model.',
    };
  return {
    classification: asymptoteName(fate.n),
    explanation: finiteExplanation(fate),
  };
}
function finiteExplanation({ n, dominant, deN }: Asymptote): string {
  if (n === 0)
    return 'Under a positive cosmological constant and the selected conserved fluids, matter and radiation dilute while vacuum density remains constant. Expansion tends to a constant Hubble rate. A heat-death interpretation additionally assumes long-term stability of this physics.';
  if (n < 0)
    return 'The selected persistent w < −1 causes dark-energy density to grow with expansion. The integral of da/(aH) to infinite scale factor converges: this model has a finite future singularity, although the selected endpoint may precede it.';
  if (Math.abs(n - 2) <= COASTING) return COASTING_EXPLANATION;
  if (deN === null && !dominant.includes(3))
    return 'With the selected nonnegative matter, radiation and curvature terms and no dark energy, the expansion persists with a declining Hubble rate.';
  return 'For the selected constant equation of state, the dominant positive component dilutes as a power of the scale factor. This conditional continuation does not determine the ultimate microphysical fate.';
}
/** Explanation of a matched tail ρ ∝ a⁻ⁿ. */
function tailExplanation(n: number): string {
  return n === 0
    ? 'The resolved background approaches a positive constant-density fluid. With the specified stable future law, H tends to a constant and expansion continues. Heat death remains an additional conditional thermodynamic interpretation.'
    : n < 0
      ? 'The proven phantom asymptote increases H and density as expansion proceeds. Its proper-time integral to infinite scale factor converges, giving a finite model singularity.'
      : Math.abs(n - 2) <= COASTING
        ? COASTING_EXPLANATION
        : 'The selected model approaches a proven constant-fluid power law. Density decreases with expansion, and the future proper-time integral does not end at a finite Big Rip. Microphysical ultimate fate remains uncertain.';
}
/**
 * Fate along a matched tail ρ ∝ a⁻ⁿ. An intervention in the tail makes the
 * classification nonstandard; reaching the rip boundary overrides both. The
 * explanation describes the law in force at the end, `finalN`.
 */
export function classifyTail(
  n: number,
  nonstandard = false,
  rip = false,
  finalN = n,
): Fate {
  const changed =
    finalN === n
      ? ''
      : 'A custom intervention changed the asymptotic law inside the matched tail. ';
  return {
    classification: rip
      ? 'Big Rip'
      : nonstandard
        ? 'Custom / nonstandard evolution'
        : asymptoteName(n),
    explanation: changed + tailExplanation(finalN),
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
/** Fate of a time-domain branch that contracted and then bounced. */
export const OSCILLATING: Fate = {
  classification: 'Oscillating classical solution',
  explanation:
    'A negative-density component that grows fastest at small scale factor halts the contraction at a finite minimum, and the Universe re-expands. For stable constant-w fluids the acceleration equation depends on a alone, so the classical solution is time-reversible and oscillates between its turnaround and bounce. It requires an exotic negative-energy fluid, and quantum or dissipative effects are not included.',
};
/** Label of fates that follow from a CPL law continued by proof. */
export const LITERAL_CPL = 'literal CPL extrapolation';
const CPL_PROOF: Record<CplTheorem | 'recollapse', string> = {
  extinction:
    'With wₐ < 0, w(a) grows without bound. Once w ≥ 1/3 no supported component dilutes faster than the dark energy, so its density fraction can never grow again; it was dropped from the background once below the extinction threshold (event “Dark energy becomes dynamically negligible”). ',
  'big-rip':
    'With wₐ > 0, w(a) falls without bound. Once w ≤ −1 with the dark energy dominant to 10⁻⁸, its density grows super-exponentially and the remaining proper time ∫dx/E converges. ',
  recollapse:
    'With wₐ < 0, w(a) grows without bound as a grows, so the dark energy dies out and the closed curvature must halt the expansion. The closed-form density depends on a alone, so it returns on the contracting branch, where it is integrated in proper time. ',
};
/**
 * A fate proven for a CPL law extrapolated literally: the classification is
 * labelled and the explanation states that it is not a prediction.
 */
export function literalCpl(
  fate: Fate,
  theorem: CplTheorem | 'recollapse',
): Fate {
  return {
    classification: `${fate.classification} · ${LITERAL_CPL}`,
    explanation: `Literal extrapolation of the observational CPL fit ansatz w(a)=w₀+wₐ(1−a) to arbitrarily large a: a mathematical consequence of the ansatz, not a prediction. ${CPL_PROOF[theorem]}${fate.explanation}`,
  };
}
/** The finite-time singularity of a CPL law at 10^ripLog elapsed years. */
export function cplRip(ripLog: number, reached: boolean): Fate {
  return {
    classification: 'Big Rip',
    explanation: `The scale factor, the Hubble rate and the dark-energy density diverge at 10^${ripLog.toFixed(4)} elapsed years${reached ? '' : ', after the selected endpoint'}, a finite-time singularity of the extrapolated law. Its time is the quadrature of dx/E over the closed-form density; samples stop before it.`,
  };
}
