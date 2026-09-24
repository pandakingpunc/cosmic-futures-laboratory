import {
  API_LIMITS,
  BudgetExceededError,
  isAnalysisMode,
  runAnalysis,
  ValidationError,
} from '@/src/science/dispatch';
const LOCAL =
  'Run it in the browser laboratory, which computes on your device without this limit, or locally from the source release.';
// A valid request nests at most four levels (body, config, events, event).
// Much deeper JSON would overflow the stack when the engine clones it.
const MAX_DEPTH = 32;
class PayloadTooLargeError extends Error {}
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
/** Whether objects or arrays in `value` nest more than `limit` levels. */
function tooDeep(value: unknown, limit: number) {
  let level = [value];
  for (let depth = 0; level.length; depth++) {
    const containers = level.filter(
      (v): v is object => typeof v === 'object' && v !== null,
    );
    if (containers.length && depth >= limit) return true;
    level = containers.flatMap((v) => Object.values(v));
  }
  return false;
}
const reply = (status: number, error: string, code?: string) =>
  Response.json(code ? { error, code } : { error }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
/**
 * Reads the body with a running byte count and stops at `limit` bytes,
 * whether or not the client declared a Content-Length.
 */
async function readBody(request: Request, limit: number) {
  if (Number(request.headers.get('content-length')) > limit)
    throw new PayloadTooLargeError();
  if (!request.body) return '';
  const reader = request.body.getReader(),
    decoder = new TextDecoder();
  let bytes = 0,
    text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    bytes += value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
}
/** Rejects analyses larger than the HTTP caps before any computation. */
function overLimit(mode: string, options: Record<string, unknown>) {
  if (
    mode === 'ensemble' &&
    typeof options.runs === 'number' &&
    options.runs > API_LIMITS.ensembleRuns
  )
    return `The HTTP API runs at most ${API_LIMITS.ensembleRuns} ensemble members. ${LOCAL}`;
  if (
    mode === 'sweep' &&
    typeof options.resolution === 'number' &&
    options.resolution > API_LIMITS.sweepResolution
  )
    return `The HTTP API computes sweeps up to ${API_LIMITS.sweepResolution}×${API_LIMITS.sweepResolution}. ${LOCAL}`;
  return null;
}
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = JSON.parse(await readBody(request, API_LIMITS.bodyBytes));
    } catch (e) {
      if (e instanceof SyntaxError)
        return reply(400, 'The request body is not valid JSON.');
      throw e;
    }
    if (tooDeep(body, MAX_DEPTH))
      return reply(400, 'The request body is nested too deeply.');
    if (!isObject(body))
      return reply(400, 'The request body must be a JSON object.');
    if (!isObject(body.config))
      return reply(400, 'A configuration object is required.');
    const mode = body.mode ?? 'deterministic';
    if (!isAnalysisMode(mode)) return reply(400, 'Unknown analysis mode.');
    if ((mode === 'ensemble' || mode === 'sweep') && !isObject(body.options))
      return reply(400, `Analysis mode "${mode}" requires an options object.`);
    const limited = isObject(body.options)
      ? overLimit(mode, body.options)
      : null;
    if (limited) return reply(422, limited, 'api-limit');
    const result = runAnalysis(mode, body.config, body.options, {
      budget: { limit: API_LIMITS.evaluations, used: 0 },
    });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof PayloadTooLargeError)
      return reply(
        413,
        `The request body exceeds ${API_LIMITS.bodyBytes} bytes.`,
      );
    if (e instanceof ValidationError) return reply(400, e.message);
    if (e instanceof BudgetExceededError)
      return reply(
        422,
        `This analysis needs more than the ${e.limit.toLocaleString('en-US')} derivative evaluations the HTTP API allows per request. ${LOCAL}`,
        'work-budget',
      );
    console.error('Simulation request failed:', e);
    return reply(500, 'Internal simulation error.');
  }
}
