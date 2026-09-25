import {
  runAnalysis,
  type ComputeRequest,
  type ComputeResponse,
} from './dispatch';
// The message types now live in dispatch; re-exported for existing importers.
export type { ComputeRequest, ComputeResponse } from './dispatch';
// Runs the numerical laboratory off the main thread. It calls runAnalysis, as
// the HTTP API does, so both give the same results when their JavaScript
// engines round Math functions (exp, log, sin, ...) alike. Committed outputs
// are reproduced bit for bit with Node.js 24 (CI, the Vercel function); newer
// V8 versions, in browsers and in the Cloudflare Workers runtime, round some
// of them differently (docs/scope.md).
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
