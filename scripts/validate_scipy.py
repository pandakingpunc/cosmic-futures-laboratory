"""Independent cosmic-time DOP853 reference, compared to TypeScript RK outputs."""
from pathlib import Path
import json
import math
import numpy as np
from scipy.integrate import solve_ivp

ROOT = Path(__file__).resolve().parents[1]
H0_YEAR = 31557600 / 3.0856775814913673e19
checks = []

for name in ["observational-baseline", "decaying-dark-matter", "matter-analytic-benchmark", "radiation-analytic-benchmark"]:
    result = json.loads((ROOT / "examples" / f"{name}.result.json").read_text(encoding="utf-8-sig"))
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

out = ROOT / "docs" / "scipy-validation.json"
out.write_text(json.dumps({"software_version": "0.1.0", "checks": checks}, indent=2) + "\n", encoding="utf-8")
for check in checks:
    print(f"PASS {check['case']}: max |delta log10 a| = {check['max_absolute_log10a_error']:.3e}")
print(f"Independent reference results: {out.name}")
