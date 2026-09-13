import { runAnalysis, type AnalysisMode } from './dispatch';
import type { Configuration } from './types';
export interface ComputeRequest {
  id: number;
  mode: AnalysisMode;
  config: Configuration;
  options?: unknown;
}
export type ComputeResponse =
  | { id: number; result: unknown }
  | { id: number; error: string };
// Runs the numerical laboratory off the main thread. Results are identical to
// the HTTP API because both call runAnalysis on the same engine.
self.onmessage = (event: MessageEvent<ComputeRequest>) => {
  const { id, mode, config, options } = event.data;
  let response: ComputeResponse;
  try {
    response = { id, result: runAnalysis(mode, config, options) };
  } catch (e) {
    response = {
      id,
      error: e instanceof Error ? e.message : 'The calculation failed.',
    };
  }
  self.postMessage(response);
};
