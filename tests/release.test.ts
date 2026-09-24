import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DATASET_VERSION, VERSION } from '../src/science/types';
import { simulate } from '../src/science/engine';
import { defaultConfig } from '../src/science/defaults';
// Paths are relative to the repository root, where `npm test` runs.
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
test('the engine version matches package.json and package-lock.json', () => {
  const { version } = json('package.json');
  const lock = json('package-lock.json');
  assert.equal(VERSION, version);
  assert.equal(lock.version, version);
  assert.equal(lock.packages[''].version, version);
  const r = simulate({ ...defaultConfig(), samples: 20, endLogYears: 8 });
  assert.equal(r.metadata.version, version);
});
test('the dataset version matches the observational constraints file', () => {
  const observations = json('data/observations/cosmology-constraints.json');
  assert.equal(DATASET_VERSION, observations.version);
  const r = simulate({ ...defaultConfig(), samples: 20, endLogYears: 8 });
  assert.equal(r.metadata.datasetVersion, observations.version);
});
