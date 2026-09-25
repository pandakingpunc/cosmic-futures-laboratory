import { build, transformSync } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync, globSync, readFileSync, rmSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
// Usage: node scripts/test.mjs [--coverage]
// Tests are bundled because Node alone cannot resolve the extensionless
// imports, the '@/' alias or the JSON imports. Coverage instead runs the
// sources unbundled through module hooks (this file imported with ?hooks):
// in a bundle every module's top-level code shares one function, which
// Node's source-map coverage cannot attribute, so imports, declarations and
// comments were counted as uncovered lines.
if (new URL(import.meta.url).searchParams.has('hooks')) registerSourceHooks();
else await runTests();

async function runTests() {
  const coverage = process.argv.includes('--coverage');
  const entries = globSync('tests/**/*.test.ts').sort();
  if (!entries.length) throw new Error('No tests/**/*.test.ts files found.');
  if (coverage) {
    // One process loads each source module once, so the report is exact and
    // reproducible. Measured with Node 24: 99.3% lines, 95.8% branches, 100%
    // functions; the thresholds leave 1–2 points for incidental changes.
    // Node reports only modules a test loads, so the browser worker and the
    // re-export entry points (index.ts, integrator.ts) are not measured.
    return spawn([
      '--import',
      new URL('?hooks', import.meta.url).href,
      '--test',
      '--test-isolation=none',
      '--experimental-test-coverage',
      '--test-coverage-include=src/science/**',
      '--test-coverage-include=app/api/**',
      '--test-coverage-include=components/lab/persistence.ts',
      '--test-coverage-lines=98',
      '--test-coverage-branches=94',
      '--test-coverage-functions=98',
      ...entries,
    ]);
  }
  const outdir = join('.test-output', 'tests');
  rmSync(outdir, { recursive: true, force: true });
  await build({
    entryPoints: entries,
    outdir,
    outbase: 'tests',
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    sourcemap: 'linked',
    logLevel: 'warning',
  });
  spawn([
    '--test',
    '--enable-source-maps',
    ...entries.map((e) =>
      join(outdir, relative('tests', e)).replace(/\.ts$/, '.mjs'),
    ),
  ]);
}

function spawn(args) {
  const run = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (run.error) throw run.error;
  process.exitCode = run.status ?? 1;
}

/**
 * Resolves the project's extensionless and '@/' imports and loads JSON as a
 * default export. `.ts` files are left to Node's type stripping, which keeps
 * every line and column, so coverage refers to the real source lines (type-
 * only imports therefore need `import type`). `.tsx` is compiled by esbuild.
 */
function registerSourceHooks() {
  const root = new URL('../', import.meta.url).href;
  const tsconfigRaw = readFileSync(new URL('tsconfig.json', root), 'utf8');
  const own = (url) => url.startsWith(root) && !url.includes('/node_modules/');
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier.startsWith('@/'))
        specifier = new URL(specifier.slice(2), root).href;
      const parent = context.parentURL;
      if (
        parent &&
        own(parent) &&
        /^(\.|file:)/.test(specifier) &&
        !/\.([cm]?[jt]sx?|json)$/.test(specifier)
      ) {
        const base = new URL(specifier, parent).href;
        for (const ext of ['.ts', '.tsx', '/index.ts'])
          if (existsSync(new URL(base + ext))) return next(base + ext, context);
      }
      return next(specifier, context);
    },
    load(url, context, next) {
      if (own(url) && url.endsWith('.tsx')) {
        const path = fileURLToPath(url);
        const { code } = transformSync(readFileSync(path, 'utf8'), {
          loader: 'tsx',
          format: 'esm',
          sourcemap: 'inline',
          sourcefile: path,
          tsconfigRaw,
        });
        return { format: 'module', source: code, shortCircuit: true };
      }
      if (
        own(url) &&
        url.endsWith('.json') &&
        context.importAttributes?.type !== 'json'
      )
        return {
          format: 'module',
          source: `export default ${readFileSync(fileURLToPath(url), 'utf8')};`,
          shortCircuit: true,
        };
      return next(url, context);
    },
  });
}
