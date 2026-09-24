import { simulate } from './engine';
import { ensemble, sensitivity, sweep } from './analysis';
import { defaultConfig } from './defaults';
import type { Configuration } from './types';
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
/** Shared entry point for the HTTP API and the browser worker. */
export function runAnalysis(
  mode: AnalysisMode,
  config: Partial<Configuration>,
  options?: unknown,
) {
  const c = { ...defaultConfig(), ...config };
  switch (mode) {
    case 'ensemble':
      return ensemble(c, options as Parameters<typeof ensemble>[1]);
    case 'sensitivity':
      return sensitivity(c);
    case 'sweep':
      return sweep(c, options as Parameters<typeof sweep>[1]);
    default:
      return simulate(c);
  }
}
