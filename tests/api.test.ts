import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate } from '../src/science/engine';
import {
  API_LIMITS,
  runAnalysis,
  isAnalysisMode,
  ValidationError,
} from '../src/science/dispatch';
import { POST } from '../app/api/simulate/route';
import { GET } from '../app/api/observations/route';
import { DATASET_VERSION } from '../src/science/types';
const ENDPOINT = 'http://laboratory.test/api/simulate';
const post = (body: unknown) =>
  POST(
    new Request(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
/** A streamed request body, which carries no Content-Length header. */
const streamed = (stream: ReadableStream<Uint8Array>) =>
  POST(
    new Request(ENDPOINT, {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit),
  );
const errorOf = async (r: Response) =>
  (await r.json()) as { error: string; code?: string };
// The audit's denial-of-service request: a rapidly oscillating custom w(a)
// at tight tolerances, which took 65–94 s of CPU as a 256-run ensemble.
const heavy = {
  endLogYears: 1000,
  rtol: 1e-12,
  atol: 1e-14,
  deModel: 'custom',
  expression: '-1 + 0.3*sin(2000*log(a))',
};
const heavyOptions = {
  runs: 256,
  seed: 1,
  distribution: 'gaussian',
  sigmas: [0, 0, 0, 0],
  interval: 0.9,
};
test('the analysis dispatcher and HTTP route agree and validate modes', async () => {
  assert.ok(isAnalysisMode('sweep') && !isAnalysisMode('unknown'));
  const c = { samples: 40, endLogYears: 8 };
  const direct = runAnalysis('deterministic', c) as ReturnType<typeof simulate>;
  const ok = await post({ config: c });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  const viaHttp = (await ok.json()) as ReturnType<typeof simulate>;
  assert.equal(
    viaHttp.metadata.configurationHash,
    direct.metadata.configurationHash,
  );
  assert.deepEqual(
    viaHttp.samples.map((s) => s.expansionIndex),
    direct.samples.map((s) => s.expansionIndex),
  );
  assert.equal((await post({ config: [] })).status, 400);
  assert.equal((await post({ config: c, mode: 'unknown' })).status, 400);
  const missing = await post({ config: c, mode: 'ensemble' });
  assert.equal(missing.status, 400);
  assert.match((await errorOf(missing)).error, /options/);
  const sweepResponse = await post({
    config: c,
    mode: 'sweep',
    options: { w0Min: -1.1, w0Max: -0.9, waMin: 0, waMax: 0.1, resolution: 3 },
  });
  assert.equal(sweepResponse.status, 200);
  assert.equal(((await sweepResponse.json()) as unknown[]).length, 9);
});
test('malformed JSON, non-object bodies and invalid options return 400', async () => {
  for (const body of ['{', '', 'null', '42', '"text"', '[1]']) {
    const r = await post(body);
    assert.equal(r.status, 400, body);
    assert.match(
      (await errorOf(r)).error,
      /not valid JSON|must be a JSON object/,
      body,
    );
  }
  const config = { samples: 40, endLogYears: 8 };
  const invalid = [
    { mode: 'ensemble', options: { ...heavyOptions, runs: 3 } },
    { mode: 'ensemble', options: { ...heavyOptions, runs: 4, covariance: 1 } },
    {
      mode: 'ensemble',
      options: { ...heavyOptions, runs: 4, distribution: 'cauchy' },
    },
    {
      mode: 'sweep',
      options: { w0Min: -1, w0Max: -1.2, waMin: 0, waMax: 1, resolution: 3 },
    },
    { mode: 'sensitivity', config: { ...config, H0: -1 } },
  ];
  for (const request of invalid) {
    const r = await post({ config, ...request });
    assert.equal(r.status, 400, JSON.stringify(request));
    const { error } = await errorOf(r);
    // The message is the analysis' own validation text, not a TypeError.
    assert.doesNotMatch(error, /is not a function|Cannot read/);
  }
  assert.throws(
    () =>
      runAnalysis('ensemble', config, { ...heavyOptions, covariance: [[1]] }),
    ValidationError,
  );
});
test('the observations route serves the versioned dataset', async () => {
  const r = GET();
  assert.equal(r.status, 200);
  assert.equal(
    ((await r.json()) as { version: string }).version,
    DATASET_VERSION,
  );
});
test('deeply nested bodies return 400 instead of overflowing the stack', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const nested = (n: number) => '['.repeat(n) + ']'.repeat(n);
  // 5,000 levels used to overflow structuredClone in simulate() (HTTP 500).
  for (const key of ['events', 'blackHoleMasses', 'name', 'unknownKey']) {
    const r = await post(
      `{"config":{"samples":40,"endLogYears":8,"${key}":${nested(5_000)}}}`,
    );
    assert.equal(r.status, 400, key);
    assert.match((await errorOf(r)).error, /nested too deeply/, key);
  }
  assert.equal(logged.mock.callCount(), 0);
  const events = [{ id: 'w', logTime: 11, action: 'change-w', value: -0.9 }];
  const eventful = await post({
    config: { samples: 40, endLogYears: 12, sandbox: true, events },
  });
  assert.equal(eventful.status, 200);
});
test('ensemble and sweep sizes above the HTTP caps return 422 before any computation', async () => {
  // The base configuration is invalid, so reaching runAnalysis would give 400.
  const invalidBase = { ...heavy, H0: -1 };
  const runs = await post({
    config: invalidBase,
    mode: 'ensemble',
    options: { ...heavyOptions, runs: API_LIMITS.ensembleRuns + 1 },
  });
  assert.equal(runs.status, 422);
  const runsError = await errorOf(runs);
  assert.equal(runsError.code, 'api-limit');
  assert.match(runsError.error, /at most 64 ensemble members.*browser/);
  const sweep = await post({
    config: invalidBase,
    mode: 'sweep',
    options: {
      w0Min: -1.1,
      w0Max: -0.9,
      waMin: 0,
      waMax: 0.1,
      resolution: API_LIMITS.sweepResolution + 1,
    },
  });
  assert.equal(sweep.status, 422);
  assert.equal((await errorOf(sweep)).code, 'api-limit');
  const original = await post({
    config: heavy,
    mode: 'ensemble',
    options: heavyOptions,
  });
  assert.equal(original.status, 422);
  assert.equal((await errorOf(original)).code, 'api-limit');
});
test('the audit denial-of-service ensemble stops at the work budget within seconds', async () => {
  const request = {
    config: heavy,
    mode: 'ensemble',
    options: { ...heavyOptions, runs: API_LIMITS.ensembleRuns },
  };
  const messages = [];
  for (let i = 0; i < 2; i++) {
    const start = performance.now();
    const r = await post(request);
    const seconds = (performance.now() - start) / 1000;
    assert.equal(r.status, 422);
    assert.ok(seconds < 10, `the budgeted request took ${seconds} s`);
    const body = await errorOf(r);
    assert.equal(body.code, 'work-budget');
    assert.match(body.error, /1,000,000 derivative evaluations.*browser/);
    messages.push(body.error);
  }
  assert.equal(messages[0], messages[1]);
});
test('the body limit counts streamed bytes, with or without Content-Length', async () => {
  const chunk = new Uint8Array(16_384).fill(0x20);
  let pulled = 0;
  const endless = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  const endlessResponse = await streamed(endless);
  assert.equal(endlessResponse.status, 413);
  assert.match((await errorOf(endlessResponse)).error, /65536 bytes/);
  assert.ok(pulled <= API_LIMITS.bodyBytes + 4 * chunk.byteLength, `${pulled}`);
  // 25,000 characters but 75,000 UTF-8 bytes.
  const euros = new TextEncoder().encode(
    JSON.stringify({ config: { name: '€'.repeat(25_000) } }),
  );
  assert.ok(euros.byteLength > API_LIMITS.bodyBytes);
  const euroResponse = await streamed(
    new ReadableStream({
      start(controller) {
        controller.enqueue(euros);
        controller.close();
      },
    }),
  );
  assert.equal(euroResponse.status, 413);
  const declared = await POST(
    new Request(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Length': String(API_LIMITS.bodyBytes + 1) },
      body: '{}',
    }),
  );
  assert.equal(declared.status, 413);
  // Multibyte characters split across one-byte chunks decode intact.
  const name = 'Planck 2018 · ΛCDM ☄';
  const bytes = new TextEncoder().encode(
    JSON.stringify({ config: { name, samples: 40, endLogYears: 8 } }) +
      ' '.repeat(API_LIMITS.bodyBytes - 200),
  );
  let i = 0;
  const trickle = await streamed(
    new ReadableStream({
      pull(controller) {
        if (i < 200) controller.enqueue(bytes.slice(i, ++i));
        else {
          controller.enqueue(bytes.slice(i));
          controller.close();
        }
      },
    }),
  );
  assert.equal(trickle.status, 200);
  assert.equal(
    ((await trickle.json()) as ReturnType<typeof simulate>).config.name,
    name,
  );
});
test('unexpected server faults return a generic 500 and are logged', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const failing = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(new TypeError('secret internal detail'));
    },
  });
  const r = await streamed(failing);
  assert.equal(r.status, 500);
  const body = await errorOf(r);
  assert.equal(body.error, 'Internal simulation error.');
  assert.doesNotMatch(JSON.stringify(body), /secret/);
  assert.equal(logged.mock.callCount(), 1);
});
