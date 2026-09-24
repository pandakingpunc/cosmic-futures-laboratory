import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { globSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
// Usage: node scripts/test.mjs [--coverage]
// Test files are bundled because Node's type stripping cannot resolve the
// extensionless imports, the '@/' alias or the JSON imports.
const coverage = process.argv.includes('--coverage');
const entries = globSync('tests/**/*.test.ts').sort();
if (!entries.length) throw new Error('No tests/**/*.test.ts files found.');
const outdir = join('.test-output', coverage ? 'coverage' : 'tests');
rmSync(outdir, { recursive: true, force: true });
const options = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  sourcemap: 'linked',
  logLevel: 'warning',
};
let bundles, flags;
if (coverage) {
  // One bundle loads each source module once, which keeps the merged
  // coverage exact and reproducible. Node applies the include globs to the
  // bundle before mapping it back, so the bundle must match them too.
  bundles = [join(outdir, 'all.test.mjs')];
  await build({
    ...options,
    stdin: {
      contents: entries
        .map((e) => `import './${e.split('\\').join('/')}';`)
        .join('\n'),
      resolveDir: process.cwd(),
      sourcefile: 'all.test.ts',
      loader: 'ts',
    },
    outfile: bundles[0],
  });
  flags = [
    '--experimental-test-coverage',
    '--test-coverage-include=.test-output/coverage/**',
    '--test-coverage-include=src/science/**',
    '--test-coverage-include=app/api/**',
    '--test-coverage-include=components/lab/persistence.ts',
    '--test-coverage-lines=88',
    '--test-coverage-branches=82',
  ];
} else {
  bundles = entries.map((e) =>
    join(outdir, relative('tests', e)).replace(/\.ts$/, '.mjs'),
  );
  await build({
    ...options,
    entryPoints: entries,
    outdir,
    outbase: 'tests',
    outExtension: { '.js': '.mjs' },
  });
  flags = [];
}
const run = spawnSync(
  process.execPath,
  ['--test', '--enable-source-maps', ...flags, ...bundles],
  { stdio: 'inherit' },
);
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
