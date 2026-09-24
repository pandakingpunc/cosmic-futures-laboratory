import { build } from 'esbuild';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Usage: node scripts/run-ts.mjs <entry.ts> [arguments...]
// Bundles a TypeScript entry point and runs it with the remaining arguments.
const [entry, ...args] = process.argv.slice(2);
if (!entry)
  throw new Error('Usage: node scripts/run-ts.mjs <entry.ts> [arguments...]');
const outfile = resolve(
  join('.test-output', 'run', basename(entry).replace(/\.[cm]?tsx?$/, '.mjs')),
);
await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  sourcemap: 'linked',
  logLevel: 'warning',
});
process.setSourceMapsEnabled(true);
process.argv = [process.argv[0], outfile, ...args];
await import(pathToFileURL(outfile).href);
