import { simulate } from './engine';
import { ensemble, sensitivity, sweep, type AnalysisContext } from './analysis';
import { withDefaults } from './defaults';
import type { Configuration } from './types';
// Work limits and error types for callers of runAnalysis, such as the API.
export {
  API_LIMITS,
  BudgetExceededError,
  ValidationError,
  type WorkBudget,
} from './core/limits';
export const ANALYSIS_MODES = [
  'deterministic',
  'ensemble',
  'sensitivity',
  'sweep',
] as const;
export type AnalysisMode = (typeof ANALYSIS_MODES)[number];
/** Message from the laboratory to the browser worker. */
export interface ComputeRequest {
  id: number;
  mode: AnalysisMode;
  config: Configuration;
  options?: unknown;
}
export type ComputeResponse =
  | { id: number; result: unknown }
  | { id: number; error: string };
export function isAnalysisMode(v: unknown): v is AnalysisMode {
  return (
    typeof v === 'string' && (ANALYSIS_MODES as readonly string[]).includes(v)
  );
}
/**
 * Shared entry point for the HTTP API and the browser worker. A partial
 * configuration is completed from its named preset (or the default preset);
 * unknown keys are dropped. Analyses validate their base configuration and
 * options and throw ValidationError; `ctx.budget` is shared by every run and
 * throws BudgetExceededError when exhausted.
 */
export function runAnalysis(
  mode: AnalysisMode,
  config: Partial<Configuration>,
  options?: unknown,
  ctx: AnalysisContext = {},
) {
  const c = withDefaults(config);
  switch (mode) {
    case 'ensemble':
      return ensemble(c, options as Parameters<typeof ensemble>[1], ctx);
    case 'sensitivity':
      return sensitivity(c, ctx);
    case 'sweep':
      return sweep(c, options as Parameters<typeof sweep>[1], ctx);
    default:
      return simulate(c, ctx);
  }
}
