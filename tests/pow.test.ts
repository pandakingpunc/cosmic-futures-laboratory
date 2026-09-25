import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { tanhPortable } from '../src/science/core/numeric';
import { pow10, powPortable } from '../src/science/core/pow';
import { seededRandom } from '../src/science/core/random';
// Exact powers from Python's decimal module (scripts/pow_reference.py).
const reference = JSON.parse(
  readFileSync('tests/reference/pow.json', 'utf8'),
) as {
  pow10: [x: number, expected: number][];
  pow: [a: number, b: number, expected: number][];
};
const view = new DataView(new ArrayBuffer(8)),
  SIGN = BigInt(63),
  MAGNITUDE = (BigInt(1) << SIGN) - BigInt(1);
/** Position of x on the ordered line of doubles; neighbours differ by 1. */
function ordinal(x: number): bigint {
  view.setFloat64(0, x);
  const u = view.getBigUint64(0);
  return u >> SIGN ? -(u & MAGNITUDE) : u;
}
/** Distance in ulps between two finite doubles (0 when they are equal). */
function ulps(a: number, b: number): number {
  return Math.abs(Number(ordinal(a) - ordinal(b)));
}
/** SHA-256 of the big-endian IEEE 754 bits of a list of doubles. */
function digest(values: number[]): string {
  const bytes = new DataView(new ArrayBuffer(8 * values.length));
  values.forEach((v, i) => bytes.setFloat64(8 * i, v));
  return createHash('sha256').update(bytes).digest('hex');
}
test('pow10 and powPortable round the exact reference powers correctly', () => {
  const rows = [
    ...reference.pow10.map(([x, e]) => [pow10(x), e, `pow10(${x})`] as const),
    ...reference.pow.map(
      ([a, b, e]) => [powPortable(a, b), e, `powPortable(${a}, ${b})`] as const,
    ),
  ];
  assert.ok(reference.pow10.length > 1300 && reference.pow.length > 1100);
  // Every row, subnormal and zero results included, is correctly rounded.
  for (const [got, expected, call] of rows)
    assert.ok(
      Object.is(got, expected),
      `${call} = ${got}, ${ulps(got, expected)} ulp from ${expected}`,
    );
});
test('integer powers are exact when representable', () => {
  for (let n = -323; n <= 308; n++)
    assert.equal(pow10(n), Number(`1e${n}`), `pow10(${n})`);
  for (const [a, b, expected] of [
    [3, 5, 243],
    [-2, 3, -8],
    [-2, 4, 16],
    [0.5, 3, 0.125],
    [1.5, 2, 2.25],
    [7, 18, 1628413597910449],
    [2, 1023, 8.98846567431158e307],
    [2, -1022, 2.2250738585072014e-308],
    [2, -1074, 5e-324],
    [-2, -1075, -0],
    [10, -324, 0],
    [1e308, 1, 1e308],
    [1e-308, -1, 1e308],
    [299792458, 3, 2.694400241737399e25],
    [-1, 1e300, 1],
    [-1, 3, -1],
  ])
    assert.ok(
      Object.is(powPortable(a, b), expected),
      `${a} ** ${b} = ${powPortable(a, b)}, expected ${expected}`,
    );
  // b = ½ is √a, correctly rounded.
  for (const a of [2, 3, 1e-300, 7.5e300, 5e-324])
    assert.equal(powPortable(a, 0.5), Math.sqrt(a));
  // Squares with subnormal results are the correctly rounded product a·a.
  const random = seededRandom(2);
  for (let i = 0; i < 2000; i++) {
    const a = pow10(-153.8 - 7.9 * random());
    assert.ok(Object.is(powPortable(a, 2), a * a), `${a} ** 2`);
    assert.ok(Object.is(powPortable(-a, 2), a * a), `${-a} ** 2`);
  }
});
test('powPortable follows the special cases of the ** operator', () => {
  const values = [
    NaN,
    Infinity,
    -Infinity,
    0,
    -0,
    1,
    -1,
    0.5,
    -0.5,
    2,
    -2,
    3,
    -3,
    1 / 3,
    -0.2,
    2.5,
    1e308,
    -1e308,
    5e-324,
    -5e-324,
  ];
  for (const a of values)
    for (const b of values) {
      const native = a ** b,
        got = powPortable(a, b);
      // Special cases are exact on every platform; other powers may differ
      // from the platform's pow by its own rounding error.
      if (Number.isFinite(native) && native !== 0 && !Object.is(native, got))
        assert.ok(ulps(got, native) <= 1, `${a} ** ${b}: ${got} vs ${native}`);
      else
        assert.ok(Object.is(got, native), `${a} ** ${b}: ${got} vs ${native}`);
    }
  assert.ok(Object.is(pow10(NaN), NaN));
  assert.equal(pow10(Infinity), Infinity);
  assert.ok(Object.is(pow10(-Infinity), 0));
  assert.ok(Object.is(pow10(-0), 1));
  // Overflow and underflow thresholds of 10^x (expected values from decimal).
  assert.equal(pow10(308.2547), 1.797628728208384e308);
  assert.equal(pow10(308.25472), Infinity);
  assert.equal(pow10(-323.306), 5e-324);
  assert.equal(pow10(-323.7), 0);
  assert.equal(powPortable(1.0001, 1e7), Infinity);
  assert.equal(powPortable(0.9999, 1e7), 0);
  assert.ok(Object.is(powPortable(-1.0001, -1e7 - 1), -0));
});
test('pow10 and powPortable give the committed bits on every platform', () => {
  // CI runs this on Linux and Windows; the digests were recorded on Windows.
  // The inputs use only exact operations (seededRandom, Math.round, +, −, ×,
  // ÷), so only pow.ts can change the digest.
  const random = seededRandom(20260924),
    values: number[] = [];
  for (let i = 0; i < 20000; i++) {
    values.push(pow10(-340 + 660 * random()));
    values.push(pow10(Math.round(-330 + 650 * random())));
    const y = -310 + 620 * random(),
      a = pow10(y);
    values.push(powPortable(a, (-760 + 1480 * random()) / (y * Math.LN10)));
    values.push(
      powPortable(
        (random() < 0.5 ? -1 : 1) * (0.1 + 10 * random()),
        Math.round(-60 + 120 * random()),
      ),
    );
    values.push(
      powPortable(1 - 0.999 * random(), random() < 0.5 ? 1 / 3 : -0.2),
    );
  }
  assert.equal(
    digest(values),
    '6401f2a4c0de55364a4972b3a26710cbfc2fb62c1a327afb843f0b38e1716852',
  );
});
test('tanhPortable is Math.tanh of Node.js 24 and keeps its special cases', () => {
  // Node.js 24 evaluates Math.tanh with fdlibm, whose formula tanhPortable
  // repeats; newer V8 versions use the C library instead.
  for (const x of [NaN, Infinity, -Infinity, 0, -0, 5e-324, -5e-324])
    assert.ok(Object.is(tanhPortable(x), Math.tanh(x)), `tanh(${x})`);
  assert.equal(tanhPortable(22), 1);
  assert.equal(tanhPortable(-1e300), -1);
  const random = seededRandom(3);
  for (let i = 0; i < 20000; i++) {
    // Around the branch points 2⁻²⁸, 1 and 22, and uniformly up to 25.
    const s = random() < 0.5 ? -1 : 1,
      x =
        i % 4 === 0
          ? 3.725290298461914e-9 * (0.5 + random())
          : i % 4 === 1
            ? 0.5 + random()
            : i % 4 === 2
              ? 21.5 + random()
              : 25 * random();
    assert.ok(Object.is(tanhPortable(s * x), Math.tanh(s * x)), `${s * x}`);
  }
});
test('the Math functions of the engine give the committed bits on every platform', () => {
  // V8's fdlibm ports in Node.js 24; tanhPortable relies on expm1.
  const random = seededRandom(7),
    values: number[] = [];
  for (let i = 0; i < 20000; i++) {
    const t = -745 + 1455 * random(),
      x = pow10(-300 + 600 * random()),
      s = -1 + 2 * random();
    values.push(
      Math.exp(t),
      Math.expm1(s * 40),
      Math.log(x),
      Math.log10(x),
      Math.log1p(s),
      Math.sqrt(x),
      Math.sin(t),
      Math.cos(t),
      Math.tanh(s * 20),
    );
  }
  assert.equal(
    digest(values),
    'abf1b81e7b59e24fd4e43e5bb0f103f0685617859e5afcbeb606e6843dd2bec3',
  );
});
