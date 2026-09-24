import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyFinite,
  classifyRecollapse,
  classifyTail,
} from '../src/science/classify';
import { defaultConfig } from '../src/science/defaults';
import { initialSegment } from '../src/science/model/segment';
import { drawVacuumLog, vacuumTermination } from '../src/science/vacuum';
import { simulate } from '../src/science/engine';
test('tail exponents map to their classifications', () => {
  const name = (n: number) => classifyTail(n).classification;
  assert.equal(name(0), 'Asymptotic de Sitter expansion');
  assert.equal(name(-1.5), 'Big Rip under constant phantom energy');
  assert.equal(name(1.9), 'Eternal accelerated power-law expansion');
  assert.equal(name(2), 'Long-lived decelerating expansion');
  assert.equal(name(3), 'Long-lived decelerating expansion');
  assert.equal(
    classifyTail(0, true).classification,
    'Custom / nonstandard evolution',
  );
  assert.equal(classifyTail(-1, true, true).classification, 'Big Rip');
  // Interventions change the name, never the explanation of the anchor law.
  assert.equal(classifyTail(0, true).explanation, classifyTail(0).explanation);
  assert.match(classifyTail(-1).explanation, /finite model singularity/);
  assert.match(classifyTail(3).explanation, /does not end at a finite Big Rip/);
});
test('finite intervals are classified from the final segment', () => {
  const c = defaultConfig(),
    s = initialSegment(c);
  const name = (patch: Partial<typeof s>, omegaK = 0) =>
    classifyFinite({ ...c, omegaK }, { ...s, ...patch }).classification;
  assert.equal(name({}), 'Asymptotic de Sitter expansion');
  assert.equal(
    name({ deModel: 'constant', w0: -1 }),
    'Asymptotic de Sitter expansion',
  );
  assert.equal(
    name({ deModel: 'constant', w0: -1.2 }),
    'Big Rip under constant phantom energy',
  );
  assert.equal(
    name({ deModel: 'constant', w0: -0.5 }),
    'Eternal accelerated power-law expansion',
  );
  assert.equal(
    name({ deModel: 'constant', w0: -0.2 }),
    'Long-lived decelerating expansion',
  );
  assert.equal(name({ signDE: 0 }), 'Long-lived decelerating expansion');
  assert.equal(name({ deModel: 'cpl' }), 'Undetermined with current physics');
  assert.equal(name({}, -0.01), 'Undetermined · closed-model branch');
  assert.equal(classifyRecollapse(true).classification, 'Big Crunch approach');
  assert.equal(
    classifyRecollapse(false).classification,
    'Recollapsing Universe',
  );
});
test('the vacuum clock is seeded and ends only a branch that reaches it', () => {
  const c = { ...defaultConfig(), vacuumDecay: true, vacuumLogLifetime: 11 };
  assert.equal(drawVacuumLog(defaultConfig()), Infinity);
  const t = drawVacuumLog(c);
  assert.equal(drawVacuumLog({ ...c }), t);
  assert.notEqual(drawVacuumLog({ ...c, seed: c.seed + 1 }), t);
  assert.ok(t >= 0 && Number.isFinite(t));
  const r = simulate({ ...c, endLogYears: 13 });
  const ended = vacuumTermination(c, t, r.samples, t);
  assert.ok(ended);
  assert.ok(ended.samples.every((s) => s.logYears <= t));
  assert.equal(ended.event.logYears, t);
  assert.equal(ended.fate.classification, 'Vacuum-decay termination');
  assert.equal(vacuumTermination(c, t, r.samples, t + 1), null);
  assert.equal(vacuumTermination({ ...c, endLogYears: t - 1 }, t, [], t), null);
});
