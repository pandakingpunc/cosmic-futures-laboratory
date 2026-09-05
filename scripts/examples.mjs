import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
await mkdir('.test-output', { recursive: true });
await build({
  entryPoints: ['scripts/generate-examples.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: '.test-output/examples.mjs',
  logLevel: 'warning',
});
await import(pathToFileURL(resolve('.test-output/examples.mjs')).href);
