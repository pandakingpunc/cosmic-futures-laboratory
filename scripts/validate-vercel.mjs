import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const output = new URL('../.vercel/output/', import.meta.url);
const readJSON = async (path) =>
  JSON.parse(await readFile(new URL(path, output), 'utf8'));
const routing = await readJSON('config.json');
assert.equal(routing.version, 3);
assert.ok(routing.routes.some((route) => route.handle === 'filesystem'));
assert.ok(
  routing.routes.some(
    (route) => route.src === '/(.*)' && route.dest === '/__server',
  ),
  'Vercel must route application requests to the server function.',
);
const functionConfig = await readJSON(
  'functions/__server.func/.vc-config.json',
);
assert.equal(functionConfig.runtime, 'nodejs24.x');
const { default: app } = await import(
  new URL(`functions/__server.func/${functionConfig.handler}`, output)
);
const request = (path, init) =>
  app.fetch(new Request(`https://cosmic-futures.example${path}`, init));
const simulate = (body) =>
  request('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const page = await request('/');
assert.equal(page.status, 200);
assert.match(page.headers.get('content-type'), /text\/html/);
const html = await page.text();
assert.match(html, /<title>Cosmic Futures Laboratory/);
assert.match(html, /RUN SIMULATION/);
const assets = new Set(
  [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?#]+)"/g)].map(
    (match) => match[1],
  ),
);
assert.ok([...assets].some((asset) => asset.endsWith('.js')));
assert.ok([...assets].some((asset) => asset.endsWith('.css')));
for (const asset of [...assets, '/favicon.svg']) {
  assert.ok((await stat(new URL(`static${asset}`, output))).size > 0, asset);
}

const config = { samples: 40, endLogYears: 11 };
const response = await simulate({ config });
assert.equal(response.status, 200);
assert.equal(response.headers.get('cache-control'), 'no-store');
const result = await response.json();
assert.equal(result.status, 'complete');
assert.ok(result.samples.length >= 40);
assert.ok(
  result.samples.every((sample) => Number.isFinite(sample.expansionIndex)),
);
assert.equal(
  (await simulate({ config: [], mode: 'deterministic' })).status,
  400,
);
assert.equal((await simulate({ config, mode: 'unknown' })).status, 400);
assert.equal(
  (await request('/api/simulate', { method: 'POST', body: '{' })).status,
  400,
);
assert.equal(
  (
    await request('/api/simulate', {
      method: 'POST',
      body: 'x'.repeat(1_000_001),
    })
  ).status,
  413,
);

const ensemble = await simulate({
  config,
  mode: 'ensemble',
  options: {
    runs: 4,
    seed: 42,
    distribution: 'gaussian',
    sigmas: [0.5, 0.005, 0.01, 0.01],
    interval: 0.68,
  },
});
assert.equal(ensemble.status, 200);
const ensembleResult = await ensemble.json();
assert.equal(ensembleResult.accepted + ensembleResult.rejected, 4);
assert.ok(ensembleResult.bands.length > 0);
const sensitivity = await simulate({ config, mode: 'sensitivity' });
assert.equal(sensitivity.status, 200);
assert.equal((await sensitivity.json()).length, 4);
const sweep = await simulate({
  config,
  mode: 'sweep',
  options: { w0Min: -1.1, w0Max: -0.9, waMin: -0.1, waMax: 0.1, resolution: 3 },
});
assert.equal(sweep.status, 200);
assert.equal((await sweep.json()).length, 9);
const observations = await request('/api/observations');
assert.equal(observations.status, 200);
assert.match(await observations.text(), /67\.36/);
console.log(
  `PASS Vercel routing, SSR, ${assets.size} referenced assets, simulation, all analysis modes and request validation.`,
);
