import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { ensemble, sensitivity, sweep } from '../src/science/analysis';
import { defaultConfig } from '../src/science/defaults';
import { simulate, type SimulationCounters } from '../src/science/engine';
// Usage: npm run bench [-- --check-counters | --update-baseline] [--counters-only]
// Work counters are deterministic and gate regressions; wall times are
// machine dependent and only reported.
const args = new Set(process.argv.slice(2));
const check = args.has('--check-counters'),
  update = args.has('--update-baseline'),
  timed = !args.has('--counters-only');
const BASELINE = 'bench/baseline.json',
  TOLERANCE = 1.01,
  WARMUPS = 2,
  REPETITIONS = 7;
const base = defaultConfig();
const workloads: Record<string, (counters?: SimulationCounters) => unknown> = {
  'default-240-samples-1e100': (counters) => simulate(base, { counters }),
  'samples-1000-1e11': (counters) =>
    simulate({ ...base, samples: 1000, endLogYears: 11 }, { counters }),
  'desi-2026-cpl': (counters) =>
    simulate(defaultConfig('desi2026'), { counters }),
  'closed-dust-recollapse': (counters) =>
    simulate(
      {
        ...base,
        omegaB: 2,
        omegaDM: 0,
        omegaNu: 0,
        omegaR: 0,
        omegaDE: 0,
        omegaK: -1,
      },
      { counters },
    ),
  'strong-phantom-w-1.5': (counters) =>
    simulate({ ...base, deModel: 'constant', w0: -1.5 }, { counters }),
  'de-sitter-tail-1e1000': (counters) =>
    simulate({ ...base, endLogYears: 1000 }, { counters }),
  'ensemble-64-seed-1': (counters) =>
    ensemble(
      base,
      {
        runs: 64,
        seed: 1,
        distribution: 'gaussian',
        sigmas: [0.54, 0.0073, 0.03, 0.05],
        interval: 0.95,
      },
      { counters },
    ),
  'sweep-9x9': (counters) =>
    sweep(
      base,
      { w0Min: -1.3, w0Max: -0.7, waMin: -0.5, waMax: 0.5, resolution: 9 },
      { counters },
    ),
  sensitivity: (counters) => sensitivity(base, { counters }),
};
interface Measurement {
  counters: SimulationCounters;
  medianMs: number | null;
  p90Ms: number | null;
}
interface BenchRecord {
  node: string;
  os: string;
  cpu: string;
  workloads: Record<string, Measurement>;
}
function measure(run: (counters?: SimulationCounters) => unknown) {
  const counters: SimulationCounters = {
    derivativeEvaluations: 0,
    samplingEvaluations: 0,
    rootIterations: 0,
  };
  run(counters);
  if (!timed) return { counters, medianMs: null, p90Ms: null };
  for (let i = 0; i < WARMUPS; i++) run();
  const times: number[] = [];
  for (let i = 0; i < REPETITIONS; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    counters,
    medianMs: round(times[Math.floor(times.length / 2)]),
    p90Ms: round(times[Math.ceil(0.9 * times.length) - 1]),
  };
}
const current: BenchRecord = {
  node: process.version,
  os: `${platform()} ${release()} ${arch()}`,
  cpu: cpus()[0]?.model.trim() ?? 'unknown',
  workloads: {},
};
for (const [id, run] of Object.entries(workloads))
  current.workloads[id] = measure(run);
let baseline: BenchRecord | null = null;
try {
  baseline = JSON.parse(await readFile(BASELINE, 'utf8'));
} catch {
  baseline = null;
}
const columns = [
  ['workload', 28],
  ['integration', 12],
  ['sampling', 12],
  ['root iter.', 11],
  ['median ms', 10],
  ['p90 ms', 9],
  ['vs baseline', 12],
] as const;
const row = (cells: string[]) =>
  cells
    .map((cell, i) =>
      i === 0 ? cell.padEnd(columns[i][1]) : cell.padStart(columns[i][1]),
    )
    .join(' ');
console.log(`Node ${current.node}; ${current.os}; ${current.cpu}`);
console.log(row(columns.map(([name]) => name)));
const failures: string[] = [],
  notes: string[] = [];
for (const [id, m] of Object.entries(current.workloads)) {
  const reference = baseline?.workloads[id];
  const ratio =
    reference?.medianMs && m.medianMs ? m.medianMs / reference.medianMs : null;
  console.log(
    row([
      id,
      String(m.counters.derivativeEvaluations),
      String(m.counters.samplingEvaluations),
      String(m.counters.rootIterations),
      m.medianMs?.toFixed(2) ?? '-',
      m.p90Ms?.toFixed(2) ?? '-',
      ratio === null ? '-' : `${ratio.toFixed(2)}× time`,
    ]),
  );
  if (!check || !baseline) continue;
  if (!reference) {
    failures.push(`${id}: missing from ${BASELINE}; run --update-baseline.`);
    continue;
  }
  for (const [name, value] of Object.entries(m.counters) as [
    keyof SimulationCounters,
    number,
  ][]) {
    const expected = reference.counters[name];
    if (value > TOLERANCE * expected)
      failures.push(`${id}: ${name} ${value} exceeds baseline ${expected}.`);
    else if (value < expected / TOLERANCE)
      notes.push(`${id}: ${name} fell from ${expected} to ${value}.`);
  }
  if (ratio !== null && ratio > 1.25)
    notes.push(`${id}: median time ${ratio.toFixed(2)}× the baseline machine.`);
}
await mkdir('bench', { recursive: true });
await writeFile('bench/results.json', JSON.stringify(current, null, 2) + '\n');
if (update) {
  await writeFile(BASELINE, JSON.stringify(current, null, 2) + '\n');
  console.log(`Updated ${BASELINE}.`);
}
for (const note of notes) console.log(`note: ${note}`);
if (check && !baseline) failures.push(`${BASELINE} is missing.`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else if (check)
  console.log(
    `Work counters are within ${Math.round((TOLERANCE - 1) * 100)}% of ${BASELINE}.`,
  );
