import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate } from '../src/science/engine';
import { runAnalysis, isAnalysisMode } from '../src/science/dispatch';
import { POST } from '../app/api/simulate/route';
test('the analysis dispatcher and HTTP route agree and validate modes', async () => {
  assert.ok(isAnalysisMode('sweep') && !isAnalysisMode('unknown'));
  const c = { samples: 40, endLogYears: 8 };
  const direct = runAnalysis('deterministic', c) as ReturnType<typeof simulate>;
  const post = (body: unknown) =>
    POST(
      new Request('http://laboratory.test/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
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
  assert.equal((await post('{')).status, 400);
  const missing = await post({ config: c, mode: 'ensemble' });
  assert.equal(missing.status, 400);
  assert.match(((await missing.json()) as { error: string }).error, /options/);
  const sweepResponse = await post({
    config: c,
    mode: 'sweep',
    options: { w0Min: -1.1, w0Max: -0.9, waMin: 0, waMax: 0.1, resolution: 3 },
  });
  assert.equal(sweepResponse.status, 200);
  assert.equal(((await sweepResponse.json()) as unknown[]).length, 9);
});
