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
test('the architecture check rejects upward, interface and worker imports and platform-dependent functions', () => {
  const root = mkdtempSync(join(tmpdir(), 'architecture-'));
  const files: Record<string, string> = {
    'src/science/core/up.ts': "import { simulate } from '../engine';\n",
    'src/science/model/ui.ts': "import { useState } from 'react';\n",
    'src/science/solver/ok.ts':
      "import type { Model } from '../model/background';\nimport { ln } from '../core/numeric';\n",
    'src/science/extra.ts': 'export const x = 1;\n',
    // Five platform-dependent powers; the string and the comment are fine.
    'src/science/solver/power.ts':
      "export const f = (x: number) => x ** 2 + Math.pow(x, 3) + Math['pow'](x, 4);\nlet y = 2;\ny **= 0.5;\nconst { pow } = Math;\nexport const g = '**' + pow(2, 3) + y; // x ** y\n",
    // Every script extension is checked, not only .ts.
    'src/science/model/legacy.mjs': 'export const h = (x) => x ** 3;\n',
    // Math.tanh is rejected in the engine; Math.cosh is not.
    'src/science/model/hyperbolic.ts':
      'export const t = (x: number) => Math.cosh(x) + Math.tanh(x);\n',
    // The interface may not use ** either, but may use Math.tanh.
    'components/lab/derive.tsx':
      'export const r = (h: number) => 2.47e-5 / (h / 100) ** 2 + Math.tanh(h);\n',
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
    assert.equal(failures.length, 12, run.stderr);
    for (const [line, what] of [
      [1, "'\\*\\*'"],
      [1, 'Math\\.pow'],
      [1, 'Math\\.pow'],
      [3, "'\\*\\*='"],
      [4, 'Math\\.pow'],
    ] as const)
      assert.match(
        run.stderr,
        new RegExp(`power\\.ts:${line} uses ${what}, which rounds differently`),
      );
    assert.equal(run.stderr.match(/power\.ts:1 uses Math\.pow/g)?.length, 2);
    assert.match(run.stderr, /legacy\.mjs:1 uses '\*\*', which rounds/);
    assert.match(
      run.stderr,
      /hyperbolic\.ts:1 uses Math\.tanh, which newer V8 versions take from the operating system's C library; use tanhPortable/,
    );
    assert.match(run.stderr, /derive\.tsx:1 uses '\*\*', which rounds/);
    assert.doesNotMatch(run.stderr, /Math\.cosh|derive\.tsx:1 uses Math/);
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
