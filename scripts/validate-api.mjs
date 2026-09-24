import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Usage: node scripts/validate-api.mjs [base URL, default http://localhost:3000]
// Smoke-tests a running server's HTTP API, including its request limits.
const base = process.argv[2] ?? 'http://localhost:3000';
const post = (body, init = {}) =>
  fetch(`${base}/api/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    ...init,
  });
const send = (body) => post(JSON.stringify(body));
const response = await send({ config: { samples: 40, endLogYears: 11 } });
assert.equal(response.status, 200);
const result = await response.json();
assert.equal(result.status, 'complete');
assert.ok(result.samples.length >= 40);
assert.ok(result.samples.every((s) => Number.isFinite(s.expansionIndex)));
assert.equal(
  result.metadata.version,
  JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ).version,
);
const invalid = await (await send({ config: { omegaDE: 0 } })).json();
assert.equal(invalid.status, 'invalid');
assert.equal((await send({ config: {}, mode: 'unknown' })).status, 400);
assert.equal((await send({ config: [] })).status, 400);
assert.equal((await post('null')).status, 400);
assert.equal((await post('{')).status, 400);
const malformed = await (
  await send({ config: { events: null, blackHoleMasses: null } })
).json();
assert.equal(malformed.status, 'invalid');
const observations = await fetch(`${base}/api/observations`);
assert.equal(observations.status, 200);
assert.ok((await observations.text()).includes('67.36'));
// Request limits: at most 64 ensemble runs, a per-request work budget and
// 64 KiB bodies (declared or streamed). The heavy request is the audit's
// oscillating custom w(a) at tight tolerances; 8 runs exceed the budget in
// about 1 s. Oversized bodies come last because a server may close those
// connections without reading the rest of the body.
const heavy = {
  config: {
    endLogYears: 1000,
    rtol: 1e-12,
    atol: 1e-14,
    deModel: 'custom',
    expression: '-1 + 0.3*sin(2000*log(a))',
  },
  mode: 'ensemble',
  options: {
    runs: 8,
    seed: 1,
    distribution: 'gaussian',
    sigmas: [0, 0, 0, 0],
    interval: 0.9,
  },
};
const tooMany = await send({
  ...heavy,
  options: { ...heavy.options, runs: 65 },
});
assert.equal(tooMany.status, 422);
assert.equal((await tooMany.json()).code, 'api-limit');
const budget = await send(heavy);
assert.equal(budget.status, 422);
assert.equal((await budget.json()).code, 'work-budget');
assert.equal((await post(' '.repeat(65_537))).status, 413);
const chunk = new TextEncoder().encode('€'.repeat(8_192));
let sent = 0;
const streamed = await post(
  new ReadableStream({
    pull(controller) {
      if ((sent += chunk.byteLength) > 200_000) controller.close();
      else controller.enqueue(chunk);
    },
  }),
  { duplex: 'half' },
);
assert.equal(streamed.status, 413);
console.log(
  'PASS HTTP simulation, validation, mode dispatch, request limits (413/422) and observational data.',
);
