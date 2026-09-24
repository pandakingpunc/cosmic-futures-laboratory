import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultConfig } from '../src/science/defaults';
import {
  background,
  createModel,
  derivative,
  wAt,
} from '../src/science/model/background';
import {
  CURVED_G_REASON,
  applyNumericalIntervention,
  initialSegment,
  type Segment,
} from '../src/science/model/segment';
import { applyTailIntervention } from '../src/science/solver/tail-intervention';
import { simulate } from '../src/science/engine';
import type { PhysicsEvent } from '../src/science/types';
const event = (
  action: PhysicsEvent['action'],
  value: number,
): PhysicsEvent => ({ id: action, logTime: 10, action, value });
test('numerical interventions return a new segment and never mutate', () => {
  const c = defaultConfig(),
    y = Object.freeze([1e-3, c.omegaR, Math.log(c.omegaDE), 0]),
    segment = Object.freeze(initialSegment(c));
  assert.deepEqual(segment, {
    g: 1,
    signDE: 1,
    deModel: c.deModel,
    w0: c.w0,
    wa: c.wa,
  });
  const w = applyNumericalIntervention(segment, y, event('change-w', -0.8), c);
  assert.ok('segment' in w);
  assert.deepEqual(w.segment, {
    ...segment,
    deModel: 'constant',
    w0: -0.8,
    wa: 0,
  });
  assert.deepEqual(w.y, y);
  assert.notEqual(w.y, y);
  const off = applyNumericalIntervention(
    segment,
    y,
    event('vacuum-scale', 0),
    c,
  );
  assert.ok('segment' in off && off.segment.signDE === 0);
  const flip = applyNumericalIntervention(
    segment,
    y,
    event('vacuum-scale', -2),
    c,
  );
  assert.ok('segment' in flip);
  assert.equal(flip.segment.signDE, -1);
  assert.equal(flip.y[2], y[2] + Math.log(2));
  const g = applyNumericalIntervention(segment, y, event('change-G', 4), c);
  assert.ok('segment' in g && g.segment.g === 4);
});
test('unsupported numerical interventions stop with their reasons', () => {
  const c = defaultConfig(),
    segment = initialSegment(c),
    y = [1e-3, c.omegaR, 0, 0];
  const stop = (e: PhysicsEvent, config = c) => {
    const r = applyNumericalIntervention(segment, y, e, config);
    assert.ok('stop' in r);
    return r.stop;
  };
  assert.deepEqual(
    stop(event('change-G', 2), {
      ...c,
      omegaK: 0.01,
      omegaDE: c.omegaDE - 0.01,
    }),
    { status: 'limited', reason: CURVED_G_REASON },
  );
  assert.equal(stop(event('change-G', 0)).status, 'terminated');
  assert.match(stop(event('dm-lifetime', 5)).reason, /already active decay/);
  assert.match(
    stop(event('dm-lifetime', 5), { ...c, dmModel: 'decay' }).reason,
    /Lifetime discontinuity/,
  );
  for (const action of ['halt', 'reverse'] as const) {
    const s = stop(event(action, 0));
    assert.equal(s.status, 'terminated');
    assert.match(s.reason, new RegExp(`^Forced ${action} reached`));
  }
});
test('the right-hand side is assembled from the background bit for bit', () => {
  const segment: Segment = {
    g: 1.5,
    signDE: 1,
    deModel: 'cpl',
    w0: -0.9,
    wa: 0.2,
  };
  for (const dmModel of [
    'stable',
    'decay',
    'annihilation',
    'interacting',
  ] as const) {
    const m = createModel({ ...defaultConfig(), dmModel, dmLogLifetime: 12 });
    for (const x of [0, 0.37, 4.2]) {
      const y = [0.8 * x, 1e-4 * (1 + x), -0.1 * x, 0.01 * x];
      const b = background(x, y, segment, m);
      assert.deepEqual(derivative(x, y, segment, m), [
        Math.exp(-b.logE),
        b.transfer * Math.exp(x),
        -3 * (1 + b.w),
        dmModel === 'annihilation'
          ? m.c.annihilation * Math.exp(-3 * x - b.logE)
          : 0,
      ]);
      assert.equal(b.w, wAt(x, segment, m));
      assert.equal(b.w, -0.9 + 0.2 * (1 - Math.exp(x)));
    }
  }
  const m = createModel(defaultConfig());
  assert.throws(
    () => background(0, [0, -1, 0, 0], initialSegment(m.c), m),
    /conservative component became negative/,
  );
  assert.throws(
    () =>
      background(0, [0, 0, 0, 0], { ...initialSegment(m.c), signDE: -1 }, m),
    /H² ≤ 0/,
  );
});
test('tail interventions keep the asymptote or stop explicitly', () => {
  // Anchor where matter is resolved, so suppressing the vacuum can matter.
  const r = simulate({ ...defaultConfig(), endLogYears: 11 });
  const anchor = r.samples.at(-1)!,
    c = r.config;
  const state = {
      n: 0,
      deN: 0,
      anchorA: anchor.logA!,
      anchorH: anchor.logH!,
      g: 1,
      anchor,
    },
    ctx = { deAlone: true, competitor: 2, c };
  const w = applyTailIntervention(event('change-w', -1.2), 30, state, ctx);
  assert.ok('n' in w);
  assert.equal(w.n, 3 * (1 + -1.2));
  const stiff = applyTailIntervention(event('change-w', 0), 30, state, ctx);
  assert.ok('status' in stiff);
  assert.match(stiff.reason, /another fluid to overtake/);
  const g = applyTailIntervention(event('change-G', 4), 30, state, ctx);
  assert.ok('g' in g);
  assert.equal(g.g, 4);
  assert.equal(g.anchorH, state.anchorH + Math.log10(4) / 2);
  const suppressed = applyTailIntervention(
    event('vacuum-scale', 1e-300),
    30,
    state,
    ctx,
  );
  assert.ok('status' in suppressed);
  assert.match(suppressed.reason, /dominance threshold/);
  const lifetime = applyTailIntervention(
    event('dm-lifetime', 5),
    30,
    state,
    ctx,
  );
  assert.ok('status' in lifetime);
  assert.match(lifetime.reason, /already active decay/);
  const off = applyTailIntervention(event('vacuum-scale', 0), 30, state, ctx);
  assert.ok('status' in off);
  assert.match(
    off.reason,
    /^Custom vacuum-scale boundary reached at 10\^30\.000/,
  );
  assert.equal(state.anchor, anchor);
});
