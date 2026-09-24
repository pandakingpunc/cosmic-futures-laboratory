import type { Fate } from './classify';
import { seededRandom } from './core/random';
import type { Configuration, CosmicEvent, Sample } from './types';
const EXPLANATION =
  'A seeded, user-assumed local Poisson clock terminated this branch. This is not a measured vacuum lifetime or a spacetime nucleation calculation.';
/**
 * log₁₀ elapsed years of an assumed local vacuum decay drawn from the seeded
 * exponential clock, or Infinity when the clock is disabled.
 */
export function drawVacuumLog(c: Configuration): number {
  const random = seededRandom(c.seed);
  // A draw earlier than one elapsed year terminates at the first sample
  // instead of producing negative log-time coordinates.
  return c.vacuumDecay
    ? Math.max(
        0,
        c.vacuumLogLifetime +
          Math.log10(-Math.log(Math.max(1e-15, 1 - random()))),
      )
    : Infinity;
}
export interface VacuumTermination {
  samples: Sample[];
  fate: Fate;
  event: CosmicEvent;
}
/**
 * Ends a completed branch at the drawn decay time when its last sample lies
 * there; otherwise returns null and the result is unchanged.
 */
export function vacuumTermination(
  c: Configuration,
  vacuumLog: number,
  samples: readonly Sample[],
  lastLog: number,
): VacuumTermination | null {
  if (!(vacuumLog <= c.endLogYears && Math.abs(lastLog - vacuumLog) < 1e-8))
    return null;
  return {
    // The same tolerance that detected the event keeps a final sample that
    // its grid placed one rounding step beyond the drawn time.
    samples: samples.filter((s) => s.logYears <= vacuumLog + 1e-8),
    fate: {
      classification: 'Vacuum-decay termination',
      explanation: EXPLANATION,
    },
    event: {
      id: 'vacuum',
      title: 'Assumed local vacuum-decay event',
      logYears: vacuumLog,
      detail: EXPLANATION,
      reliability: 'Theoretically speculative',
      sources: ['vacuum2024'],
    },
  };
}
