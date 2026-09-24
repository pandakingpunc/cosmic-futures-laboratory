import type { Derivative } from './dopri5';
/**
 * Deterministic work counters. Right-hand-side evaluations are split between
 * advancing the solution (including turnaround refinement) and placing output
 * samples; rootIterations counts sample refinements and turnaround bisections.
 */
export interface SimulationCounters {
  derivativeEvaluations: number;
  samplingEvaluations: number;
  rootIterations: number;
}
export type EvaluationPhase = 'derivativeEvaluations' | 'samplingEvaluations';
/** Wraps f to count its calls; counting never changes the arithmetic. */
export function counted(
  f: Derivative,
  counters: SimulationCounters | undefined,
  phase: EvaluationPhase,
): Derivative {
  return counters
    ? (x, y) => {
        counters[phase]++;
        return f(x, y);
      }
    : f;
}
