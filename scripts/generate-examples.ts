import { mkdir, writeFile } from 'node:fs/promises';
import { simulate } from '../src/science/engine';
import { defaultConfig } from '../src/science/defaults';
import { report } from '../src/science/report';
import type { Configuration } from '../src/science/types';
const baseline = defaultConfig();
const cases: Record<string, Partial<Configuration>> = {
  'observational-baseline': {},
  'desi-2026-cpl': defaultConfig('desi2026'),
  'mild-phantom': { deModel: 'constant', w0: -1.05 },
  'strong-phantom': { deModel: 'constant', w0: -1.5 },
  'decaying-dark-matter': { dmModel: 'decay', dmLogLifetime: 11 },
  'annihilating-dark-matter': { dmModel: 'annihilation' },
  'interacting-dark-matter': { dmModel: 'interacting' },
  'bounded-quintessence': { deModel: 'bounded', w0: -0.9, wa: 0.05 },
  'closed-matter-recollapse': {
    omegaB: 2,
    omegaDM: 0,
    omegaNu: 0,
    omegaR: 0,
    omegaDE: 0,
    omegaK: -1,
  },
  'negative-vacuum-recollapse': {
    omegaB: 1.1,
    omegaDM: 0,
    omegaNu: 0,
    omegaR: 0,
    omegaDE: -0.1,
  },
  'stable-proton-extreme-future': { endLogYears: 1000 },
  'hypothetical-proton-decay': { protonDecay: true, protonLogLifetime: 36 },
  'black-hole-remnants': { evaporation: 'remnant' },
  'nonstandard-w-event': {
    sandbox: true,
    events: [{ id: 'w-switch', logTime: 13, action: 'change-w', value: -0.8 }],
  },
  'matter-analytic-benchmark': {
    omegaB: 1,
    omegaDM: 0,
    omegaNu: 0,
    omegaR: 0,
    omegaDE: 0,
    omegaK: 0,
    endLogYears: 11,
  },
  'radiation-analytic-benchmark': {
    omegaB: 0,
    omegaDM: 0,
    omegaNu: 0,
    omegaR: 1,
    omegaDE: 0,
    omegaK: 0,
    endLogYears: 11,
  },
};
await mkdir('examples', { recursive: true });
const manifest = [];
for (const [id, patch] of Object.entries(cases)) {
  const c = { ...baseline, ...patch, name: id, samples: 100 };
  const result = simulate(c);
  await writeFile(
    `examples/${id}.config.json`,
    JSON.stringify(c, null, 2) + '\n',
  );
  await writeFile(
    `examples/${id}.result.json`,
    JSON.stringify(result, null, 2) + '\n',
  );
  if (id === 'observational-baseline')
    await writeFile(
      'examples/observational-baseline.report.md',
      report(result),
    );
  manifest.push({
    id,
    status: result.status,
    classification: result.classification,
    samples: result.samples.length,
    configurationHash: result.metadata.configurationHash,
    reason: result.diagnostics.reason,
  });
}
await writeFile(
  'examples/manifest.json',
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(
  `Generated ${manifest.length} reproducible example configurations and computed outputs.`,
);
