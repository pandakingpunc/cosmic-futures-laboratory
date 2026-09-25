/**
 * Powers that give the same bits on every platform and in every JavaScript
 * engine.
 *
 * V8 evaluates `x ** y` and Math.pow with the operating system's C library,
 * which rounds powers, integer exponents included, differently on Linux
 * (glibc) and Windows (UCRT), and engines differ in Math.exp and Math.log as
 * well. This module
 * uses only +, −, ×, ÷ and √, which IEEE 754 rounds correctly everywhere,
 * and exact operations such as Math.round. ln a and e^t are evaluated in
 * double-double arithmetic (Dekker 1971, without FMA) around a table of
 * e^(j/64) that is built at load time, so the results are nearly correctly
 * rounded (tests/pow.test.ts). Integer exponents are exact whenever the
 * power is representable. check:arch rejects `**` and Math.pow in the engine
 * and in the interface code that prepares its input.
 */
/** Veltkamp's splitting constant 2²⁷ + 1. */
const SPLITTER = 134217729;
/** ln 10 and ln 2 as HI + LO. LN2_HI has 32 fraction bits (fdlibm), so k·LN2_HI is exact for |k| < 2²¹. */
const LN10_HI = 2.302585092994046,
  LN10_LO = -2.1707562233822494e-16;
const LN2_HI = 0.6931471803691238,
  LN2_LO = 1.9082149292705877e-10;
const INV_LN2 = 1.4426950408889634;
const TWO_54 = 18014398509481984,
  TWO_M512 = 7.458340731200207e-155,
  HALF = 4.440892098500626e-16, // 2⁻⁵¹
  QUARTER = 2.220446049250313e-16; // 2⁻⁵²
/** Reinterprets a double as two 32-bit words; HIGH indexes the sign/exponent word. */
const F64 = new Float64Array(1),
  U32 = new Uint32Array(F64.buffer),
  HIGH = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0;

/**
 * Low part of the last double-double result: the exact value is hi + lo[0].
 * A typed-array slot, so that V8 does not allocate a heap number per write.
 */
const lo = new Float64Array(1);

/** a·b as hi + lo[0], exact without overflow or underflow (Dekker's product). */
function product(a: number, b: number): number {
  const p = a * b;
  let t = SPLITTER * a;
  const ah = t - (t - a),
    al = a - ah;
  t = SPLITTER * b;
  const bh = t - (t - b),
    bl = b - bh;
  lo[0] = al * bl - (p - ah * bh - al * bh - ah * bl);
  return p;
}

/** a + b as hi + lo[0] exactly, given |a| ≥ |b| or a = 0 (Dekker's fast sum). */
function quickSum(a: number, b: number): number {
  const s = a + b;
  lo[0] = b - (s - a);
  return s;
}

/** a + b as hi + lo[0] exactly, for any a and b (Knuth's two-sum). */
function twoSum(a: number, b: number): number {
  const s = a + b,
    v = s - a;
  lo[0] = a - (s - v) + (b - v);
  return s;
}

/** (ah + al)·(bh + bl) as hi + lo[0], to about 2⁻¹⁰⁴ relative. */
function multiply(ah: number, al: number, bh: number, bl: number): number {
  const p = product(ah, bh);
  return quickSum(p, lo[0] + (ah * bl + al * bh));
}

/** 2ᵏ for integers −1022 ≤ k ≤ 1023, exact. */
const POW2 = new Float64Array(2046);
POW2[1022] = 1;
for (let k = 1; k <= 1023; k++) POW2[1022 + k] = POW2[1021 + k] * 2;
for (let k = 1; k <= 1022; k++) POW2[1022 - k] = POW2[1023 - k] / 2;

/**
 * The table covers e^(j/64) for |j| ≤ J. Its arguments, ln m in logTwo and
 * h − k·ln 2 in expTwo, stay within ln 2 / 2 + 2⁻²⁰ of 0, so |j| ≤ 22.
 */
const J = 23;
/** e^(j/64) as EXP_HI + EXP_LO, from its Taylor series in double-double. */
const EXP_HI = new Float64Array(2 * J + 1),
  EXP_LO = new Float64Array(2 * J + 1);
/** RECIPROCAL ≈ e^(−j/64) as a double, with ln RECIPROCAL = −j/64 + RECIPROCAL_LN exactly to 2⁻¹⁰⁰. */
const RECIPROCAL = new Float64Array(2 * J + 1),
  RECIPROCAL_LN = new Float64Array(2 * J + 1);
for (let j = -J; j <= J; j++) {
  const x = j / 64;
  let sh = 1,
    sl = 0,
    th = 1,
    tl = 0;
  // |x|ⁿ/n! < 2⁻¹¹⁰ from n = 27 on for |x| ≤ 23/64.
  for (let n = 1; n <= 27; n++) {
    th = multiply(th, tl, x, 0);
    tl = lo[0];
    // (th + tl)/n with the division remainder exact.
    const q = th / n,
      p = product(q, n);
    th = quickSum(q, (th - p - lo[0] + tl) / n);
    tl = lo[0];
    const sum = twoSum(sh, th);
    sh = quickSum(sum, lo[0] + sl + tl);
    sl = lo[0];
  }
  EXP_HI[j + J] = sh;
  EXP_LO[j + J] = sl;
  // r·e^(j/64) = 1 + ε with |ε| < 2⁻⁵², so ln r = −j/64 + ε − ε²/2 and ε² is negligible.
  const r = 1 / sh,
    p = product(r, sh);
  RECIPROCAL[j + J] = r;
  RECIPROCAL_LN[j + J] = p - 1 + (lo[0] + r * sl);
}

/** Unbiased binary exponent of a finite a > 0; −1023 for subnormals. */
function binaryExponent(a: number): number {
  F64[0] = a;
  return (U32[HIGH] >>> 20) - 1023;
}

/**
 * aⁿ for an integer n ≥ 0 as hi + lo[0], by binary powering in double-double.
 * The caller keeps every partial power between 2⁻⁹⁰⁰ and 2⁹⁰⁰.
 */
function integerPower(a: number, n: number): number {
  let rh = 1,
    rl = 0,
    bh = a,
    bl = 0;
  for (;;) {
    if (n % 2 === 1) {
      rh = multiply(rh, rl, bh, bl);
      rl = lo[0];
    }
    n = Math.floor(n / 2);
    if (n === 0) break;
    bh = multiply(bh, bl, bh, bl);
    bl = lo[0];
  }
  lo[0] = rl;
  return rh;
}

/** aⁿ for an integer n, rounded from double-double; see integerPower. */
function integerPow(a: number, n: number): number {
  const h = integerPower(a, Math.abs(n)),
    l = lo[0];
  if (n >= 0) return h;
  // 1/(h + l) = q + q·(1 − q·(h + l)) to second order, with 1 − q·h exact.
  const q = 1 / h,
    p = product(q, h);
  return q + (1 - p - lo[0] - q * l) * q;
}

/**
 * ln a as hi + lo[0] for a finite a > 0, to about 2⁻⁶⁸ relative. With
 * a = 2ᵏ·m from the IEEE bits (m in [0.707, 1.415]) and e^(j/64) the table
 * entry nearest to m, ln a = k·ln 2 + j/64 + ln(1 + u) − ε, where
 * 1 + u = m·r is exact in double-double for r ≈ e^(−j/64) with
 * ln r = −j/64 + ε, and |u| < 0.0081. ln(1 + u) = u − u²/2 + u³/3 − … is
 * summed to u¹² (truncated below 2⁻⁸⁰|u|), the first two terms exactly.
 */
function logTwo(a: number): number {
  let k = 0;
  if (a < 2.2250738585072014e-308) {
    a *= TWO_54;
    k = -54;
  }
  F64[0] = a;
  let high = U32[HIGH];
  k += (high >>> 20) - 1023;
  high = (high & 0x000fffff) | 0x3ff00000;
  // Halve m from 1.4142141 on (high word above 0x3ff6a09e, that of √2).
  if (high > 0x3ff6a09e) {
    high -= 0x00100000;
    k++;
  }
  U32[HIGH] = high;
  const m = F64[0],
    f = m - 1,
    s = f / (2 + f);
  // 64 ln m to within 0.004, so e^(j/64) is the nearest entry or nearly so.
  const j = Math.round(128 * s * (1 + (s * s) / 3)),
    i = j + J;
  const p = product(m, RECIPROCAL[i]),
    uh = p - 1, // exact: p is within 2⁻⁶ of 1
    ul = lo[0];
  const q = product(uh, uh),
    ql = lo[0];
  let c = -1 / 12;
  c = 1 / 11 + uh * c;
  c = -1 / 10 + uh * c;
  c = 1 / 9 + uh * c;
  c = -1 / 8 + uh * c;
  c = 1 / 7 + uh * c;
  c = -1 / 6 + uh * c;
  c = 1 / 5 + uh * c;
  c = -1 / 4 + uh * c;
  c = 1 / 3 + uh * c;
  // ln(1 + u) = uh − uh²/2 + uh³·c + ul/(1 + uh), and 1 + uh = p exactly.
  const vh = quickSum(uh, -q / 2),
    vl = lo[0] - ql / 2 + q * uh * c + ul / p;
  // k·LN2_HI + j/64 is exact and, unless zero, exceeds |ln(1 + u)|.
  const h = quickSum(k * LN2_HI + j / 64, vh);
  return quickSum(h, lo[0] + vl - RECIPROCAL_LN[i] + k * LN2_LO);
}

/**
 * e^(h + l) for a double-double exponent with |l| ≪ 1, nearly correctly
 * rounded. h + l = k·ln 2 + j/64 + t with |t| ≤ 1/128 + 2⁻²⁰; e^t − 1 is
 * summed to t⁸ (truncated below 2⁻⁸¹), its first two terms exactly, and
 * the product with e^(j/64) is rounded once. Scaling by 2ᵏ is exact for
 * normal results; subnormal ones are rounded once onto their grid by adding
 * 2⁻¹⁰²² before the scaling (4 = 2⁻¹⁰²²·2¹⁰²⁴).
 */
function expTwo(h: number, l: number): number {
  if (h > 710) return Infinity;
  if (h < -746) return 0;
  const k = Math.round(h * INV_LN2),
    rh = h - k * LN2_HI, // exact: Sterbenz's lemma
    j = Math.round(rh * 64),
    i = j + J;
  // t = rh − j/64 (exact) + l − k·LN2_LO, as th + tl.
  const th = twoSum(rh - j / 64, l - k * LN2_LO),
    tl = lo[0];
  const q = product(th, th),
    ql = lo[0];
  let c = 1 / 40320;
  c = 1 / 5040 + th * c;
  c = 1 / 720 + th * c;
  c = 1 / 120 + th * c;
  c = 1 / 24 + th * c;
  c = 1 / 6 + th * c;
  // e^(th + tl) − 1 = th + th²/2 + th³·c + tl·(1 + mh) to 2⁻⁸⁰.
  const mh = quickSum(th, q / 2),
    ml = lo[0] + ql / 2 + q * th * c + tl * (1 + mh);
  // e^(j/64)·(1 + m) = sh + sl, rounded once below.
  const eh = EXP_HI[i],
    wh = product(eh, mh),
    wl = lo[0],
    sh = quickSum(eh, wh),
    sl = lo[0] + wl + eh * ml + EXP_LO[i] * (1 + mh);
  if (k > -1022) {
    const v = sh + sl;
    return k > 1023 ? v * 2 * POW2[2045] : v * POW2[k + 1022];
  }
  const f = POW2[k + 2046],
    s = sh * f,
    r = sl * f;
  if (s >= 4) return (s + r) * TWO_M512 * TWO_M512;
  // u + w rounds once onto the 2⁻⁵⁰ grid of [4, 8); an exact tie of w
  // (±2⁻⁵¹) is broken by its low part.
  const u = 4 + s,
    w = twoSum(s - (u - 4), r),
    z =
      w === HALF || w === -HALF
        ? w + (lo[0] > 0 ? QUARTER : lo[0] < 0 ? -QUARTER : 0)
        : w;
  return (u + z - 4) * TWO_M512 * TWO_M512;
}

/** 10^x, nearly correctly rounded and exact for representable integer powers. */
export function pow10(x: number): number {
  if (Number.isInteger(x) && Math.abs(x) <= 225) return integerPow(10, x);
  if (!(x < 310)) return x === x ? Infinity : NaN;
  if (x < -330) return 0;
  const h = product(x, LN10_HI);
  return expTwo(h, lo[0] + x * LN10_LO);
}

/**
 * a^b with the special cases of the ECMAScript `**` operator (so 1^±∞ and
 * (−1)^±∞ are NaN), nearly correctly rounded. a² is the correctly rounded
 * product a·a and b = ½ is √a. Integer exponents with |b|·(|e| + 1) ≤ 900,
 * e the binary exponent of a, use binary powering in double-double; they
 * include a³ and a⁴ for 10⁻⁶⁰ < a < 10⁶⁰. All other exponents, large
 * integers included, use exp(b·ln a) in double-double.
 */
export function powPortable(a: number, b: number): number {
  // a² is one correctly rounded product, with the special cases of **.
  if (b === 2) return a * a;
  // Cubes and fourth powers of the time-domain densities, with the same
  // bits as integerPow.
  if (a > 1e-60 && a < 1e60) {
    if (b === 3) {
      const p = product(a, a),
        e = lo[0],
        q = product(a, p);
      return q + (lo[0] + a * e);
    }
    if (b === 4) {
      const p = product(a, a),
        e = lo[0],
        q = product(p, p);
      return q + (lo[0] + 2 * (p * e));
    }
  }
  if (b !== b) return NaN;
  if (b === 0) return 1;
  if (a !== a) return NaN;
  const odd = Math.abs(b % 2) === 1;
  if (b === Infinity || b === -Infinity) {
    const m = Math.abs(a);
    return m === 1 ? NaN : m > 1 === b > 0 ? Infinity : 0;
  }
  if (a === 0 || a === Infinity || a === -Infinity) {
    const r = (a === 0) === b < 0 ? Infinity : 0;
    return odd && (a < 0 || Object.is(a, -0)) ? -r : r;
  }
  let negative = false;
  if (a < 0) {
    if (!Number.isInteger(b)) return NaN;
    negative = odd;
    a = -a;
  }
  let r: number;
  if (a === 1 || b === 1) r = a;
  else if (b === -1) r = 1 / a;
  else if (b === 0.5) r = Math.sqrt(a);
  else if (
    Number.isInteger(b) &&
    Math.abs(b) * (Math.abs(binaryExponent(a)) + 1) <= 900
  )
    r = integerPow(a, b);
  else {
    const lh = logTwo(a),
      ll = lo[0],
      t = b * lh;
    if (t > 750) r = Infinity;
    else if (t < -750) r = 0;
    else {
      const h = product(b, lh);
      r = expTwo(h, lo[0] + b * ll);
    }
  }
  return negative ? -r : r;
}
