import { readFile, access } from 'node:fs/promises';
const required = [
  'README.md',
  'LICENSE',
  'CITATION.cff',
  '.zenodo.json',
  'CHANGELOG.md',
  'package-lock.json',
  'docs/methodology.md',
  'docs/scope.md',
  'docs/data-provenance.md',
  'docs/validation.md',
  'examples/manifest.json',
];
for (const file of required) await access(file);
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const zen = JSON.parse(await readFile('.zenodo.json', 'utf8'));
const cff = await readFile('CITATION.cff', 'utf8');
const errors = [];
if (zen.version !== pkg.version || !cff.includes(`version: ${pkg.version}`))
  errors.push('Package, Zenodo and citation versions must match.');
if (
  JSON.stringify(zen).includes('REPLACE_WITH') ||
  cff.includes('REPLACE_WITH')
)
  errors.push(
    'The release owner must supply actual author metadata in CITATION.cff and .zenodo.json.',
  );
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'Publication structure and owner metadata checks passed. Review the documented scientific limitations before releasing.',
  );
