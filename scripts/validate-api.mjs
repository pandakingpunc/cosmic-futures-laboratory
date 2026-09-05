import assert from 'node:assert/strict';
const base = process.argv[2] ?? 'http://localhost:3000';
const send = (body) =>
  fetch(`${base}/api/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const response = await send({ config: { samples: 40, endLogYears: 11 } });
assert.equal(response.status, 200);
const result = await response.json();
assert.equal(result.status, 'complete');
assert.ok(result.samples.length >= 40);
assert.ok(result.samples.every((s) => Number.isFinite(s.expansionIndex)));
assert.equal(result.metadata.version, '0.1.0');
const invalid = await (await send({ config: { omegaDE: 0 } })).json();
assert.equal(invalid.status, 'invalid');
assert.equal((await send({ config: {}, mode: 'unknown' })).status, 400);
assert.equal((await send({ config: [] })).status, 400);
const malformed = await (
  await send({ config: { events: null, blackHoleMasses: null } })
).json();
assert.equal(malformed.status, 'invalid');
const observations = await fetch(`${base}/api/observations`);
assert.equal(observations.status, 200);
assert.ok((await observations.text()).includes('67.36'));
console.log(
  'PASS HTTP simulation, validation, mode dispatch and observational data.',
);
