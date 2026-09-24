import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
const check = (...args: string[]) =>
  spawnSync(process.execPath, ['scripts/check-architecture.mjs', ...args], {
    encoding: 'utf8',
  });
test('the science modules respect their dependency layers', () => {
  const run = check();
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Architecture check passed/);
});
test('the architecture check rejects upward, interface and worker imports', () => {
  const root = mkdtempSync(join(tmpdir(), 'architecture-'));
  const files: Record<string, string> = {
    'src/science/core/up.ts': "import { simulate } from '../engine';\n",
    'src/science/model/ui.ts': "import { useState } from 'react';\n",
    'src/science/solver/ok.ts':
      "import type { Model } from '../model/background';\nimport { ln } from '../core/numeric';\n",
    'src/science/extra.ts': 'export const x = 1;\n',
    'components/lab/runtime.ts':
      "import { runAnalysis } from '@/src/science/worker';\n",
    'components/lab/types.ts':
      "import type { ComputeRequest } from '@/src/science/worker';\n",
  };
  try {
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), source);
    }
    const run = check('--root', root);
    assert.equal(run.status, 1);
    const failures = run.stderr.trim().split('\n');
    assert.equal(failures.length, 4, run.stderr);
    assert.match(
      run.stderr,
      /core\/up\.ts:1 \(layer 0\) imports '\.\.\/engine' from higher layer 3/,
    );
    assert.match(run.stderr, /model\/ui\.ts:1 imports interface code 'react'/);
    assert.match(run.stderr, /extra\.ts has no layer/);
    assert.match(
      run.stderr,
      /runtime\.ts:1 imports runtime code from the worker/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
