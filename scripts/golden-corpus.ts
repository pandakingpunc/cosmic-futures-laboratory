import { writeFile } from 'node:fs/promises';
import { simulate } from '../src/science/engine';
import { defaultConfig } from '../src/science/defaults';
import type { Configuration } from '../src/science/types';
import {
  FINGERPRINT_FIELDS,
  fingerprint,
  type CorpusCase,
} from '../tests/golden/fingerprint';
// Small configurations for branches the published examples do not reach.
// Regenerate only for a deliberate change of numerical behaviour.
const empty = {
  omegaB: 0,
  omegaDM: 0,
  omegaNu: 0,
  omegaR: 0,
  omegaDE: 0,
  omegaK: 0,
};
const cases: Record<string, Partial<Configuration>> = {
  'numerical-segment-interventions': {
    sandbox: true,
    endLogYears: 14,
    events: [
      { id: 'g', logTime: 10, action: 'change-G', value: 4 },
      { id: 'v', logTime: 10.5, action: 'vacuum-scale', value: 0.25 },
    ],
  },
  'vacuum-decay-clock': {
    vacuumDecay: true,
    vacuumLogLifetime: 11,
    endLogYears: 13,
  },
  'closed-radiation-recollapse': {
    ...empty,
    omegaB: 1.5,
    omegaR: 0.1,
    omegaK: -0.6,
    endLogYears: 12,
  },
  'warm-dark-matter-tail': { dmModel: 'warm', warmW: 0.01 },
  'interacting-dark-matter-tail': { dmModel: 'interacting', interaction: 0.1 },
  'strong-annihilation': {
    dmModel: 'annihilation',
    annihilation: 0.5,
    endLogYears: 12,
  },
  'custom-expression': {
    deModel: 'custom',
    expression: '-1 + 0.05 * tanh(log(a))',
    endLogYears: 30,
  },
  'cpl-extrapolation': { deModel: 'cpl', w0: -0.95, wa: -0.3, endLogYears: 30 },
  // 1 − Ωde ≈ 4×10⁻⁸ at ln a = 60, between the tail threshold and 10⁻⁷.
  'dominance-threshold-edge': { deModel: 'constant', w0: -0.09 },
};
const entries: CorpusCase[] = Object.entries(cases).map(([id, patch]) => {
  const config: Configuration = {
    ...defaultConfig(),
    ...patch,
    name: id,
    preset: 'custom',
    samples: 40,
  };
  return { id, config, fingerprint: fingerprint(simulate(config)) };
});
// One sample per line keeps the file compact and its diffs readable.
const json = JSON.stringify;
const text = [
  '{',
  `  "regenerate": ${json('npm run golden:update')},`,
  `  "fields": ${json(FINGERPRINT_FIELDS)},`,
  '  "cases": [',
  entries
    .map(({ id, config, fingerprint: f }) =>
      [
        '    {',
        `      "id": ${json(id)},`,
        `      "config": ${json(config)},`,
        '      "fingerprint": {',
        `        "status": ${json(f.status)},`,
        `        "classification": ${json(f.classification)},`,
        `        "acceptedSteps": ${f.acceptedSteps},`,
        `        "rejectedSteps": ${f.rejectedSteps},`,
        `        "events": ${json(f.events)},`,
        '        "samples": [',
        f.samples.map((s) => `          ${json(s)}`).join(',\n'),
        '        ]',
        '      }',
        '    }',
      ].join('\n'),
    )
    .join(',\n'),
  '  ]',
  '}',
  '',
].join('\n');
await writeFile('tests/golden/corpus.json', text);
for (const { id, fingerprint: f } of entries)
  console.log(
    `${id}: ${f.status}, ${f.classification}, ${f.samples.length} samples`,
  );
console.log(
  `Wrote tests/golden/corpus.json (${entries.length} cases, ${(Buffer.byteLength(text) / 1024).toFixed(1)} KB).`,
);
