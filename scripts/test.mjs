import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
await mkdir('.test-output', { recursive: true });
await build({
  entryPoints: ['tests/science.test.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: '.test-output/science.test.mjs',
  logLevel: 'warning',
});
await import(pathToFileURL(resolve('.test-output/science.test.mjs')).href);
