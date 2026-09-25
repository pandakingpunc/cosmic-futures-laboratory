# Cosmic Futures Laboratory

[![Scientific and software validation](https://github.com/pandakingpunc/cosmic-futures-laboratory/actions/workflows/ci.yml/badge.svg)](https://github.com/pandakingpunc/cosmic-futures-laboratory/actions/workflows/ci.yml)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22343411.svg)](https://doi.org/10.5281/zenodo.22343411)

A numerical laboratory for exploring **conditional futures of the Universe**. Configure cosmological fluids, calculate their evolution, inspect assumptions and compare the results. The application and publication materials are in English.

Source repository: [pandakingpunc/cosmic-futures-laboratory](https://github.com/pandakingpunc/cosmic-futures-laboratory).

This is version **0.3.0, a research software preview**. Its core is checked in several independent ways:

- 203 automated tests: analytic benchmarks, a bit-exact golden master of every example output, property-based fuzzing and regression tests for each defect found by an independent audit;
- line coverage above 99%;
- an independent SciPy reference.

It has not undergone external scientific peer review. It does not calculate a unique or observationally measured probability for the ultimate cosmic fate.

![The observatory with a calculated Lambda reference universe](docs/media/observatory.png)

## Quick start

Requirements: Node.js 24.x and npm. No API key, Python installation, or database is needed to use the web application.

```sh
npm ci
npm run dev
```

Open the local URL printed by the development server, normally `http://localhost:3000`. Choose a preset or change the initial conditions and press **RUN SIMULATION**. Modified inputs are marked until recalculated. Save universes to the comparison bench, inspect epochs with the time slider, and export JSON, CSV, SVG, PNG or a Markdown scientific report.

Calculations run in a browser Web Worker, so interactive use needs no server round trip. The current configuration and the comparison bench persist in the browser, the address bar always encodes the last calculated configuration as a shareable link (**Share link** copies it), and exported result files can be imported back into the bench without recalculation. `/api/simulate` accepts the same `{ config, mode, options }` body for scripts and serves as an automatic fallback.

```sh
npm run check        # tests, types, lint, formatting, layering, work counters, examples
npm run coverage     # tests with line/branch/function coverage thresholds
npm run bench        # deterministic work counters and timings
npm run fuzz -- --seed 7 --n 5000   # deeper property-based fuzzing
npm run build
```

`npm run check` runs `npm test`, `typecheck`, `lint`, `format:check`, `check:arch`, the benchmark counter gate and `examples`. After an intended change to numerical output, regenerate the golden files with `npm run examples` and `npm run golden:update`, and explain the difference in `CHANGELOG.md`.

The production build targets Cloudflare Workers through Vinext and Sites. `npm start` serves the built Worker locally. Sites hosting metadata contains this project's deployment ID; a fork must remove that ID before registering a separate deployment. Scientific calculations and local development do not require a Sites account.

## Deploy to Vercel

Import this GitHub repository into Vercel with the repository root as **Root Directory** and **Node.js 24.x**. The committed `vercel.json` selects the Vercel build automatically: **Framework Preset: Other**, **Build Command: `npm run build:vercel`**, **Install Command: `npm ci`**, and **Output Directory: automatic**. No environment variables are required.

The Vercel build uses Vinext and Nitro to emit both static assets and the server function under `.vercel/output`. This serves the observatory and `/api/simulate` / `/api/observations`. A Cloudflare `dist` folder by itself is not a Vercel deployment and can produce `404: NOT_FOUND`.

```sh
npm run build:vercel
npm run validate:vercel
```

See [the Vercel deployment guide](docs/vercel.md) for updating an existing deployment that returned 404. The archived version 0.1.0 predates this deployment adapter; deploy the current `main` branch to use it.

## Scientific scope

- Adaptive Dormand–Prince 5(4) integration, with first-same-as-last stage reuse, of future-only FLRW expansion and conservative dark-matter-to-radiation transfers.
- Λ, constant-w, CPL, bounded future continuation, and safely parsed custom `w(a)` / `w(z)` expressions.
- Stable, decaying, annihilating, warm-fluid and phenomenologically interacting dark matter. Particle identity is not assumed known.
- Regular time-domain integration through turnaround and bounce for supported closed or negative-vacuum models. A convex-minimum test proves when a closed model can never recollapse.
- Proven single-fluid asymptotic continuation, including coasting expansion, with explicit numerical boundaries for unsupported models. Nested logarithms represent expansion at endpoints up to 10^1000 elapsed years.
- Proof-based continuation of CPL laws. For wₐ < 0 the dark energy dies out; for wₐ > 0 a Big Rip occurs at a time computed by Gauss–Kronrod quadrature. Both fates are labelled literal extrapolations of the fit ansatz.
- Event times located exactly on the continuous solution, independent of the output grid: matter–dark-energy equality, CMB/Hawking temperature crossings in both directions, and the fall of the CMB below the de Sitter horizon temperature.
- De Sitter horizon entropy and Gibbons–Hawking temperature under an explicit de Sitter criterion. Black-hole masses are bounded by the Nariai and Hubble-radius masses.
- Representative black-hole Hawking temperatures, ideal evaporation times and mass histories; illustrative stellar and particle-survival tracers.
- Seeded ensembles, user-supplied covariance or posterior rows, finite-difference sensitivity and a two-dimensional parameter sweep.
- Conditional timelines, schematic 3D tracer groups, equations, source provenance, reports and reproducible example runs.
- An optional nonstandard sandbox with timed interventions and explicit failure diagnostics.

See [the mathematical model](docs/methodology.md), [supported features and boundaries](docs/scope.md), [data provenance](docs/data-provenance.md), and [validation](docs/validation.md).

## HTTP API and library use

`POST /api/simulate` accepts `{ config, mode, options }`. `mode` is `deterministic`, `ensemble`, `sensitivity` or `sweep`. A partial `config` is completed from its named preset, and unknown keys are dropped with a warning. `GET /api/observations` returns the bundled observational presets.

Each request runs under a deterministic budget:

- at most 10⁶ right-hand-side evaluations;
- at most 64 ensemble runs;
- sweeps up to 11×11;
- bodies up to 64 KiB, counted in bytes as they stream in;
- JSON nested at most 32 levels deep.

| Status | Meaning |
| --- | --- |
| 400 | Malformed JSON, a non-object body, or invalid configuration or options |
| 413 | Body too large |
| 422, `code: "api-limit"` | Too many runs or too large a sweep; rejected before any computation |
| 422, `code: "work-budget"` | The evaluation budget ran out |
| 500 | Internal fault, returned with a generic message |

The browser laboratory runs the same engine in a Web Worker without these limits.

Scripts can import the engine directly from `src/science/index.ts`. It exports `simulate`, `validate`, `runAnalysis`, the presets, `csv`/`report` and `compareResults`. `simulate(config, { timestamp, counters, budget })` is deterministic: the same input and version give bit-identical results.

## Observational inputs

The versioned review is dated **2026-09-05**. The default is a documented Planck 2018 flat-ΛCDM reference, not a claim that all observations have one unique best fit. [Planck VI](https://arxiv.org/abs/1807.06209) supplies H₀=67.36±0.54 km/s/Mpc and Ωm=0.3153±0.0073 (68% marginal constraints). Radiation and the baryon/CDM/neutrino split have explicit transformation notes.

The [DESI July/August 2026 update](https://arxiv.org/html/2607.27410v3) is included alongside historical results and dataset-combination caveats. CPL can fit the observed past while giving an unreliable extrapolation into the future. A CPL future is continued only where a proof applies (the dark energy dies out for wₐ < 0, a finite-time Big Rip for wₐ > 0), and that fate is labelled a literal extrapolation of the fit ansatz, not a prediction; the DESI preset thus ends in matter-dominated deceleration. A P-ACT-H₀ illustration is explicitly labeled as having an illustrative composition. No unavailable Euclid posterior or cosmological covariance has been invented.

`data/observations/sources.json` is the machine-readable source registry. The two research snapshots record extracted constraints and reasons for selection. Data is bundled and does not silently change through a live headline feed. Review, test and version updates using [the update procedure](docs/data-provenance.md).

## Important limitations

The solver evolves a homogeneous background, not perturbations or an N-body simulation. The 3D view contains fixed seeded tracer groups and a compressed expansion mapping. Stellar population curves are illustrative proxies, not fitted population synthesis or galaxy-merger predictions.

Proton and electron survival are **test-population tracers**: their decay products do not feed back into the homogeneous background. Finite particle lifetimes are assumptions, not experimental measurements. Stability limits are channel-specific partial lifetimes. The vacuum-decay clock is a user-assumed local Poisson toy model, not a nucleation calculation over spacetime volume.

The black-hole formula is the isolated Schwarzschild **blackbody approximation**. Greybody factors, changing particle species, spin, mergers, background accretion and quantum-gravity endpoints are omitted. A CMB/Hawking temperature crossing is not a complete net-accretion calculation. Stable matter need not disappear when the selected black holes evaporate.

The explicit ODE solver does not automatically solve every stiff model. It rejects failed steps and reports a minimum-step or model-domain boundary. Custom w(a) laws, CPL laws outside the proof conditions and some interventions can remain unresolved. A null exported quantity means absent, undefined, out of numeric range, or unsupported in the stated regime; the quantity dictionary explains these cases. **Numerical/model failure and observational uncertainty are different.**

## Reproducibility and examples

Each JSON result includes the complete input, software/data versions, equations, tolerances, seed, time origin, configuration fingerprint, event list and approximation diagnostics. The fingerprint is a noncryptographic 32-bit FNV-1a-style hash (offset basis 2166136261, prime 16777619) over the UTF-16 code units of `JSON.stringify` of the canonical configuration (recognised keys only, in their fixed order), printed as eight hexadecimal digits; it is an identifier, not a security checksum. Preserve the JSON together with the source release and `package-lock.json`.

`npm run examples` regenerates 16 configurations and computed outputs. See [examples/manifest.json](examples/manifest.json), the [baseline report](examples/observational-baseline.report.md), and configurations for phantom energy, recollapse, decaying dark matter, particle decay, remnants and nonstandard interventions. Timestamps are fixed to `SOURCE_DATE_EPOCH` when it is set, otherwise to the release date in `CITATION.cff`, so regeneration is deterministic; CI fails when the committed examples differ from a fresh run.

The golden-master tests recompute every example and a corpus of 16 further fingerprinted cases (`tests/golden/`) and require exact equality. Property tests check engine invariants on random configurations: no exceptions, no NaN or Infinity, strictly increasing times, unique events and deterministic reruns. `npm run bench` records machine-independent work counters that CI compares with `bench/baseline.json`.

Independent reference validation is optional:

```sh
python -m venv .venv
# Activate .venv for your shell, then:
python -m pip install -r requirements-validation.txt
npm run examples
python scripts/validate_scipy.py --check
```

`--check` recomputes the SciPy reference and compares it with `docs/scipy-validation.json` without writing; omit it to rewrite the record. Likewise, `python scripts/pow_reference.py --check` recomputes the exact reference powers of `tests/reference/pow.json` with Python's `decimal` module.

With Node.js 24, results are bit-identical on Linux and Windows. CI recomputes every golden output on both, and `tests/pow.test.ts` compares SHA-256 digests of 100,000 powers and of the engine's `Math` functions with committed values. Browsers with a newer JavaScript engine, and the HTTP API of the Cloudflare Workers build, reproduce them only approximately; the Vercel build runs the API on Node.js 24 (see `docs/scope.md`).

## Project structure

```text
app/                    Routes and HTTP simulation API
components/lab/         Scientific interface and plots
src/science/core/       Constants, hashing, random streams, work budgets
src/science/model/      Validation, dark-energy laws, background equations, asymptotes
src/science/solver/     Dormand–Prince, expanding and time-domain branches, tails, event location, quadrature
src/science/            Orchestrator (engine.ts), classification, analysis, reports, public index.ts
data/observations/      Versioned observations and primary sources
tests/                  node:test suites: analytic, golden master, property/fuzz, regressions, API
bench/                  Work-counter baseline for the benchmark gate
scripts/                Examples, golden corpus, bench, fuzz, SciPy reference, release checks
examples/               Configurations and actual computed outputs
docs/                   Methodology, limits, provenance, validation, publication guide
.github/                CI, Dependabot and contribution templates
```

`npm run check:arch` enforces the dependency direction core → model → solver → orchestration → analysis → dispatch → worker/index, and keeps UI code out of `src/science`. It also rejects `**` and `Math.pow` there and in the interface code: V8 evaluates them with the operating system's C library, which rounds differently on Linux and Windows, so the engine uses the platform-independent `pow10` and `powPortable` from `src/science/core/pow.ts`. For the same reason the engine uses `tanhPortable` instead of `Math.tanh`.

## GitHub and Zenodo release

Version **0.3.0** is prepared for release (dated 2026-09-24 in the citation files) but not yet archived. Zenodo will assign its version DOI when the GitHub release `v0.3.0` is published; the DOI is then recorded in `CITATION.cff`, this README and `CHANGELOG.md`. Until then, refer to 0.3.0 through the concept DOI:

> Karatum, M. (2026). *Cosmic Futures Laboratory: a numerical laboratory for conditional cosmological futures* (Version 0.3.0) [Computer software]. https://doi.org/10.5281/zenodo.22343411

Version **0.2.0** was archived on Zenodo on **2026-09-14**, with version DOI [10.5281/zenodo.22750182](https://doi.org/10.5281/zenodo.22750182), from GitHub release [`v0.2.0`](https://github.com/pandakingpunc/cosmic-futures-laboratory/releases/tag/v0.2.0), source revision `2679395`. The concept DOI [10.5281/zenodo.22343411](https://doi.org/10.5281/zenodo.22343411) always resolves to the latest archived version.

Version **0.1.0** was archived on Zenodo on **2026-09-05**, with version DOI [10.5281/zenodo.22343412](https://doi.org/10.5281/zenodo.22343412). The archive corresponds to GitHub tag [`v0.1.0.0`](https://github.com/pandakingpunc/cosmic-futures-laboratory/releases/tag/v0.1.0.0), source revision `eaeedceceff2856f9c70743eb538c28dc10e9cde`. Tags `v0.1.0` and `v0.1.0.0` contain the same source; the software version is `0.1.0`.

Recommended citation for the latest archived version:

> Karatum, M. (2026). *Cosmic Futures Laboratory: a numerical laboratory for conditional cosmological futures* (Version 0.2.0) [Computer software]. Zenodo. https://doi.org/10.5281/zenodo.22750182

Cite version 0.1.0 with its own DOI, 10.5281/zenodo.22343412, when referring to that archive.

Author metadata records **Mustafa Karatum — Independent researcher**. The repository includes MIT licensing, `CITATION.cff`, `.zenodo.json`, CI, release notes and a publication checklist. Follow [the release guide](docs/releasing.md) for subsequent versions and DOI handling. Run `npm run release:check` before tagging a release; it fails on any version, date or DOI inconsistency.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Scientific changes need source provenance and an independent benchmark. Software is available under the [MIT License](LICENSE). Scientific publications retain their original rights; the data layer contains limited attributed metadata and extracted constraints, not redistributed papers.
