"""Independent cosmic-time DOP853 reference, compared to TypeScript RK outputs.

Also checks located event times (equality, CMB/Hawking and de Sitter horizon
temperature crossings) against closed forms and SciPy quadrature and root
finding, the CPL continuations (dark-energy extinction, Big Rip time and a
closed recollapse) against the closed-form CPL density, and the de Sitter
temperature, entropy and Nariai mass against scipy.constants (CODATA).

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
from scipy import constants
from scipy.integrate import quad, solve_ivp
from scipy.optimize import brentq

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

for check in checks:
    print(f"PASS {check['case']}: max |delta log10 a| = {check['max_absolute_log10a_error']:.3e}")

# Located event times. CODATA values from SciPy (c, h, k_B exact; G measured)
# and the solar mass and megaparsec documented by the engine.
HBAR, G, C, KB = constants.hbar, constants.G, constants.c, constants.k
M_SUN, MPC = 1.98847e30, 3.0856775814913673e22
T_SUN = HBAR * C**3 / (8 * math.pi * G * KB * M_SUN)
EVENT_TOLERANCE = 1e-9
corpus = {case["id"]: case for case in json.loads((ROOT / "tests" / "golden" / "corpus.json").read_text(encoding="utf-8"))["cases"]}


def log_years(tau, cfg):
    return math.log10(tau / (cfg["H0"] * H0_YEAR))


def e_of_x(cfg):
    """E(x) = H/H0 of the constant fluids at x = ln a."""
    m = cfg["omegaB"] + cfg["omegaDM"] + cfg["omegaNu"]
    return lambda x: math.sqrt(m * math.exp(-3 * x) + cfg["omegaR"] * math.exp(-4 * x) + cfg["omegaDE"] + cfg["omegaK"] * math.exp(-2 * x))


def tau_to(cfg, x_end):
    """tau(x_end), the integral of dx/E from today, split so quad resolves every scale."""
    e = e_of_x(cfg)
    edges = [0.0] + [x for x in (1.0, 5.0, 20.0, 60.0) if x < x_end] + [x_end]
    return sum(quad(lambda x: 1 / e(x), lo, hi, epsabs=0, epsrel=1e-13, limit=400)[0] for lo, hi in zip(edges, edges[1:]))


def hawking_ln_a(cfg, mass):
    """ln a at which Tcmb/a equals the Hawking temperature of `mass` solar masses."""
    return math.log(cfg["Tcmb"] * mass / T_SUN)


def gibbons_hawking(h_kms):
    return HBAR * h_kms * 1e3 / MPC / (2 * math.pi * KB)


def mass_id(kind, mass):
    """Event id with the mass as JavaScript prints it: 1e-8, 0.000001, 100000000000000000000."""
    if 1e-6 <= mass < 1e21:
        text = np.format_float_positional(mass, trim="-")
    else:
        text = np.format_float_scientific(mass, trim="-").replace("e-0", "e-").replace("e+", "e+")
    return f"{kind}-{text}"


def event_times(events):
    return {e[0]: e[1] for e in events} if isinstance(events[0], list) else {e["id"]: e["logYears"] for e in events}


def compare(case, reference, recorded):
    """Largest |delta log10 t| over the named events; every one must be present."""
    errors = {k: abs(recorded[k] - v) for k, v in reference.items()}
    worst = max(errors.values())
    assert worst < EVENT_TOLERANCE, (case, errors)
    checks.append({"case": case, "events": sorted(reference), "max_absolute_log10_time_error": worst})
    print(f"PASS {case}: {len(reference)} located events, max |delta log10 t| = {worst:.3e}")


# Flat matter+Lambda equality: the sinh closed form and a root on the dense
# solve_ivp solution of da/dtau = aE agree with the located time.
cfg = corpus["matter-lambda-equality"]["config"]
om, ol = cfg["omegaB"], cfg["omegaDE"]
exact = (math.asinh(1) - math.asinh(math.sqrt(ol / om))) / (1.5 * math.sqrt(ol))
dense = solve_ivp(lambda t, y: [y[0] * math.sqrt(om / y[0] ** 3 + ol)], (0, 2), [1.0], method="DOP853", rtol=1e-13, atol=1e-15, dense_output=True)
by_root = brentq(lambda t: om / dense.sol(t)[0] ** 3 - ol, 0, 2, xtol=1e-15)
assert abs(by_root - exact) < 1e-10, (by_root, exact)
compare("event: matter-lambda equality", {"equality": log_years(by_root, cfg)}, event_times(corpus["matter-lambda-equality"]["fingerprint"]["events"]))

# Closed dust (Omega_m = 2, Omega_k = -1): cycloid a = 1 - cos(theta),
# tau = theta - sin(theta) - (pi/2 - 1). Crossings on the expanding (cool)
# and contracting (warm) branches are also found on a dense SciPy solution of
# a'' = -1/a^2, independently of the engine's time-domain variables.
case = corpus["closed-dust-hawking-crossings"]
cfg, recorded = case["config"], event_times(case["fingerprint"]["events"])
closed = solve_ivp(lambda t, y: [y[1], -1 / y[0] ** 2], (0, 5.7), [1.0, 1.0], method="DOP853", rtol=1e-13, atol=1e-15, dense_output=True)
turn = math.pi / 2 + 1
reference = {}
for mass in cfg["blackHoleMasses"]:
    a_star = math.exp(hawking_ln_a(cfg, mass))
    theta = math.acos(1 - a_star)
    for kind, th, lo, hi in (("cool", theta, 0.0, turn), ("warm", 2 * math.pi - theta, turn, 5.7)):
        if kind == "cool" and a_star < 1:
            assert mass_id(kind, mass) not in recorded, mass
            continue
        tau = th - math.sin(th) - (math.pi / 2 - 1)
        found = brentq(lambda t: closed.sol(t)[0] - a_star, lo, hi, xtol=1e-15)
        assert abs(found - tau) < 1e-9, (kind, mass, found, tau)
        reference[mass_id(kind, mass)] = log_years(tau, cfg)
compare("event: closed-dust cycloid crossings", reference, recorded)

# Pure de Sitter: tau = ln a exactly, in the numerical branch and the tail.
case = corpus["de-sitter-horizon-temperature"]
cfg, recorded = case["config"], event_times(case["fingerprint"]["events"])
reference = {mass_id("cool", m): log_years(hawking_ln_a(cfg, m), cfg) for m in cfg["blackHoleMasses"]}
reference["horizon-temperature"] = log_years(math.log(cfg["Tcmb"] / gibbons_hawking(cfg["H0"])), cfg)
compare("event: de Sitter crossings and horizon temperature", reference, recorded)

# Matter only: tau = (a^1.5 - 1)/1.5, also in the matched matter tail.
case = corpus["matter-tail-hawking-crossing"]
cfg, recorded = case["config"], event_times(case["fingerprint"]["events"])
reference = {mass_id("cool", m): log_years((math.exp(1.5 * hawking_ln_a(cfg, m)) - 1) / 1.5, cfg) for m in cfg["blackHoleMasses"]}
compare("event: matter-only crossings", reference, recorded)

# Observational baseline: quadrature of dx/E for the CMB/Hawking crossings
# and a root of ln Tcmb - x = ln T_GH(H(x)) for the horizon temperature.
result = json.loads((ROOT / "examples" / "observational-baseline.result.json").read_text(encoding="utf-8-sig"))
cfg, recorded = result["config"], event_times(result["events"])
reference = {mass_id("cool", m): log_years(tau_to(cfg, hawking_ln_a(cfg, m)), cfg) for m in cfg["blackHoleMasses"]}
e = e_of_x(cfg)
x_gh = brentq(lambda x: math.log(cfg["Tcmb"]) - x - math.log(gibbons_hawking(cfg["H0"] * e(x))), 60, 80, xtol=1e-14)
reference["horizon-temperature"] = log_years(tau_to(cfg, x_gh), cfg)
compare("event: observational-baseline crossings", reference, recorded)

# DESI CPL equality, with w = w0 + wa(1 - a) varying along the numerical
# branch: rho_de = Omega_de exp(-3[(1 + w0 + wa)x - wa(e^x - 1)]); brentq for
# rho_m = rho_de and quad of dx/E. The located time carries the rtol = 1e-8
# integration error of the varying-w background (about 6e-10 dex).
desi = json.loads((ROOT / "examples" / "desi-2026-cpl.result.json").read_text(encoding="utf-8-sig"))
dcfg = desi["config"]
matter = dcfg["omegaB"] + dcfg["omegaDM"] + dcfg["omegaNu"]
assert dcfg["deModel"] == "cpl" and dcfg["omegaK"] == 0


def ln_rho_cpl(x):
    return math.log(dcfg["omegaDE"]) - 3 * ((1 + dcfg["w0"] + dcfg["wa"]) * x - dcfg["wa"] * math.expm1(x))


x_eq = brentq(lambda x: math.log(matter) - 3 * x - ln_rho_cpl(x), 0.01, 3, xtol=1e-15)
edges = np.linspace(0, x_eq, 9)
tau_eq = math.fsum(quad(lambda x: 1 / math.sqrt(matter * math.exp(-3 * x) + dcfg["omegaR"] * math.exp(-4 * x) + math.exp(ln_rho_cpl(x))), lo, hi, epsabs=0, epsrel=1e-13, limit=400)[0] for lo, hi in zip(edges, edges[1:]))
compare("event: DESI CPL equality", {"equality": log_years(tau_eq, dcfg)}, event_times(desi["events"]))


# CPL continuations with the closed-form density
# ln(rho_de/rho_c0) = ln Omega_de - 3[(1 + w0 + wa) x - wa (e^x - 1)].
def cpl_background(cfg):
    """ln rho_de and ln E^2 of stable fluids, signed curvature and CPL dark energy at x = ln a."""
    m = cfg["omegaB"] + cfg["omegaDM"] + cfg["omegaNu"]

    def ln_de(x):
        return math.log(cfg["omegaDE"]) - 3 * ((1 + cfg["w0"] + cfg["wa"]) * x - cfg["wa"] * math.expm1(x))

    def ln_e2(x):
        terms = [math.log(m) - 3 * x, ln_de(x)] + ([math.log(cfg["omegaR"]) - 4 * x] if cfg["omegaR"] > 0 else [])
        top = max(terms)
        return top + math.log(math.fsum(math.exp(t - top) for t in terms) + cfg["omegaK"] * math.exp(-2 * x - top))
    return ln_de, ln_e2


# Extinction (DESI example): the integrated ln rho_de against the closed form
# on the numerical branch, the theorem's conditions at the recorded state, and
# |delta log10 a| at fixed tau through the drop and the matter tail, from a
# cumulative quad of dx/E that keeps the (negligible) dark energy.
ln_de, ln_e2 = cpl_background(dcfg)
inverse_e = lambda x: math.exp(-0.5 * ln_e2(x))
de_error = a_error = 0.0
x_prev, parts, tail = 0.0, [], 0
for sample in desi["samples"][1:]:
    x = sample["logA"] * math.log(10)
    parts.append(quad(inverse_e, x_prev, x, epsabs=0, epsrel=1e-13, limit=400)[0])
    x_prev = x
    ref = math.fsum(parts)
    tau = 10 ** sample["logYears"] * dcfg["H0"] * H0_YEAR
    a_error = max(a_error, abs(math.log(tau / ref) / (inverse_e(x) / ref)) / math.log(10))
    if sample["regime"] == "numerical" and sample["logRhoDE"] is not None:
        de_error = max(de_error, abs(sample["logRhoDE"] - ln_de(x) / math.log(10)))
    tail += sample["regime"] == "asymptotic"
proof = desi["derived"]["cplContinuation"]
x_ext = proof["logA"] * math.log(10)
w_ext = dcfg["w0"] + dcfg["wa"] * (1 - math.exp(x_ext))
fraction = math.exp(ln_de(x_ext) - ln_e2(x_ext))
assert proof["theorem"] == "extinction" and w_ext >= 1 / 3 and fraction * (1 + 3 * w_ext) < 1e-20, proof
assert de_error < 1e-9 and a_error < 1e-9 and tail > 50, (de_error, a_error, tail)
checks.append({"case": "CPL extinction: DESI 2026 example", "max_absolute_log10_rho_de_error": de_error, "max_absolute_log10a_error_at_fixed_tau": a_error, "extinction_scale_factor": math.exp(x_ext), "extinction_w": w_ext, "extinction_weighted_fraction": fraction * (1 + 3 * w_ext), "reference": "closed-form CPL density; SciPy quad of dx/E through the extinction and the matched matter tail"})
print(f"PASS CPL extinction: |delta log10 rho_de| = {de_error:.3e}, |delta log10 a| at fixed tau = {a_error:.3e} over {len(parts)} samples; dropped at a = {math.exp(x_ext):.4f}, w = {w_ext:.4f}")

# Big Rip (golden case): the rip time is quad of dx/E to infinity; sample times
# at their scale factor (from the expansion index) follow the same integral.
cpl_case = corpus["cpl-big-rip"]
ccfg = cpl_case["config"]
ln_de, ln_e2 = cpl_background(ccfg)
inverse_e = lambda x: math.exp(-0.5 * ln_e2(x))
edges = [0, 1, 2, 3, 4, 5, 6, 8, 12]
assert inverse_e(12) == 0
total = math.fsum(quad(inverse_e, lo, hi, epsabs=0, epsrel=1e-13, limit=400)[0] for lo, hi in zip(edges, edges[1:]))
compare("event: CPL Big Rip time", {"rip": log_years(total, ccfg)}, event_times(cpl_case["fingerprint"]["events"]))
sample_error, count = 0.0, 0
for row in cpl_case["fingerprint"]["samples"][1:]:
    if row[1] < 0.01:
        continue  # log10 a = 10^index - 1 loses precision near a = 1
    x = (10 ** row[1] - 1) * math.log(10)
    ref = math.fsum(quad(inverse_e, lo, min(hi, x), epsabs=0, epsrel=1e-13, limit=400)[0] for lo, hi in zip(edges, edges[1:]) if lo < x)
    sample_error = max(sample_error, abs(row[0] - log_years(ref, ccfg)))
    count += 1
assert sample_error < 1e-9 and count > 15, (sample_error, count)
checks.append({"case": "CPL Big Rip: sample times", "samples": count, "max_absolute_log10_time_error": sample_error, "rip_gyr": 10 ** log_years(total, ccfg) / 1e9})
print(f"PASS CPL Big Rip samples: |delta log10 t| at fixed a = {sample_error:.3e} over {count} samples; rip at {10 ** log_years(total, ccfg) / 1e9:.8f} Gyr")

# Closed recollapse (golden case): DOP853 in proper time of
# a'' = -a/2 [M/a^3 + 2R/a^4 + (1 + 3w(a)) rho_de(a)] with the closed-form
# rho_de(a); turnaround at v = 0 and the two equalities on the collapse,
# where rho_de returns, at the roots of ln(rho_m/rho_de) = 0.
cpl_case = corpus["cpl-closed-recollapse"]
ccfg = cpl_case["config"]
ln_de, _ = cpl_background(ccfg)
cm = ccfg["omegaB"] + ccfg["omegaDM"] + ccfg["omegaNu"]


def closed_rhs(t, z):
    a, v = z
    w = ccfg["w0"] + ccfg["wa"] * (1 - a)
    return [v, -0.5 * a * (cm / a**3 + 2 * ccfg["omegaR"] / a**4 + (1 + 3 * w) * math.exp(ln_de(math.log(a))))]


turned = lambda t, z: z[1]
turned.direction = -1
collapsed = lambda t, z: z[0] - 1e-3
collapsed.terminal = True
solution = solve_ivp(closed_rhs, (0, 1e4), [1.0, 1.0], method="DOP853", rtol=3e-14, atol=1e-16, events=[turned, collapsed], dense_output=True)
t_turn, t_end = solution.t_events[0][0], solution.t_events[1][0]
gap = lambda y: math.log(cm) - 3 * y - ln_de(y)
y_min = math.log((ccfg["w0"] + ccfg["wa"]) / ccfg["wa"])  # w = 0: the minimum of the convex gap
roots = sorted((brentq(gap, lo, hi, xtol=1e-15) for lo, hi in ((-5, y_min), (y_min, 5))), reverse=True)
reference = {"turn": log_years(t_turn, ccfg), "equality": log_years(brentq(lambda t: solution.sol(t)[0] - math.exp(roots[0]), 0, t_turn, xtol=1e-14), ccfg)}
for k, y in enumerate(roots):
    reference[f"equality-{k + 2}"] = log_years(brentq(lambda t: solution.sol(t)[0] - math.exp(y), t_turn, t_end, xtol=1e-14), ccfg)
compare("event: closed CPL turnaround and collapse equalities", reference, event_times(cpl_case["fingerprint"]["events"]))

# de Sitter temperature and entropy samples, and the Nariai mass.
t_error = s_error = 0.0
for sample in result["samples"]:
    if sample["logHorizonTemperature"] is None:
        assert sample["logHorizonEntropy"] is None
        continue
    h = 10 ** sample["logH"]
    t_error = max(t_error, abs(sample["logHorizonTemperature"] - math.log10(gibbons_hawking(h))))
    s_error = max(s_error, abs(sample["logHorizonEntropy"] - math.log10(math.pi * C**5 / (HBAR * G * (h * 1e3 / MPC) ** 2))))
nariai = C**3 / (3 * math.sqrt(3) * G * cfg["H0"] * math.sqrt(cfg["omegaDE"]) * 1e3 / MPC) / M_SUN
n_error = abs(result["derived"]["nariaiMass"] / nariai - 1)
assert t_error < 1e-12 and s_error < 1e-12 and n_error < 1e-12, (t_error, s_error, n_error)
checks.append({"case": "de Sitter thermodynamics: observational baseline", "max_absolute_log10_temperature_error": t_error, "max_absolute_log10_entropy_error": s_error, "nariai_mass_msun": nariai, "nariai_relative_error": n_error, "reference": "scipy.constants CODATA; solar mass 1.98847e30 kg"})
print(f"PASS de Sitter thermodynamics: |delta log10 T_GH| = {t_error:.1e}, |delta log10 S| = {s_error:.1e}, Nariai mass {nariai:.6e} Msun (relative {n_error:.1e})")

record = {"software_version": version, "checks": checks}


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
