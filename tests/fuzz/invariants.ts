import { BOUNDARY_CLASSIFICATION } from '../../src/science/classify';
import { compileExpression } from '../../src/science/expression';
import { simulate, validate } from '../../src/science/engine';
import { csv, report } from '../../src/science/report';
import type { Configuration, Result } from '../../src/science/types';
import { chooser, type Chooser } from './generate';
/** Paths of numbers that are NaN or ±Infinity, outside `config`. */
function nonFinite(v: unknown, path: string, out: string[]) {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(path);
  } else if (Array.isArray(v))
    v.forEach((x, i) => nonFinite(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v))
      if (path || k !== 'config') nonFinite(x, `${path}.${k}`, out);
}
/** JSON equality in which −0 equals 0, as JSON itself cannot tell them apart. */
function sameJson(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const defined = (o: object) =>
      Object.keys(o).filter((k) => (o as never)[k] !== undefined);
    const ka = defined(a),
      kb = defined(b);
    return (
      ka.length === kb.length &&
      ka.every((k) =>
        sameJson(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
        ),
      )
    );
  }
  return a === b;
}
/**
 * Engine invariants for one configuration; returns the violated ones. A
 * thrown exception is itself a violation.
 */
export function engineViolations(c: Configuration): string[] {
  const problems: string[] = [];
  let r: Result;
  try {
    r = simulate(c, { timestamp: 'fuzz' });
  } catch (e) {
    return [`simulate threw: ${(e as Error).stack ?? String(e)}`];
  }
  const fail = (message: string) => problems.push(message);
  const invalid = validate(c).errors.length > 0;
  if ((r.status === 'invalid') !== invalid)
    fail(
      `status ${r.status} but validate reports ${invalid ? 'errors' : 'none'}`,
    );
  const bad: string[] = [];
  nonFinite(r, '', bad);
  if (bad.length) fail(`non-finite numbers at ${bad.slice(0, 3).join(', ')}`);
  const end = r.config.endLogYears;
  if (r.status === 'invalid') {
    if (r.samples.length) fail('an invalid run has samples');
  } else {
    if (!r.samples.length || !r.samples[0].isPresent)
      fail('the first sample is not the present');
    if (r.samples.filter((s) => s.isPresent).length !== 1)
      fail('not exactly one present sample');
    for (let i = 0; i < r.samples.length; i++) {
      const t = r.samples[i].logYears;
      if (!(t >= 0 && t <= end + 1e-8))
        fail(`sample ${i} at ${t} outside [0, ${end}]`);
      if (i && t < r.samples[i - 1].logYears)
        fail(`sample ${i} goes back in time`);
    }
    if (r.diagnostics.numericalUntilLogYears < 0)
      fail('negative numerical reach');
    if (r.status === 'limited' && r.classification !== BOUNDARY_CLASSIFICATION)
      fail('a limited run keeps a fate');
  }
  const ids = r.events.map((e) => e.id);
  if (new Set(ids).size !== ids.length)
    fail(`duplicate event ids ${ids.join(' ')}`);
  for (const e of r.events)
    if (!(e.logYears >= 0 && e.logYears <= end + 1e-8))
      fail(`event ${e.id} at ${e.logYears} outside [0, ${end}]`);
  try {
    const text = csv(r),
      lines = text ? text.split('\n').length : 0;
    if (lines !== (r.samples.length ? r.samples.length + 1 : 0))
      fail(`csv has ${lines} lines for ${r.samples.length} samples`);
    report(r);
  } catch (e) {
    fail(`export threw: ${(e as Error).message}`);
  }
  const { config, ...rest } = r;
  if (!sameJson(JSON.parse(JSON.stringify(rest)), rest))
    fail('the result does not survive a JSON round trip');
  if (
    r.status !== 'invalid' &&
    !sameJson(JSON.parse(JSON.stringify(config)), config)
  )
    fail('the configuration does not survive a JSON round trip');
  if (!sameJson(simulate(c, { timestamp: 'fuzz' }), r))
    fail('not deterministic');
  return problems;
}
const TOKENS = [
  'a',
  'z',
  'pi',
  'e',
  '1',
  '2',
  '0.5',
  '.25',
  '3e2',
  '1e999',
  '0',
  '+',
  '-',
  '*',
  '/',
  '^',
  '(',
  ')',
  ',',
  'sin',
  'cos',
  'exp',
  'log',
  'sqrt',
  'abs',
  'tanh',
  '__proto__',
  'constructor',
  'x',
  ';',
  '$',
];
const SEPARABLE = new Set(['+', '-', '*', '/', '^', '(', ')', ',']);
const PROBES = [1, 1.01, 0.5, 2, 10, 1e3];
/** Values at the probes, or the thrown Error; any other throw is returned as a violation string. */
function evaluate(f: (a: number) => number): (number | Error)[] {
  return PROBES.map((a) => {
    try {
      return f(a);
    } catch (e) {
      if (
        !(e instanceof Error) ||
        e instanceof TypeError ||
        e instanceof RangeError
      )
        throw e;
      return e;
    }
  });
}
/** Expression-parser invariants for one random token string. */
export function parserViolations(ch: Chooser): string[] {
  const tokens = Array.from({ length: ch.integer(1, 24) }, () =>
    ch.pick(TOKENS),
  );
  const source = tokens.join('');
  const problems: string[] = [];
  let f: (a: number) => number;
  try {
    f = compileExpression(source);
  } catch (e) {
    if (
      !(e instanceof Error) ||
      e instanceof TypeError ||
      e instanceof RangeError
    )
      problems.push(`${JSON.stringify(source)} threw ${String(e)}`);
    return problems;
  }
  try {
    const values = evaluate(f);
    for (const v of values)
      if (typeof v === 'number' && !(Number.isFinite(v) && Math.abs(v) <= 1e5))
        problems.push(`${JSON.stringify(source)} returned ${v}`);
    const same = (g: (a: number) => number, sign: number, label: string) => {
      const other = evaluate(g);
      values.forEach((v, i) => {
        const w = other[i];
        const ok =
          typeof v === 'number'
            ? typeof w === 'number' && w === sign * v + 0
            : w instanceof Error;
        if (!ok)
          problems.push(
            `${label} of ${JSON.stringify(source)} differs at a=${PROBES[i]}`,
          );
      });
    };
    if (source.length <= 236) {
      same(compileExpression(`(${source})`), 1, 'parentheses');
      same(compileExpression(`-(${source})`), -1, 'negation');
    }
    const spaced = tokens
      .map((t, i) =>
        i && (SEPARABLE.has(t) || SEPARABLE.has(tokens[i - 1])) ? ` ${t}` : t,
      )
      .join('');
    // A space would split an exponent such as 1e-2 into separate tokens.
    if (spaced.length <= 240 && !/\de[+-]/i.test(source))
      same(compileExpression(spaced), 1, 'whitespace');
  } catch (e) {
    problems.push(`${JSON.stringify(source)}: ${String(e)}`);
  }
  return problems;
}
export { chooser };
