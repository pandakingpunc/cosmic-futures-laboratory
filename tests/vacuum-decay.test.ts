import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate } from '../src/science/engine';
import { defaultConfig } from '../src/science/defaults';
import { csv, report } from '../src/science/report';
import { pure } from './helpers';
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
