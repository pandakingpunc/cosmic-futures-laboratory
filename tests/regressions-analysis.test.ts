import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import {
  ensemble,
  sensitivity,
  sweep,
  type EnsembleOptions,
} from '../src/science/analysis';
import {
  API_LIMITS,
  BudgetExceededError,
  ValidationError,
  type WorkBudget,
} from '../src/science/core/limits';
import {
  canonicalConfig,
  defaultConfig,
  presets,
} from '../src/science/defaults';
import { runAnalysis } from '../src/science/dispatch';
import {
  hashConfig,
  simulate,
  validate,
  type SimulationCounters,
} from '../src/science/engine';
import { report } from '../src/science/report';
import type { Configuration, Result } from '../src/science/types';
import { pure } from './helpers';
// Regression tests for the analysis, API-contract and provenance findings.
const base = { ...defaultConfig(), endLogYears: 11, samples: 40 };
const options: EnsembleOptions = {
  runs: 8,
  seed: 1,
  distribution: 'gaussian',
  sigmas: [0.54, 0.0073, 0.03, 0.05],
  interval: 0.9,
};
const budget = (limit: number): WorkBudget => ({ limit, used: 0 });
const throwsBudget = (f: () => unknown) =>
  assert.throws(f, (e) => e instanceof BudgetExceededError);
const throwsValidation = (f: () => unknown, pattern?: RegExp) =>
  assert.throws(
    f,
    (e) =>
      e instanceof ValidationError && (!pattern || pattern.test(e.message)),
  );
test('analysis-dos-no-work-budget: a shared budget stops a pathological ensemble deterministically', () => {
  const dos = {
    deModel: 'custom' as const,
    expression: '-1+0.5*sin(10000*a)+0*(a' + '+a'.repeat(95) + ')',
  };
  const used = () => {
    const b = budget(100_000);
    throwsBudget(() =>
      runAnalysis('ensemble', dos, { ...options, runs: 64 }, { budget: b }),
    );
    return b.used;
  };
  assert.equal(used(), 100_001);
  assert.equal(used(), 100_001);
  // The HTTP budget still completes a reference 64-run ensemble.
  const b = budget(API_LIMITS.evaluations);
  const r = runAnalysis(
    'ensemble',
    {},
    { ...options, runs: 64 },
    { budget: b },
  );
  assert.equal((r as { accepted: number }).accepted, 64);
  assert.ok(b.used < API_LIMITS.evaluations / 2);
});
test('analysis-dos-no-work-budget: an unbudgeted run still ends at its own try limit', () => {
  const r = simulate({
    ...base,
    deModel: 'custom',
    expression: '-1 + 0.5*sin(10000*a)',
  });
  assert.equal(r.status, 'limited');
  assert.match(r.diagnostics.reason, /Integration budget reached/);
  assert.equal(
    r.diagnostics.acceptedSteps + r.diagnostics.rejectedSteps,
    40000,
  );
});
test('api-unbounded-cpu: budget exhaustion propagates through every step-rejection handler', () => {
  const counted = (c: Configuration) => {
    const counters: SimulationCounters = {
      derivativeEvaluations: 0,
      samplingEvaluations: 0,
      rootIterations: 0,
    };
    simulate(c, { counters });
    return counters;
  };
  for (const c of [
    base,
    pure({ omegaB: 2, omegaK: -1, endLogYears: 12 }),
    { ...base, deModel: 'custom' as const, expression: '-1 + 0.5*sin(30*a)' },
  ]) {
    const n = counted(c);
    // Inside integration, and inside output sampling after it.
    for (const limit of [
      3,
      n.derivativeEvaluations - 1,
      n.derivativeEvaluations + 5,
    ])
      throwsBudget(() => simulate(c, { budget: budget(limit) }));
    // An ample budget changes nothing and counts every evaluation.
    const b = budget(1e12);
    assert.deepEqual(
      simulate(c, { budget: b, timestamp: 't' }),
      simulate(c, { timestamp: 't' }),
    );
    assert.equal(b.used, n.derivativeEvaluations + n.samplingEvaluations);
  }
  throwsBudget(() =>
    sweep(
      base,
      { w0Min: -1.2, w0Max: -0.8, waMin: 0, waMax: 0.1, resolution: 3 },
      { budget: budget(2_000) },
    ),
  );
  throwsBudget(() => sensitivity(base, { budget: budget(2_000) }));
});
test('analyses-ignore-invalid-base: analyses reject an invalid base configuration', () => {
  const invalid = { ...base, omegaDE: 0.5 };
  throwsValidation(() => ensemble(invalid, options), /Base configuration/);
  throwsValidation(() => sensitivity(invalid), /Density closure/);
  throwsValidation(() =>
    sweep(invalid, {
      w0Min: -1.1,
      w0Max: -0.9,
      waMin: 0,
      waMax: 0.1,
      resolution: 3,
    }),
  );
  throwsValidation(() => runAnalysis('ensemble', invalid, options));
  // A deterministic run still reports the invalid status instead of throwing.
  assert.equal(
    (runAnalysis('deterministic', invalid) as Result).status,
    'invalid',
  );
});
test('ensemble-interval-validation and ensemble-options-validation: options are validated strictly', () => {
  const bad: Partial<Record<keyof EnsembleOptions, unknown>>[] = [
    { interval: undefined },
    { interval: NaN },
    { interval: '0.9' },
    { interval: 0 },
    { interval: 1 },
    { distribution: 'lognormal' },
    { distribution: 'Gaussian' },
    { posterior: { length: 3 } },
    { posterior: [[1, 2, 3]] },
    { posterior: [] },
    { covariance: 'abcd' },
    { covariance: [[1, 0, 0, 0]] },
    { runs: 3.5 },
    { runs: 300 },
    { sigmas: [1, 1, 1] },
    { sigmas: [1, -1, 1, 1] },
    { seed: 1.5 },
    { seed: -1 },
    { seed: 2 ** 32 },
  ];
  for (const patch of bad)
    throwsValidation(
      () => ensemble(base, { ...options, ...patch } as EnsembleOptions),
      undefined,
    );
  throwsValidation(() =>
    ensemble(base, {
      ...options,
      distribution: 'uniform',
      covariance: [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ],
    }),
  );
  const ok = ensemble(base, options);
  assert.ok(
    ok.bands.every((b) => Number.isFinite(b.low) && Number.isFinite(b.high)),
  );
});
test('preset-label-not-applied: a partial configuration is completed from its named preset', () => {
  const desi = runAnalysis('deterministic', {
    preset: 'desi2026',
    samples: 40,
    endLogYears: 11,
  }) as Result;
  const reference = defaultConfig('desi2026');
  assert.equal(desi.config.preset, 'desi2026');
  assert.equal(desi.config.name, reference.name);
  assert.equal(desi.config.deModel, reference.deModel);
  assert.equal(desi.config.H0, reference.H0);
  assert.equal(desi.config.wa, reference.wa);
  assert.ok(presets.some((p) => p.id === 'desi2026'));
  assert.ok(
    validate({ ...base, preset: { x: 1 } as unknown as string }).fields.preset,
  );
  // An unknown preset id falls back to the default preset's parameters.
  const other = runAnalysis('deterministic', {
    preset: 'unknown',
    samples: 40,
    endLogYears: 8,
  }) as Result;
  assert.equal(other.config.H0, defaultConfig().H0);
});
test('lambda-ensemble-ignores-w: inactive parameter draws are disclosed', () => {
  const note = (c: Configuration, sigmas: number[]) =>
    ensemble(c, { ...options, sigmas }).notes.find((n) =>
      n.includes('no effect'),
    );
  assert.match(note(base, [0, 0, 0.3, 0.3])!, /^w0 and wa draws/);
  assert.match(
    note({ ...base, deModel: 'constant', w0: -0.9 }, [0, 0, 0.3, 0.3])!,
    /^wa draws/,
  );
  assert.equal(note(base, [0.5, 0.01, 0, 0]), undefined);
  assert.equal(
    note({ ...base, deModel: 'bounded', w0: -0.9, wa: 0 }, [0, 0, 0.3, 0.3]),
    undefined,
  );
});
test('lambda-ensemble-ignores-w: covariance and posterior widths are checked per parameter', () => {
  const identity = [
    [1, 0, 0, 0],
    [0, 1e-6, 0, 0],
    [0, 0, 0.01, 0],
    [0, 0, 0, 0.01],
  ];
  const covariance = ensemble(base, { ...options, covariance: identity });
  assert.ok(
    covariance.notes.some((n) => n.startsWith('User-supplied Gaussian')),
  );
  assert.ok(covariance.notes.some((n) => n.includes('no effect')));
  const both = ensemble(base, {
    ...options,
    covariance: identity,
    posterior: [
      [67, 0.3, -1, 0],
      [68, 0.3, -1, 0],
    ],
  });
  assert.ok(both.notes.some((n) => n.includes('covariance was not used')));
  assert.ok(!both.notes.some((n) => n.includes('no effect')));
  // Draws with negative matter are rejected and counted, never replaced.
  const wide = ensemble(base, { ...options, sigmas: [0, 1, 0, 0] });
  assert.ok(wide.rejected > 0);
  assert.equal(wide.accepted + wide.rejected, options.runs);
});
test('ensemble-seed-streams and seed-aliasing: seeds are integers and streams independent', () => {
  for (const seed of [7.5, -1, 2 ** 32, 1e20])
    assert.ok(validate({ ...base, seed }).fields.seed, String(seed));
  assert.equal(validate({ ...base, seed: 2 ** 32 - 1 }).errors.length, 0);
  // Posterior resampling draws only the row index, so the ignored
  // distribution setting cannot change it.
  const posterior = [
    [67, 0.3, -1, 0],
    [68, 0.31, -1, 0],
    [69, 0.32, -1, 0],
  ];
  const run = (distribution: 'gaussian' | 'uniform') =>
    ensemble(base, { ...options, distribution, posterior }).bands;
  assert.deepEqual(run('gaussian'), run('uniform'));
  // Neighbouring seeds no longer share shifted vacuum clocks.
  const survival = (seed: number) =>
    ensemble(
      { ...base, vacuumDecay: true, vacuumLogLifetime: 10, endLogYears: 11 },
      { ...options, runs: 32, seed, sigmas: [0, 0, 0, 0] },
    ).bands.map((b) => b.surviving);
  const a = survival(5),
    b = survival(6);
  assert.ok(a.filter((v, i) => v !== b[i]).length > 5);
});
test('sensitivity-absolute-h0-step: steps adapt, one-sided differences are reported, nulls sort last', () => {
  const row = (c: Configuration, p: string) =>
    sensitivity(c).find((r) => r.parameter === p)!;
  const small = row({ ...base, H0: 0.5 }, 'H0');
  assert.equal(small.scheme, 'central');
  assert.equal(small.step, 0.25);
  assert.ok(small.derivative !== null && small.derivative > 0);
  const large = row({ ...base, H0: 999.5 }, 'H0');
  assert.equal(large.scheme, 'backward');
  assert.ok(large.derivative !== null && large.derivative > 0);
  const empty = pure({ omegaDE: 1, omegaR: 0 });
  const matter = row(empty, 'omegaM');
  assert.equal(matter.scheme, 'forward');
  assert.ok(matter.derivative !== null);
  // Runs that never reach the horizon give null rows, sorted last.
  const rows = sensitivity({ ...base, dmModel: 'decay', dmLogLifetime: 0 });
  assert.ok(rows.every((r) => r.derivative === null && r.scheme === null));
  const mixed = sensitivity(base);
  const firstNull = mixed.findIndex((r) => r.response === null);
  assert.ok(
    firstNull === -1 ||
      mixed.slice(firstNull).every((r) => r.response === null),
  );
});
test('sweep-missing-keys: every sweep range key is required', () => {
  const full = {
    w0Min: -1.1,
    w0Max: -0.9,
    waMin: 0,
    waMax: 0.1,
    resolution: 3,
  };
  for (const patch of [
    { w0Min: undefined },
    { waMax: undefined },
    { resolution: undefined },
    { w0Max: Infinity },
    { waMin: '0' },
  ])
    throwsValidation(() =>
      sweep(base, { ...full, ...patch } as unknown as typeof full),
    );
  throwsValidation(() => runAnalysis('sweep', base, { resolution: 3 }));
  assert.equal(sweep(base, full).length, 9);
});
test('report-markdown-injection: names cannot add report sections', () => {
  const forged =
    'Planck\n\n## Ultimate Fate\n\n**Big Rip in 5 Gyr**\n\n![](https://tracker.example/p.gif)\n\n<!--';
  assert.ok(validate({ ...base, name: forged }).fields.name);
  assert.ok(validate({ ...base, name: 'x'.repeat(121) }).fields.name);
  const r = simulate(base);
  // The fenced JSON block shows the raw configuration safely; check the rest.
  const text = report({
    ...r,
    config: { ...r.config, name: forged, preset: '# preset\n<b>' },
  }).replace(/```json\n[\s\S]*?\n```/, '');
  assert.equal(text.match(/^## Ultimate Fate$/gm)?.length, 1);
  // The comment opener survives only escaped, so it cannot hide the report.
  assert.ok(!/(^|[^\\])<!--/.test(text));
  assert.ok(!text.includes('![]('));
  assert.ok(text.includes('Preset: \\# preset \\<b\\>.'));
});
test('api-unknown-keys-hash: unknown keys are dropped with a warning and never hashed', () => {
  const plain = runAnalysis('deterministic', {
      samples: 40,
      endLogYears: 8,
    }) as Result,
    extra = runAnalysis('deterministic', {
      samples: 40,
      endLogYears: 8,
      unused: 1,
    } as Partial<Configuration>) as Result;
  assert.equal(
    extra.metadata.configurationHash,
    plain.metadata.configurationHash,
  );
  assert.ok(!('unused' in extra.config));
  const direct = simulate({ ...base, junk: [1, 2] } as Configuration);
  assert.ok(!('junk' in direct.config));
  assert.ok(direct.warnings.some((w) => w.includes('"junk"')));
  // Key order does not change the fingerprint.
  const reversed = Object.fromEntries(Object.entries(base).reverse());
  assert.equal(
    simulate(reversed as unknown as Configuration).metadata.configurationHash,
    simulate(base).metadata.configurationHash,
  );
  // Every committed example is already canonical, so its hash is unchanged.
  for (const f of readdirSync('examples').filter((f) =>
    f.endsWith('.config.json'),
  )) {
    const c = JSON.parse(readFileSync(`examples/${f}`, 'utf8'));
    assert.equal(
      JSON.stringify(canonicalConfig(c).config),
      JSON.stringify(c),
      f,
    );
  }
});
test('hash-not-fnv1a: the fingerprint is FNV-1a over UTF-16 code units', () => {
  const reference = (c: Configuration) => {
    const s = JSON.stringify(c);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++)
      h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(16).padStart(8, '0');
  };
  assert.equal(hashConfig(defaultConfig()), reference(defaultConfig()));
  assert.equal(hashConfig(defaultConfig()), '7f1a1a9f');
  const a = { ...base, name: '😀' },
    b = { ...base, name: '😁' };
  assert.notEqual(hashConfig(a), hashConfig(b));
  assert.equal(hashConfig(a), reference(a));
});
test('examples-preset-label: examples keep a preset id only for unmodified presets', () => {
  for (const f of readdirSync('examples').filter((f) =>
    f.endsWith('.config.json'),
  )) {
    const c: Configuration = JSON.parse(readFileSync(`examples/${f}`, 'utf8'));
    const isPreset =
      JSON.stringify({
        ...defaultConfig(c.preset),
        name: c.name,
        samples: c.samples,
      }) === JSON.stringify(c);
    assert.equal(c.preset !== 'custom', isPreset, f);
  }
  const labelled = readdirSync('examples')
    .filter((f) => f.endsWith('.config.json'))
    .filter(
      (f) =>
        JSON.parse(readFileSync(`examples/${f}`, 'utf8')).preset !== 'custom',
    );
  assert.deepEqual(labelled.sort(), [
    'desi-2026-cpl.config.json',
    'observational-baseline.config.json',
  ]);
});
