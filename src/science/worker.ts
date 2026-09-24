import {
  runAnalysis,
  type ComputeRequest,
  type ComputeResponse,
} from './dispatch';
// The message types now live in dispatch; re-exported for existing importers.
export type { ComputeRequest, ComputeResponse } from './dispatch';
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
