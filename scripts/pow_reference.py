"""Exact reference powers for src/science/core/pow.ts.

Writes tests/reference/pow.json: inputs of pow10(x) and powPortable(a, b)
with the double nearest to the exact power. Python's decimal module computes
ln, exp and integer powers correctly rounded to 60 significant digits, and
float() rounds that decimal to the nearest double, subnormals included, so
each expected value is the correctly rounded power unless the exact power
lies within 1e-43 relative of a rounding boundary. The random inputs are
formed with the platform's pow and log, so regenerating on another C library
may change an input by 1 ulp; the expected values, and --check, do not
depend on the platform.

Usage: python scripts/pow_reference.py [--check]
With --check the expected values of the stored inputs are recomputed and
compared with the file, and nothing is written. Only the standard library
is needed.
"""
from decimal import Decimal, getcontext
from pathlib import Path
import argparse
import json
import math
import random
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tests" / "reference" / "pow.json"
getcontext().prec = 60
MAX = sys.float_info.max

parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
parser.add_argument("--check", action="store_true", help=f"compare with {OUT.relative_to(ROOT).as_posix()} instead of writing it")
args = parser.parse_args()


def exact_pow(a, b):
    """The double nearest to a**b for finite a, b; results below 2^-1075 round to ±0."""
    if a == 0 or b == 0:
        raise ValueError((a, b))
    if float(b).is_integer():
        value = Decimal(a) ** int(b)
    elif a < 0:
        raise ValueError((a, b))
    else:
        value = (Decimal(b) * Decimal(a).ln()).exp()
    return float(value)


def exact_pow10(x):
    if float(x).is_integer():
        return float(Decimal(10) ** int(x))
    return float((Decimal(x) * Decimal(10).ln()).exp())


def generate():
    rng = random.Random(20260924)
    u = lambda lo, hi: lo + (hi - lo) * rng.random()
    xs = []
    xs += [u(-323.6, 308.25) for _ in range(300)]
    xs += [u(-1, 1) for _ in range(100)]
    xs += [s * 10.0 ** -k for k in range(1, 31) for s in (1, -1)]
    xs += [n + s * 2.0 ** -j for n, s, j in ((rng.randint(-5, 5), rng.choice((1, -1)), rng.randint(1, 50)) for _ in range(40))]
    xs += [u(-323.6, -307.66) for _ in range(40)]
    # Normal results below 2^-969, whose last bits are finer than 2^-1074·2^52.
    xs += [u(-307.66, -291.7) for _ in range(30)]
    xs += [u(308.2, 308.2547) for _ in range(20)]
    # Every integer power of ten from the smallest subnormal to the largest double.
    xs += [float(n) for n in range(-323, 309)]
    pairs = []
    # b·ln a spread over the whole range of doubles.
    for _ in range(300):
        a = 10 ** u(-300, 300)
        pairs.append((a, u(-740, 705) / math.log(a)))
    pairs += [(u(0.5, 2), u(-60, 60)) for _ in range(150)]
    # a near 1 with large b: stresses the accuracy of ln a.
    for _ in range(150):
        a = 1 + rng.choice((1, -1)) * 10 ** -u(1, 15)
        pairs.append((a, u(-700, 700) / math.log(a)))
    for _ in range(100):
        pairs.append((rng.choice((1, -1)) * u(0.1, 10), float(rng.choice([n for n in range(-40, 41) if n]))))
    pairs += [(1 + 10 ** -u(9, 12), float(rng.randint(10 ** 6, 10 ** 9))) for _ in range(50)]
    pairs += [(u(0, 2), rng.choice((1 / 3, -1 / 3, -0.2, 0.5, 1.5, 2.5))) for _ in range(60)]
    pairs += [(u(5e-324, 2.2e-308), u(0.1, 1)) for _ in range(40)]
    # Subnormal results and normal results below 2^-969.
    for lo, hi in ((-744, -709), (-708.4, -671.7)):
        for _ in range(40):
            a = 10 ** -u(1, 10)
            pairs.append((a, u(lo, hi) / math.log(a)))
    # Results near the largest double.
    for _ in range(30):
        a = 10 ** u(1, 300)
        pairs.append((a, u(705, 709.78) / math.log(a)))
    # Results in the top subnormal binade [2^-1023, 2^-1022), where rounding
    # to 53 bits before scaling would round twice, and near 2^-1075, where a
    # result rounds to 0 or to the smallest subnormal.
    ln2 = math.log(2)
    for lo, hi in ((-1023 * ln2, -1022 * ln2), (-1075 * ln2 - 0.2, -1074 * ln2 + 0.4)):
        xs += [u(lo, hi) / math.log(10) for _ in range(40)]
        for _ in range(40):
            a = 10 ** (rng.choice((1, -1)) * u(1, 300))
            pairs.append((a, u(lo, hi) / math.log(a)))
    # Integer powers with subnormal results, including negative bases.
    for b in (2, 3, 4, 5, 17, -2, -3, -17):
        for _ in range(12):
            a = 2 ** (u(-1074, -1021) / b)
            pairs.append((rng.choice((1, -1)) * a if b % 2 else a, float(b)))
    # Subnormal cases reported by the review of 0.3.0.
    xs += [-307.89685075781483, -307.67060082714306, -307.74277638196946, -308.67414449007674]
    pairs += [
        (1.2416e-320, 0.9620404552599335),
        (1.1500818146845302e-154, 2.0),
        (3.910046363261771e102, -3.0),
        (1.1125369292536007e-308, 0.9999999999999999),
        (0.3668731139587976, 706.5160310126612),
        (1.085726189987556e19, -17.0),
        (-1.085726189987556e19, -17.0),
        (7.021651042263483e-186, 1.6618563423264074),
        (2.332096829763682e-257, 1.1989695265590787),
    ]
    return xs, pairs


def table(xs, pairs):
    pow10 = [[x, exact_pow10(x)] for x in xs]
    pow_ = [[a, b, exact_pow(a, b)] for a, b in pairs]
    # Finite results only; results that round to ±0 test the underflow.
    keep = lambda v: abs(v) <= MAX
    return {
        "reference": "Python decimal, 60 digits, rounded to the nearest double; see scripts/pow_reference.py",
        "pow10": [row for row in pow10 if keep(row[-1])],
        "pow": [row for row in pow_ if keep(row[-1])],
    }


def dump(data):
    rows = lambda key: ",\n".join("    " + json.dumps(r) for r in data[key])
    return "{\n" + f'  "reference": {json.dumps(data["reference"])},\n  "pow10": [\n{rows("pow10")}\n  ],\n  "pow": [\n{rows("pow")}\n  ]\n' + "}\n"


if args.check:
    stored = json.loads(OUT.read_text(encoding="utf-8"))
    fresh = table([r[0] for r in stored["pow10"]], [(r[0], r[1]) for r in stored["pow"]])
    bad = [(k, i) for k in ("pow10", "pow") for i, (s, f) in enumerate(zip(stored[k], fresh[k])) if s != f]
    if bad or any(len(stored[k]) != len(fresh[k]) for k in ("pow10", "pow")):
        print(f"FAIL {OUT.name}: {len(bad)} rows differ, first {bad[:5]}", file=sys.stderr)
        sys.exit(1)
    print(f"{OUT.relative_to(ROOT).as_posix()} matches: {len(stored['pow10'])} pow10 and {len(stored['pow'])} pow rows")
else:
    data = table(*generate())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(dump(data), encoding="utf-8", newline="\n")
    print(f"Wrote {OUT.relative_to(ROOT).as_posix()}: {len(data['pow10'])} pow10 and {len(data['pow'])} pow rows")
