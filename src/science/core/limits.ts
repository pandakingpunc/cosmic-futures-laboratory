/**
 * A deterministic work allowance counted in right-hand-side evaluations.
 * `used` is incremented in place, so one budget can be shared by every
 * simulation of an analysis.
 */
export interface WorkBudget {
  limit: number;
  used: number;
}
/** Thrown when a WorkBudget is exhausted; never caught by the solvers. */
export class BudgetExceededError extends Error {
  readonly used: number;
  readonly limit: number;
  constructor(used: number, limit: number) {
    super(
      `Work budget exceeded after ${used} right-hand-side evaluations (limit ${limit}).`,
    );
    this.name = 'BudgetExceededError';
    this.used = used;
    this.limit = limit;
  }
}
/** Invalid analysis options or an invalid base configuration. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
/**
 * Caps for untrusted HTTP requests. Measured on a desktop CPU (Node 24):
 * a 64-run ensemble of the reference presets uses 0.33–0.41 M evaluations
 * and an 11×11 sweep to 10¹⁰⁰⁰ yr 0.71 M, so both complete, while a 215-
 * character oscillating custom w(a), at about 3.7 µs per evaluation, is
 * stopped after roughly 4 s instead of running for minutes.
 */
export const API_LIMITS = {
  evaluations: 1_000_000,
  ensembleRuns: 64,
  sweepResolution: 11,
  bodyBytes: 65_536,
} as const;
/** Counts one evaluation against `budget`, throwing once it is exhausted. */
export function charge(budget: WorkBudget) {
  if (++budget.used > budget.limit)
    throw new BudgetExceededError(budget.used, budget.limit);
}
