import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { simulate, validate } from '../src/science/engine';
import { defaultConfig } from '../src/science/defaults';
import {
  clearStored,
  decodeConfig,
  encodeConfig,
  inspectConfig,
  isResult,
  loadStored,
  parseShareHash,
  readSharedConfig,
  sanitizeConfig,
  saveBench,
  saveConfig,
  shareHash,
} from '../components/lab/persistence';
import type { Configuration, Result } from '../src/science/types';
const b64 = (value: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const small = () =>
  simulate({ ...defaultConfig(), endLogYears: 20, samples: 40 });
/** A structurally faithful copy, as read back from a file. */
const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
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
  const partial = decodeConfig(b64({ H0: 70 }));
  assert.equal(partial?.H0, 70);
  assert.equal(partial?.omegaB, defaultConfig().omegaB);
});
test('sanitizeConfig keeps only known fields of the reference type', () => {
  const reference = defaultConfig();
  for (const preset of [123, { a: 1 }, ['x'], null, true]) {
    const { config, invalid } = inspectConfig({ ...reference, preset });
    assert.equal(config.preset, reference.preset);
    assert.deepEqual(invalid, ['preset']);
  }
  const raw = JSON.parse(
    '{"H0":"70","omegaDE":0.7,"extra":1,"__proto__":{"polluted":true},"blackHoleMasses":[10,"x"],"sandbox":1}',
  ) as unknown;
  const { config, unknown, invalid } = inspectConfig(raw);
  assert.equal(config.H0, reference.H0);
  assert.equal(config.omegaDE, 0.7);
  assert.deepEqual(config.blackHoleMasses, reference.blackHoleMasses);
  assert.equal(config.sandbox, false);
  assert.deepEqual(unknown.sort(), ['__proto__', 'extra']);
  assert.deepEqual(invalid.sort(), ['H0', 'blackHoleMasses', 'sandbox']);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.getPrototypeOf(config), Object.prototype);
  // Well-typed custom events survive; malformed ones are dropped one by one.
  const events = [
    { id: 'a', logTime: 40, action: 'change-w', value: -1.1, note: 'x' },
    { id: 'b', logTime: null, action: 'halt', value: 0 },
    { id: 'c', logTime: 50, action: { x: 1 }, value: 0 },
    null,
  ];
  const withEvents = inspectConfig({ sandbox: true, events });
  assert.deepEqual(withEvents.config.events, [
    { id: 'a', logTime: 40, action: 'change-w', value: -1.1 },
  ]);
  assert.deepEqual(withEvents.invalid, ['events']);
  assert.deepEqual(inspectConfig('text').invalid, ['configuration']);
  assert.deepEqual(sanitizeConfig(undefined), reference);
  // The sanitized copy never aliases the input arrays.
  const masses = [1, 2, 3];
  assert.notEqual(
    sanitizeConfig({ blackHoleMasses: masses }).blackHoleMasses,
    masses,
  );
});
test('a crafted link with a non-string preset decodes to a renderable configuration', () => {
  const link = parseShareHash(
    `#c=${b64({ ...defaultConfig(), preset: { a: 1 }, H0: 70 })}`,
  );
  assert.equal(link.kind, 'ok');
  if (link.kind !== 'ok') return;
  assert.equal(typeof link.config.preset, 'string');
  assert.equal(link.config.H0, 70);
  assert.deepEqual(link.invalid, ['preset']);
  assert.deepEqual(validate(link.config).errors, []);
});
test('share links distinguish absent, unreadable and readable parameters', () => {
  const hash = shareHash({ ...defaultConfig(), name: 'Shared ✓', w0: -1.2 });
  assert.equal(parseShareHash('').kind, 'none');
  assert.equal(parseShareHash('#other=1').kind, 'none');
  assert.equal(parseShareHash('#c=').kind, 'invalid');
  assert.equal(parseShareHash('#c=@@@@').kind, 'invalid');
  assert.equal(parseShareHash(`#c=${b64([1, 2])}`).kind, 'invalid');
  assert.equal(parseShareHash(`#x=1&c=${b64({ H0: 70 })}`).kind, 'ok');
  assert.equal(parseShareHash(hash).kind, 'ok');
  // Every truncation, as done by chat clients and mail wrapping, is reported.
  for (let n = '#c='.length; n < hash.length; n++)
    assert.equal(parseShareHash(hash.slice(0, n)).kind, 'invalid', `${n}`);
});
test('result files are recognized structurally', () => {
  const r = roundTrip(small());
  assert.ok(isResult(r));
  assert.ok(!isResult(defaultConfig()));
  assert.ok(!isResult(null));
  assert.ok(!isResult([]));
  assert.ok(!isResult({ samples: [], events: [] }));
  const broken: [string, (x: Record<string, unknown>) => void][] = [
    ['a null sample', (x) => ((x.samples as unknown[])[3] = null)],
    [
      'a sample without logYears',
      (x) => delete (x.samples as Record<string, unknown>[])[0].logYears,
    ],
    [
      'a string plotted value',
      (x) => ((x.samples as Record<string, unknown>[])[0].logH = '1'),
    ],
    ['missing diagnostics', (x) => delete x.diagnostics],
    ['missing warnings', (x) => delete x.warnings],
    [
      'missing equations',
      (x) => delete (x.metadata as Record<string, unknown>).equations,
    ],
    [
      'an event without a title',
      (x) => ((x.events as Record<string, unknown>[])[0].title = 7),
    ],
    [
      'an object preset',
      (x) => ((x.config as Record<string, unknown>).preset = { a: 1 }),
    ],
    ['an unknown status', (x) => (x.status = 'done')],
  ];
  assert.ok(r.events.length > 0);
  for (const [label, damage] of broken) {
    const copy = roundTrip(r) as unknown as Record<string, unknown>;
    damage(copy);
    assert.ok(!isResult(copy), label);
  }
  // The minimal shape accepted by version 0.2.0 is now rejected.
  assert.ok(
    !isResult({
      config: defaultConfig(),
      samples: [],
      events: [],
      classification: 'x',
      metadata: { configurationHash: 'x' },
    }),
  );
  // Unknown extra fields from newer versions do not prevent an import.
  assert.ok(isResult({ ...r, derived: { x: 1 } }));
});
test('every archived example result passes the import check', () => {
  const files = readdirSync('examples').filter((f) =>
    f.endsWith('.result.json'),
  );
  assert.ok(files.length >= 10);
  for (const f of files)
    assert.ok(isResult(JSON.parse(readFileSync(`examples/${f}`, 'utf8'))), f);
});
/** Minimal Storage with an optional byte quota, installed on globalThis. */
function withStorage(quota = Infinity) {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      let used = v.length;
      for (const [key, value] of data) if (key !== k) used += value.length;
      if (used > quota) throw new Error('QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
  return data;
}
function withoutStorage() {
  Reflect.deleteProperty(globalThis, 'localStorage');
}
test('configuration and bench persist separately and migrate the 0.2.0 record', (t) => {
  t.after(withoutStorage);
  const data = withStorage();
  const r = roundTrip(small()),
    draft = { ...defaultConfig(), H0: 70 };
  data.set(
    'cosmic-futures-laboratory:v1',
    JSON.stringify({ config: draft, comparisons: [r, { samples: [null] }] }),
  );
  let stored = loadStored();
  assert.deepEqual(stored.config, draft);
  assert.equal(stored.lastRunHash, undefined);
  assert.equal(stored.comparisons?.length, 1);
  assert.equal(stored.droppedComparisons, 1);
  assert.ok(saveBench(stored.comparisons ?? []));
  // The old record keeps only its configuration until that is migrated too.
  assert.deepEqual(JSON.parse(data.get('cosmic-futures-laboratory:v1') ?? ''), {
    config: draft,
  });
  assert.deepEqual(loadStored().config, draft);
  assert.ok(saveConfig({ ...draft, H0: 71 }, '#c=abc'));
  assert.ok(!data.has('cosmic-futures-laboratory:v1'));
  stored = loadStored();
  assert.equal(stored.config?.H0, 71);
  assert.equal(stored.lastRunHash, '#c=abc');
  assert.equal(stored.comparisons?.length, 1);
  // A draft saved while a field was empty (NaN is stored as null) is reported.
  data.set(
    'cosmic-futures-laboratory:v2:config',
    JSON.stringify({ config: { ...draft, H0: NaN, preset: 5 } }),
  );
  stored = loadStored();
  assert.equal(stored.config?.H0, defaultConfig().H0);
  assert.deepEqual(stored.configIssues, ['preset', 'H0']);
  clearStored();
  assert.equal(loadStored().config, undefined);
  assert.equal(loadStored().comparisons?.length, 1);
  clearStored({ bench: true });
  assert.deepEqual(loadStored(), {});
});
test('storage failures are reported instead of silently ignored', (t) => {
  t.after(withoutStorage);
  withoutStorage();
  assert.equal(saveConfig(defaultConfig(), ''), false);
  assert.equal(saveBench([]), false);
  assert.deepEqual(loadStored(), {});
  const r = roundTrip(small()) as Result;
  const size = JSON.stringify([r, r]).length;
  withStorage(size + 10);
  assert.ok(saveBench([r, r]));
  assert.equal(saveBench([r, r, r]), false);
  // The last bench that fit stays readable.
  assert.equal(loadStored().comparisons?.length, 2);
  // A legacy record holding the space is released for the new bench.
  const legacy = JSON.stringify({ comparisons: [r] });
  const data = withStorage(legacy.length + 20);
  data.set('cosmic-futures-laboratory:v1', legacy);
  assert.ok(saveBench([r]));
  assert.ok(!data.has('cosmic-futures-laboratory:v1'));
});
