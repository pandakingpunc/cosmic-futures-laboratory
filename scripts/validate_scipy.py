"""Independent cosmic-time DOP853 reference, compared to TypeScript RK outputs.

Usage: python scripts/validate_scipy.py [--check]
Without --check the results are written to docs/scipy-validation.json. With
--check they are recomputed and compared with that file (1e-12 absolute) and
nothing is written.
"""
from pathlib import Path
import argparse
import json
import math
import sys
import numpy as np
from scipy.integrate import solve_ivp

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "scipy-validation.json"
H0_YEAR = 31557600 / 3.0856775814913673e19
TOLERANCE = 1e-12

parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
parser.add_argument("--check", action="store_true", help=f"compare with {OUT.relative_to(ROOT).as_posix()} instead of writing it")
args = parser.parse_args()
version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
checks = []

for name in ["observational-baseline", "decaying-dark-matter", "matter-analytic-benchmark", "radiation-analytic-benchmark"]:
    result = json.loads((ROOT / "examples" / f"{name}.result.json").read_text(encoding="utf-8-sig"))
    # Stale examples must not be certified under a newer software version.
    assert result["metadata"]["version"] == version, (name, result["metadata"]["version"], version)
    c = result["config"]
    samples = [s for s in result["samples"] if s["regime"] == "numerical" and 1 < s["logYears"] <= 11]
    times = np.array([10 ** s["logYears"] * c["H0"] * H0_YEAR for s in samples])
    gamma = 10 ** (-c["dmLogLifetime"]) / (c["H0"] * H0_YEAR) if c["dmModel"] == "decay" else 0
    matter = c["omegaB"] + c["omegaNu"]

    def rhs(t, state):
        a, donor, daughter = state
        e2 = matter / a**3 + donor / a**3 + daughter / a**4 + c["omegaDE"] + c["omegaK"] / a**2
        e = math.sqrt(e2)
        transfer = gamma * donor
        return [a * e, -transfer, a * transfer]

    reference = solve_ivp(rhs, (0, float(times[-1])), [1, c["omegaDM"], c["omegaR"]],
                          method="DOP853", t_eval=times, rtol=2e-12, atol=1e-14)
    if not reference.success:
        raise RuntimeError(reference.message)
    actual = np.array([s["logA"] for s in samples])
    error = float(np.max(np.abs(actual - np.log10(reference.y[0]))))
    assert error < 2e-7, (name, error)
    checks.append({"case": name, "samples": len(times), "max_absolute_log10a_error": error, "reference": "SciPy DOP853, cosmic-time a/C/R variables", "rtol": 2e-12, "atol": 1e-14})
    if gamma:
        rho_r = reference.y[2] / reference.y[0] ** 4
        measured = np.array([s["logRhoR"] for s in samples])
        radiation_error = float(np.max(np.abs(measured - np.log10(rho_r))))
        assert radiation_error < 5e-6, radiation_error
        checks[-1]["max_absolute_log10_radiation_error"] = radiation_error

record = {"software_version": version, "checks": checks}
for check in checks:
    print(f"PASS {check['case']}: max |delta log10 a| = {check['max_absolute_log10a_error']:.3e}")


def differences(recorded, computed, path="record"):
    """Human-readable differences; numbers may differ by TOLERANCE."""
    if isinstance(recorded, (int, float)) and isinstance(computed, (int, float)) \
            and not isinstance(recorded, bool) and not isinstance(computed, bool):
        return [] if abs(recorded - computed) <= TOLERANCE else [f"{path}: recorded {recorded!r}, computed {computed!r}"]
    if isinstance(recorded, dict) and isinstance(computed, dict):
        if recorded.keys() != computed.keys():
            return [f"{path}: recorded keys {sorted(recorded)}, computed keys {sorted(computed)}"]
        return [d for k in recorded for d in differences(recorded[k], computed[k], f"{path}.{k}")]
    if isinstance(recorded, list) and isinstance(computed, list):
        if len(recorded) != len(computed):
            return [f"{path}: recorded {len(recorded)} entries, computed {len(computed)}"]
        return [d for i, (r, c) in enumerate(zip(recorded, computed)) for d in differences(r, c, f"{path}[{i}]")]
    return [] if recorded == computed else [f"{path}: recorded {recorded!r}, computed {computed!r}"]


if args.check:
    problems = differences(json.loads(OUT.read_text(encoding="utf-8")), record)
    if problems:
        print(f"FAIL {OUT.name} is out of date; rerun without --check to update it:", file=sys.stderr)
        print("\n".join(problems), file=sys.stderr)
        sys.exit(1)
    print(f"PASS {OUT.name} matches the recomputed reference within {TOLERANCE:g}")
else:
    OUT.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"Independent reference results: {OUT.name}")
# Optional independent reference suite; not required to run the application.
