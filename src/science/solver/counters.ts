import { BudgetExceededError, charge, type WorkBudget } from '../core/limits';
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
/**
 * Wraps f to count its calls and charge them to an optional work budget;
 * neither ever changes the arithmetic.
 */
export function counted(
  f: Derivative,
  counters: SimulationCounters | undefined,
  phase: EvaluationPhase,
  budget?: WorkBudget,
): Derivative {
  const g: Derivative = counters
    ? (x, y) => {
        counters[phase]++;
        return f(x, y);
      }
    : f;
  return budget
    ? (x, y) => {
        charge(budget);
        return g(x, y);
      }
    : g;
}
/** Rethrows a budget exhaustion that a step-rejection handler caught. */
export function rethrowBudget(e: unknown) {
  if (e instanceof BudgetExceededError) throw e;
}
