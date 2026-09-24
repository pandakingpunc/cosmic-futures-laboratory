import { readFile, access } from 'node:fs/promises';
// Usage: node scripts/release-check.mjs
// Checks that every declaration of the software and dataset versions agrees
// and that the citation metadata describes this release, not a previous one.
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
const text = (file) => readFile(file, 'utf8');
const json = async (file) => JSON.parse(await text(file));
const pkg = await json('package.json');
const lock = await json('package-lock.json');
const zen = await json('.zenodo.json');
const observations = await json('data/observations/cosmology-constraints.json');
const cff = await text('CITATION.cff');
const types = await text('src/science/types.ts');
const changelog = await text('CHANGELOG.md');
const errors = [];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unquote = (s) => s.replace(/^(['"])(.*)\1$/, '$2');
/** A top-level scalar of CITATION.cff, unquoted, or undefined. */
const cffField = (key) => {
  const value = cff.match(
    new RegExp(`^${esc(key)}:[ \\t]*(.*?)[ \\t\\r]*$`, 'm'),
  )?.[1];
  return value === undefined ? undefined : unquote(value);
};
/** The scalar keys of each `identifiers:` entry of CITATION.cff, in any order. */
function cffIdentifiers() {
  const lines = cff.split(/\r?\n/);
  const start = lines.findIndex((l) => /^identifiers:\s*$/.test(l));
  const entries = [];
  if (start < 0) return entries;
  for (const line of lines.slice(start + 1)) {
    // The list ends at the next top-level key.
    if (/^[^\s#-]/.test(line)) break;
    const [, item, key, value] =
      line.match(/^\s*(-\s+)?([\w-]+):\s*(.*?)\s*$/) ?? [];
    if (item) entries.push({});
    if (key && entries.length) entries.at(-1)[key] = unquote(value);
  }
  return entries;
}
const constant = (name) =>
  types.match(new RegExp(`^export const ${name} = '([^']*)';`, 'm'))?.[1];
const version = pkg.version;
const declared = {
  'package-lock.json version': lock.version,
  'package-lock.json packages[""].version': lock.packages?.['']?.version,
  'src/science/types.ts VERSION': constant('VERSION'),
  'CITATION.cff version': cffField('version'),
  '.zenodo.json version': zen.version,
};
for (const [where, value] of Object.entries(declared))
  if (value !== version)
    errors.push(`${where} is ${value}; package.json is ${version}.`);
const heading = changelog.match(
  new RegExp(`^## ${esc(version)}(?=\\s|$)(.*)$`, 'm'),
);
const changelogDate = heading?.[1].match(/\d{4}-\d{2}-\d{2}/)?.[0];
if (!heading) errors.push(`CHANGELOG.md has no "## ${version}" heading.`);
// A stale release date is otherwise consistent between the citation files.
else if (changelogDate && changelogDate !== cffField('date-released'))
  errors.push(
    `CHANGELOG.md dates ${version} ${changelogDate}, but CITATION.cff date-released is ${cffField('date-released')}.`,
  );
const dataset = constant('DATASET_VERSION');
if (dataset !== observations.version)
  errors.push(
    `src/science/types.ts DATASET_VERSION is ${dataset}; data/observations/cosmology-constraints.json is ${observations.version}.`,
  );
if (cffField('date-released') !== zen.publication_date)
  errors.push(
    `CITATION.cff date-released (${cffField('date-released')}) must equal .zenodo.json publication_date (${zen.publication_date}).`,
  );
if (cffField('title') !== zen.title)
  errors.push('CITATION.cff and .zenodo.json titles differ.');
if (cffField('license')?.toLowerCase() !== zen.license?.toLowerCase())
  errors.push('CITATION.cff and .zenodo.json licenses differ.');
// Zenodo assigns each version its own DOI; a fixed one would be reused.
if ('doi' in zen)
  errors.push('.zenodo.json must not contain a doi; Zenodo assigns it.');
// The top-level doi must be listed under identifiers, so that the version its
// description names can be checked.
const doi = cffField('doi');
const listed = cffIdentifiers().filter(
  (i) => i.type === 'doi' && i.value === doi,
);
if (doi && !listed.length)
  errors.push(
    `CITATION.cff doi ${doi} is not listed under identifiers; list it with a description naming its version, or remove it.`,
  );
for (const { description = '' } of listed) {
  const other = description
    .match(/\b\d+\.\d+\.\d+\b/g)
    ?.find((v) => v !== version);
  if (other)
    errors.push(
      `CITATION.cff doi ${doi} is the DOI of version ${other}; remove it or replace it with the ${version} version DOI.`,
    );
}
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
    `Release metadata for ${version} (dataset ${dataset}) is consistent across package.json, package-lock.json, types.ts, CITATION.cff, .zenodo.json and CHANGELOG.md. Review the documented scientific limitations before releasing.`,
  );
