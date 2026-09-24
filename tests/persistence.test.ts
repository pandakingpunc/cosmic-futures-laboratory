import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate } from '../src/science/engine';
import { defaultConfig } from '../src/science/defaults';
import {
  encodeConfig,
  decodeConfig,
  readSharedConfig,
  shareHash,
  isResult,
} from '../components/lab/persistence';
import type { Configuration } from '../src/science/types';
test('shareable links round-trip configurations including non-ASCII names', () => {
  const c = { ...defaultConfig(), name: 'Λ · deneme ✓', w0: -1.05 };
  const encoded = encodeConfig(c);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeConfig(encoded), c);
  assert.deepEqual(readSharedConfig(shareHash(c)), c);
  assert.equal(readSharedConfig('#other=1'), null);
  assert.equal(decodeConfig('not base64 @@'), null);
  assert.equal(
    decodeConfig(encodeConfig([] as unknown as Configuration)),
    null,
  );
  const partial = decodeConfig(
    btoa(JSON.stringify({ H0: 70 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, ''),
  );
  assert.equal(partial?.H0, 70);
  assert.equal(partial?.omegaB, defaultConfig().omegaB);
});
test('result files are recognized for the comparison bench', () => {
  const r = simulate({ ...defaultConfig(), endLogYears: 6, samples: 40 });
  assert.ok(isResult(JSON.parse(JSON.stringify(r))));
  assert.ok(!isResult(defaultConfig()));
  assert.ok(!isResult(null));
  assert.ok(!isResult({ samples: [], events: [] }));
});
