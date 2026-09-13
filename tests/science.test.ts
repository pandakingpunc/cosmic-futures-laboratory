import assert from 'node:assert/strict';
import { simulate, H0_YEAR, validate } from '../src/science/engine';
import { defaultConfig } from '../src/science/defaults';
import { compileExpression } from '../src/science/expression';
import {
  blackHoleFraction,
  blackHoleLifetime,
  survival,
} from '../src/science/astrophysics';
import {
  ensemble,
  cholesky,
  interpolate,
  sensitivity,
  sweep,
} from '../src/science/analysis';
import { csv, report } from '../src/science/report';
import { cosmicEvents } from '../src/science/astrophysics';
import { runAnalysis, isAnalysisMode } from '../src/science/dispatch';
import { POST } from '../app/api/simulate/route';
import {
  encodeConfig,
  decodeConfig,
  readSharedConfig,
  shareHash,
  isResult,
} from '../components/lab/persistence';
import type { Configuration } from '../src/science/types';
let failures = 0,
  count = 0;
const runs: Promise<void>[] = [];
// Synchronous tests run in place; asynchronous tests are awaited before the
// summary so their assertions count.
function test(name: string, fn: () => void | Promise<void>) {
  count++;
  runs.push(
    (async () => {
      try {
        await fn();
        console.log(`PASS ${name}`);
      } catch (e) {
        failures++;
        console.error(`FAIL ${name}`, e);
      }
    })(),
  );
}
function near(a: number, b: number, tol = 1e-5) {
  assert.ok(
    Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)),
    `${a} != ${b} within ${tol}`,
  );
}
const pure = (patch: Partial<Configuration>) => ({
  ...defaultConfig(),
  omegaB: 0,
  omegaDM: 0,
  omegaNu: 0,
  omegaR: 0,
  omegaDE: 0,
  omegaK: 0,
  samples: 60,
  endLogYears: 11,
  ...patch,
});
for (const [name, c, p] of [
  ['matter', pure({ omegaB: 1 }), 1.5],
  ['radiation', pure({ omegaR: 1 }), 2],
  ['curvature', pure({ omegaK: 1 }), 1],
] as const) {
  test(`${name}: numerical scale factor, Hubble rate and density`, () => {
    const r = simulate(c);
    assert.equal(r.status, 'complete', r.diagnostics.reason);
    for (const s of r.samples.slice(1)) {
      const tau = c.H0 * H0_YEAR * 10 ** s.logYears;
      near(s.logA!, Math.log10(1 + p * tau) / p, 2e-6);
      near(s.logH!, Math.log10(c.H0 / (1 + p * tau)), 2e-6);
    }
  });
}
test('de Sitter: a=exp(H0 t) and constant H', () => {
  const c = pure({ omegaDE: 1 }),
    r = simulate(c);
  for (const s of r.samples.slice(1)) {
    near(s.logA!, (c.H0 * H0_YEAR * 10 ** s.logYears) / Math.LN10, 2e-6);
    near(s.logH!, Math.log10(c.H0), 1e-10);
  }
});
test('flat matter + Lambda: exact sinh solution', () => {
  const c = pure({ omegaB: 0.3, omegaDE: 0.7 }),
    r = simulate(c);
  for (const s of r.samples.slice(1)) {
    const tau = c.H0 * H0_YEAR * 10 ** s.logYears,
      exact =
        Math.log10(
          (0.3 / 0.7) *
            Math.sinh(
              Math.asinh(Math.sqrt(0.7 / 0.3)) + 1.5 * Math.sqrt(0.7) * tau,
            ) **
              2,
        ) / 3;
    near(s.logA!, exact, 2e-6);
  }
});
test('pure phantom: finite rip boundary and no post-rip samples', () => {
  const c = pure({
      omegaDE: 1,
      deModel: 'constant',
      w0: -1.5,
      endLogYears: 100,
    }),
    r = simulate(c);
  assert.equal(r.classification, 'Big Rip');
  const rip = r.events.find((e) => e.id === 'rip');
  assert.ok(rip);
  near(rip.logYears, Math.log10(4 / (3 * c.H0 * H0_YEAR)), 1e-7);
  assert.ok(r.samples.every((s) => s.logYears <= rip.logYears));
});
test('closed dust: resolves turnaround and contracting branch', () => {
  const c = pure({ omegaB: 2, omegaK: -1, endLogYears: 12 }),
    r = simulate(c);
  assert.ok(
    r.samples.some((s) => s.regime === 'contraction'),
    r.diagnostics.reason,
  );
  near(Math.max(...r.samples.map((s) => 10 ** s.logA!)), 2, 0.003);
  const turn = r.events.find((e) => e.id === 'turn');
  assert.ok(turn);
  near(10 ** turn.logYears * c.H0 * H0_YEAR, Math.PI / 2 + 1, 0.02);
  assert.ok(r.diagnostics.maxConstraintResidual < 1e-5);
});
test('negative Lambda: turn and crunch approach', () => {
  const c = pure({ omegaB: 1.1, omegaDE: -0.1, endLogYears: 12 }),
    r = simulate(c);
  assert.ok(r.samples.some((s) => s.regime === 'contraction'));
  near(Math.max(...r.samples.map((s) => 10 ** s.logA!)), 11 ** (1 / 3), 0.003);
});
test('closed positive Lambda is not automatically classified as eternal', () => {
  const r = simulate(
    pure({ omegaB: 2, omegaDE: 0.01, omegaK: -1.01, endLogYears: 6 }),
  );
  assert.ok(!r.classification.includes('de Sitter'));
});
test('extreme de Sitter: nested logs remain finite at 10^1000 yr', () => {
  const r = simulate({ ...defaultConfig(), endLogYears: 1000, samples: 60 });
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  near(r.samples.at(-1)!.logYears, 1000);
  assert.equal(r.samples.at(-1)!.logA, null);
  assert.ok(Number.isFinite(r.samples.at(-1)!.expansionIndex));
  assert.ok(!JSON.stringify(r).includes('NaN'));
});
test('matter-only extreme asymptote gives a~t^(2/3)', () => {
  const r = simulate(pure({ omegaB: 1, endLogYears: 1000 }));
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  const s = r.samples.at(-1)!;
  near(
    s.logA!,
    (2 / 3) * (1000 + Math.log10(1.5 * r.config.H0 * H0_YEAR)),
    1e-7,
  );
});
test('decaying dark matter has conserved paired transfer and positive radiation', () => {
  const c = pure({
      omegaDM: 0.3,
      omegaDE: 0.7,
      dmModel: 'decay',
      dmLogLifetime: 10,
      endLogYears: 11,
    }),
    r = simulate(c);
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  for (const s of r.samples.slice(1)) {
    const tau = 10 ** (s.logYears - c.dmLogLifetime),
      expected = Math.log10(c.omegaDM) - 3 * s.logA! - tau / Math.LN10;
    near(s.logRhoDM!, expected, 3e-6);
    assert.ok(s.logRhoR !== null);
  }
});
test('zero daughter radiation is supported initially', () => {
  const r = simulate(
    pure({ omegaDM: 0.3, omegaDE: 0.7, dmModel: 'decay', dmLogLifetime: 12 }),
  );
  assert.notEqual(r.status, 'invalid');
  assert.ok(r.samples.at(-1)!.logRhoR !== null);
});
test('safe expressions support precedence and reject code', () => {
  near(compileExpression('-2^2 + a/2')(2), -3);
  near(compileExpression('-1 + 0.1*sin(log(a))')(1), -1);
  assert.throws(() => compileExpression('globalThis.process.exit()'));
  assert.throws(() => compileExpression('a; alert(1)'));
  assert.throws(() => compileExpression('sqrt(-1)')(1));
});
test('validation rejects invalid closure and negative matter', () => {
  assert.ok(validate({ ...defaultConfig(), omegaDM: -1 }).errors.length);
  assert.equal(simulate({ ...defaultConfig(), omegaDE: 0 }).status, 'invalid');
});
test('Hawking mass cubed scaling, half-mass time, stable remnants', () => {
  near(
    10 **
      (blackHoleLifetime(Math.log10(20)) - blackHoleLifetime(Math.log10(10))),
    8,
    1e-10,
  );
  const c = defaultConfig(),
    t = blackHoleLifetime(1) + Math.log10(7 / 8);
  near(blackHoleFraction(t, 10, c), 0.5, 1e-10);
  assert.ok(blackHoleFraction(100, 10, { ...c, evaporation: 'remnant' }) > 0);
  near(blackHoleFraction(100, 10, { ...c, evaporation: 'disabled' }), 1);
});
test('particle mean lifetime leaves exp(-1)', () => {
  near(survival(36, 36), Math.exp(-1), 1e-12);
});
test('recollapse solver resolves a short requested endpoint', () => {
  const r = simulate(pure({ omegaB: 2, omegaK: -1, endLogYears: 6 }));
  near(r.samples.at(-1)!.logYears, 6, 1e-9);
  assert.ok(r.samples.length > 1);
});
test('custom tail w switch matches density continuously and updates w', () => {
  const r = simulate({
    ...defaultConfig(),
    sandbox: true,
    events: [{ id: 'w', logTime: 13, action: 'change-w', value: -0.8 }],
    endLogYears: 14,
  });
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  const s = r.samples.at(-1)!;
  near(s.w!, -0.8, 1e-10);
  const at = r.samples.find((s) => s.logYears === 13)!;
  const delta = s.logA! - at.logA!;
  near(s.logRhoDE!, at.logRhoDE! - 0.6 * delta, 1e-7);
});
test('bounded model has conditional accelerated asymptote', () => {
  const r = simulate({
    ...defaultConfig(),
    deModel: 'bounded',
    w0: -0.9,
    wa: 0,
  });
  assert.equal(r.classification, 'Eternal accelerated power-law expansion');
});
test('nonstandard vacuum sign flip returns last valid state', () => {
  const r = simulate({
    ...defaultConfig(),
    sandbox: true,
    events: [
      { id: 'negative', logTime: 10, action: 'vacuum-scale', value: -10 },
    ],
  });
  assert.ok(r.status === 'terminated' || r.status === 'limited');
  assert.ok(r.samples.length > 0);
});
test('seeded ensembles are reproducible and disclose sampling', () => {
  const c = { ...defaultConfig(), endLogYears: 11, samples: 40 },
    o = {
      runs: 4,
      seed: 123,
      distribution: 'gaussian' as const,
      sigmas: [0.54, 0.0073, 0.03, 0.05],
      interval: 0.95,
    };
  assert.deepEqual(ensemble(c, o), ensemble(c, o));
  assert.throws(() =>
    cholesky([
      [1, 2, 0, 0],
      [2, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ]),
  );
});
test('seeded vacuum clock and serialization are reproducible', () => {
  const c = {
      ...defaultConfig(),
      vacuumDecay: true,
      vacuumLogLifetime: 11,
      endLogYears: 12,
    },
    a = simulate(c),
    b = simulate(c);
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.samples, b.samples);
  const round = JSON.parse(JSON.stringify(a));
  assert.deepEqual(round.config, c);
  assert.ok(csv(a).startsWith('logYears,'));
  assert.ok(report(a).includes('## Limitations'));
});
test('custom events remain disabled by default and are not ignored', () => {
  const c = {
    ...defaultConfig(),
    events: [{ id: 'a', logTime: 40, action: 'halt' as const, value: 0 }],
  };
  assert.equal(simulate(c).status, 'invalid');
  const r = simulate({ ...c, sandbox: true });
  assert.equal(r.status, 'limited');
  assert.ok(r.events.some((e) => e.id === 'a'));
});
test('simultaneous tail events compose without losing previous changes', () => {
  const c = {
      ...defaultConfig(),
      sandbox: true,
      endLogYears: 14,
      events: [
        { id: 'g', logTime: 13, action: 'change-G' as const, value: 4 },
        { id: 'v', logTime: 13, action: 'vacuum-scale' as const, value: 9 },
      ],
    },
    r = simulate(c);
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  const at = r.samples.find((s) => s.logYears === 13)!,
    last = r.samples.at(-1)!;
  near(last.logH! - at.logH!, Math.log10(6), 1e-9);
  near(last.logRhoDE! - at.logRhoDE!, Math.log10(9), 1e-9);
});
test('a vacuum suppression that removes dominance stops explicitly', () => {
  const r = simulate({
    ...defaultConfig(),
    sandbox: true,
    endLogYears: 14,
    events: [{ id: 'v', logTime: 12.1, action: 'vacuum-scale', value: 1e-200 }],
  });
  assert.equal(r.status, 'limited');
  assert.ok(r.diagnostics.reason.includes('dominance'));
  assert.ok(r.samples.at(-1)!.logYears <= 12.1);
});
test('a stiff tail intervention cannot pretend dark energy stays dominant', () => {
  const r = simulate({
    ...defaultConfig(),
    sandbox: true,
    endLogYears: 1000,
    events: [{ id: 'w', logTime: 13, action: 'change-w', value: 1 }],
  });
  assert.equal(r.status, 'limited');
  assert.ok(r.diagnostics.reason.includes('overtake'));
});
test('decay tail matches elapsed donor survival across the numerical boundary', () => {
  const c = {
      ...defaultConfig(),
      dmModel: 'decay' as const,
      dmLogLifetime: 12,
      endLogYears: 13,
    },
    r = simulate(c);
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  for (const s of r.samples.filter((s) => s.regime === 'asymptotic'))
    near(
      s.logRhoDM!,
      Math.log10(c.omegaDM) - 3 * s.logA! - 10 ** (s.logYears - 12) / Math.LN10,
      1e-7,
    );
});
test('malformed imported arrays and booleans return explicit validation errors', () => {
  const c = {
    ...defaultConfig(),
    events: null,
    blackHoleMasses: null,
    protonDecay: 'true',
  } as unknown as Configuration;
  assert.equal(simulate(c).status, 'invalid');
});
test('constant w=-1 has the same classification as Lambda', () => {
  assert.equal(
    simulate(pure({ omegaDE: 1, deModel: 'constant', w0: -1, endLogYears: 10 }))
      .classification,
    'Asymptotic de Sitter expansion',
  );
});
test('unsupported tiny H0 and nonflat G interventions are explicit boundaries', () => {
  assert.equal(simulate({ ...defaultConfig(), H0: 1e-320 }).status, 'invalid');
  const r = simulate(
    pure({
      omegaK: 1,
      sandbox: true,
      events: [{ id: 'g', logTime: 6, action: 'change-G', value: 4 }],
    }),
  );
  assert.equal(r.status, 'limited');
  assert.ok(r.diagnostics.reason.includes('curved'));
});
test('custom events after the requested endpoint are never executed', () => {
  const r = simulate(
    pure({
      omegaDE: 1,
      endLogYears: 6,
      sandbox: true,
      events: [{ id: 'halt', logTime: 8, action: 'halt', value: 0 }],
    }),
  );
  assert.equal(r.status, 'complete');
  assert.ok(!r.events.some((e) => e.id === 'halt'));
  near(r.samples.at(-1)!.logYears, 6);
});
test('a later vacuum decay cannot overwrite an earlier Big Rip', () => {
  const r = simulate(
    pure({
      omegaDE: 1,
      deModel: 'constant',
      w0: -1.5,
      endLogYears: 100,
      vacuumDecay: true,
      vacuumLogLifetime: 10.34344224175,
    }),
  );
  assert.equal(r.classification, 'Big Rip');
  assert.ok(r.events.some((e) => e.id === 'rip'));
  assert.ok(!r.events.some((e) => e.id === 'vacuum'));
});
test('closed-model interpolation uses reconstructed log-time samples', () => {
  const c = pure({ omegaB: 2, omegaK: -1, endLogYears: 6, samples: 61 });
  const r = simulate(c),
    direct = simulate({ ...c, endLogYears: 3 });
  assert.ok(r.samples.length >= 61);
  const actual = interpolate(r, 3)!;
  const expected = direct.samples.at(-1)!.expansionIndex;
  assert.ok(Math.abs(actual - expected) < 1e-10);
  assert.equal(interpolate(r, -1), null);
});
test('simultaneous numerical interventions share one time boundary', () => {
  const c = pure({ omegaDE: 1, endLogYears: 11 }),
    a = simulate(c),
    b = simulate({
      ...c,
      sandbox: true,
      events: [
        { id: 'g', logTime: 10, action: 'change-G', value: 4 },
        { id: 'v', logTime: 10, action: 'vacuum-scale', value: 0.25 },
      ],
    });
  assert.equal(b.status, 'complete', b.diagnostics.reason);
  near(b.samples.at(-1)!.logA!, a.samples.at(-1)!.logA!, 1e-7);
});
test('output samples hit their target elapsed times to machine precision', () => {
  const c = { ...defaultConfig(), endLogYears: 12, samples: 50 },
    r = simulate(c);
  assert.equal(r.status, 'complete', r.diagnostics.reason);
  const numerical = r.samples.filter(
    (s) => !s.isPresent && s.regime === 'numerical',
  );
  assert.ok(numerical.length >= 49);
  for (let i = 1; i < numerical.length; i++)
    assert.ok(numerical[i].logA! > numerical[i - 1].logA!);
  // Rerunning to a sample's own time reproduces its state.
  const probe = numerical[Math.floor(numerical.length / 2)];
  const direct = simulate({ ...c, endLogYears: probe.logYears, samples: 40 });
  near(direct.samples.at(-1)!.logA!, probe.logA!, 1e-12);
});
test('duplicate black-hole masses are rejected with a field message', () => {
  const v = validate({ ...defaultConfig(), blackHoleMasses: [10, 10] });
  assert.ok(v.errors.some((e) => e.includes('distinct')));
  assert.ok(v.fields.blackHoleMasses);
  assert.equal(validate(defaultConfig()).errors.length, 0);
});
test('validation maps errors to configuration fields', () => {
  const v = validate({
    ...defaultConfig(),
    H0: -1,
    rtol: 1,
    atol: 1,
    omegaDE: 0.5,
    warmW: 2,
  });
  for (const f of ['H0', 'rtol', 'atol', 'closure', 'warmW'] as const)
    assert.ok(v.fields[f], `missing field message for ${f}`);
  assert.equal(new Set(v.errors).size, v.errors.length);
  assert.equal(validate(defaultConfig()).fields.H0, undefined);
});
test('a vacuum draw before one elapsed year never yields negative times', () => {
  for (let seed = 1; seed < 40; seed++) {
    const r = simulate({
      ...defaultConfig(),
      vacuumDecay: true,
      vacuumLogLifetime: 0,
      endLogYears: 6,
      samples: 40,
      seed,
    });
    assert.ok(
      r.samples.every((s) => s.logYears >= 0),
      `seed ${seed}`,
    );
    assert.ok(r.events.every((e) => e.logYears >= 0));
    assert.ok(!JSON.stringify(r).includes('NaN'));
  }
});
test('future matter–dark-energy equality is detected with unique event ids', () => {
  // The reference universe is already dark-energy dominated, so its equality
  // lies in the past; a matter-dominated start crosses in the future.
  const c = pure({ omegaB: 0.7, omegaDE: 0.3, endLogYears: 11 }),
    r = simulate(c);
  const equality = r.events.filter((e) => e.id.startsWith('equality'));
  assert.equal(equality.length, 1);
  assert.equal(equality[0].id, 'equality');
  const at = r.samples.find((s) => s.logYears === equality[0].logYears)!;
  assert.ok(Math.abs(at.omegaM! - at.omegaDE!) < 0.06);
  assert.equal(r.events.filter((e) => e.id === 'equality').length, 1);
  // A later w switch lets matter overtake again: ids stay unique.
  const two = simulate({
    ...c,
    endLogYears: 12,
    sandbox: true,
    events: [{ id: 'w', logTime: 10.5, action: 'change-w', value: 1 }],
  });
  const ids = cosmicEvents(two.config, two.samples, 12).map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.filter((id) => id.startsWith('equality')).length >= 1);
});
test('sensitivity returns four ranked finite-difference rows', () => {
  const rows = sensitivity({ ...defaultConfig(), endLogYears: 11 });
  assert.equal(rows.length, 4);
  assert.deepEqual([...rows].map((r) => r.parameter).sort(), [
    'H0',
    'omegaM',
    'w0',
    'wa',
  ]);
  for (let i = 1; i < rows.length; i++)
    assert.ok((rows[i - 1].response ?? 0) >= (rows[i].response ?? 0));
  assert.ok(rows.find((r) => r.parameter === 'H0')!.derivative! > 0);
  assert.equal(rows.find((r) => r.parameter === 'wa')!.derivative, 0);
});
test('sweep grid covers phantom and quintessence outcomes', () => {
  const rows = sweep(
    { ...defaultConfig(), endLogYears: 20 },
    { w0Min: -1.2, w0Max: -0.8, waMin: 0, waMax: 0.1, resolution: 3 },
  );
  assert.equal(rows.length, 9);
  assert.ok(rows.some((r) => r.outcome.includes('Rip')));
  assert.ok(rows.some((r) => r.outcome.includes('accelerated')));
  assert.throws(() =>
    sweep(defaultConfig(), {
      w0Min: 0,
      w0Max: -1,
      waMin: 0,
      waMax: 1,
      resolution: 3,
    }),
  );
  assert.throws(() =>
    sweep(defaultConfig(), undefined as unknown as Parameters<typeof sweep>[1]),
  );
  assert.throws(() =>
    ensemble(
      defaultConfig(),
      undefined as unknown as Parameters<typeof ensemble>[1],
    ),
  );
});
test('the analysis dispatcher and HTTP route agree and validate modes', async () => {
  assert.ok(isAnalysisMode('sweep') && !isAnalysisMode('unknown'));
  const c = { samples: 40, endLogYears: 8 };
  const direct = runAnalysis('deterministic', c) as ReturnType<typeof simulate>;
  const post = (body: unknown) =>
    POST(
      new Request('http://laboratory.test/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
  const ok = await post({ config: c });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  const viaHttp = (await ok.json()) as ReturnType<typeof simulate>;
  assert.equal(
    viaHttp.metadata.configurationHash,
    direct.metadata.configurationHash,
  );
  assert.deepEqual(
    viaHttp.samples.map((s) => s.expansionIndex),
    direct.samples.map((s) => s.expansionIndex),
  );
  assert.equal((await post({ config: [] })).status, 400);
  assert.equal((await post({ config: c, mode: 'unknown' })).status, 400);
  assert.equal((await post('{')).status, 400);
  const missing = await post({ config: c, mode: 'ensemble' });
  assert.equal(missing.status, 400);
  assert.match(((await missing.json()) as { error: string }).error, /options/);
  const sweepResponse = await post({
    config: c,
    mode: 'sweep',
    options: { w0Min: -1.1, w0Max: -0.9, waMin: 0, waMax: 0.1, resolution: 3 },
  });
  assert.equal(sweepResponse.status, 200);
  assert.equal(((await sweepResponse.json()) as unknown[]).length, 9);
});
test('shareable links round-trip configurations including non-ASCII names', () => {
  const c = { ...defaultConfig(), name: 'Λ · deneme ✓', w0: -1.05 };
  const encoded = encodeConfig(c);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeConfig(encoded), c);
  assert.deepEqual(readSharedConfig(shareHash(c)), c);
  assert.equal(readSharedConfig('#other=1'), null);
  assert.equal(decodeConfig('not base64 @@'), null);
  assert.equal(
    decodeConfig(encodeConfig([] as unknown as Configuration)),
    null,
  );
  const partial = decodeConfig(
    btoa(JSON.stringify({ H0: 70 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, ''),
  );
  assert.equal(partial?.H0, 70);
  assert.equal(partial?.omegaB, defaultConfig().omegaB);
});
test('result files are recognized for the comparison bench', () => {
  const r = simulate({ ...defaultConfig(), endLogYears: 6, samples: 40 });
  assert.ok(isResult(JSON.parse(JSON.stringify(r))));
  assert.ok(!isResult(defaultConfig()));
  assert.ok(!isResult(null));
  assert.ok(!isResult({ samples: [], events: [] }));
});
await Promise.all(runs);
console.log(`${count - failures}/${count} scientific checks passed.`);
if (failures) process.exitCode = 1;
