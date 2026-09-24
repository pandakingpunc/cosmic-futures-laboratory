# Changelog

## 0.3.0 — 2026-09-24

Prepared for release; not yet archived. Zenodo assigns the version DOI when the GitHub release is published, and it is recorded afterwards (see `docs/releasing.md`). Until then, cite the concept DOI [10.5281/zenodo.22343411](https://doi.org/10.5281/zenodo.22343411). This release has not undergone external scientific peer review.

This version rebuilds the engine as layered modules with bit-identical results, fixes 73 defects confirmed by an independent audit, and adds exact event location, de Sitter thermodynamics and a proof-based continuation of CPL dark-energy laws. Every change to a numerical output is listed under **Changed (numerical outputs)**.

### Added — science

- **Exact event location.** Matter–dark-energy equality, CMB/Hawking temperature crossings and a new `horizon-temperature` event ("CMB photons fall below the de Sitter horizon temperature") are located on the continuous solution rather than on the output grid:
  - on the expanding branch, by Illinois refinement on partial Dormand–Prince steps down to a 4ε bracket;
  - in matched tails, by exact log-space inversion of the tail law;
  - on the time-domain branch, by root refinement in u = ln(1+τ).

  Event times no longer depend on `samples` or the endpoint, and each located event gets its own output sample. Contracting universes report `warm-M` events when the CMB becomes hotter than a hole again. Repeated crossings are numbered (`cool-M-2`, `equality-2`, …).
- **de Sitter thermodynamics.** New sample field `logHorizonTemperature`: the Gibbons–Hawking temperature ħH/(2πk_B). It is reported under the same explicit de Sitter criterion as the horizon entropy. All physical constants come from one CODATA 2018 module.
- **Black-hole mass bounds.** Validation rejects masses above the Nariai mass c³/(3√3 G H_Λ) (for Λ or constant w = −1) or above the Hubble-radius mass c³/(2GH₀), with field messages, and warns above 10⁻³ of the bound. Both bounds are reported in the new optional `Result.derived` object.
- **Proof-based continuation of CPL laws** w(a) = w₀ + wₐ(1−a), using the closed-form CPL density. Every fate reached this way is labelled "· literal CPL extrapolation": a mathematical consequence of the fit ansatz, not a prediction.
  - **wₐ < 0 (extinction):** once w ≥ 1/3, no supported component dilutes faster, so the dark energy can never regain influence in a flat or open universe. It is dropped (event `de-extinct`) once |Ωde|(1+3w) < 10⁻²⁰, with documented error bounds.
  - **wₐ > 0 (Big Rip):** once w ≤ −1 and everything else is below 10⁻⁸, the remaining proper time is a convergent integral. It is evaluated on adaptive Gauss–Kronrod panels, giving a `rip` event at a computed time.
  - **Closed models with wₐ < 0:** these always recollapse. They are integrated in proper time with the closed-form density, which returns during the collapse.
  - `Result.derived.cplContinuation` records which theorem applied and where.
- **Bounce detection.** Closed models with a negative stiff component bounce. They now receive `turn` and `bounce` events and are classified as an "Oscillating classical solution".
- **New classifications:** "Coasting expansion" (density exponent n = 2) and "Custom intervention boundary" (deliberate sandbox stops).
- **Non-recollapse proof.** A closed model whose expansion provably never halts (a convex-minimum test on a²E²) stays on the expanding branch. Closed ΛCDM, for example, is now "Asymptotic de Sitter".
- **Sources:** new entries `codata2018`, `bousso1998`, `chevallier2001`, `linder2003` and `nojiri2005`, each checked against its arXiv or NIST record.

### Added — engineering and verification

- **Layered engine.** The engine is split into modules (`src/science/core`, `model`, `solver`, plus `classify`, `vacuum`, `continuation` and an orchestrating `engine.ts`). `npm run check:arch` enforces the layer order and forbids UI imports. `src/science/index.ts` is the public library entry.
- **Faster integration, identical results.** DOPRI5 now uses loops with the same summation order and first-same-as-last stage reuse. Default runs, ensembles and sweeps are about 2.5–3× faster. A differential check of 21,000 configurations found zero bit differences against 0.2.0.
- **Golden master.** Every example result, the baseline report and a corpus of 16 extra fingerprinted cases (`tests/golden/`) must reproduce exactly. Example generation is deterministic: `SOURCE_DATE_EPOCH`, or the `CITATION.cff` release date. CI fails when committed examples drift.
- **Tests.**
  - Tests now run on `node:test`, split by topic: 197 tests, up from 45.
  - Property/fuzz invariants (`tests/properties.test.ts`, `npm run fuzz`) and regression tests named after each audit finding.
  - `npm run coverage` measures the real TypeScript sources (99% of lines, 95% of branches, 100% of functions; thresholds 98/94/98).
- **Benchmarks.** `npm run bench` reports deterministic work counters and timings. CI gates the counters against `bench/baseline.json`.
- **HTTP API limits.**
  - Each request gets a deterministic budget of 10⁶ derivative evaluations, at most 64 ensemble runs and at most 11×11 sweeps.
  - Request bodies are capped at 64 KiB, counted in streamed bytes, and at 32 levels of nesting.
  - Status codes: 413 for oversized bodies, 422 with `code: "api-limit"` or `"work-budget"`, 400 for invalid input, and 500 with a generic message for internal faults.
  - The browser laboratory has no such limit.
- **Release tooling.** `npm run release:check` compares every version and date field, and rejects a stale DOI or one invented for this release. `tests/release.test.ts` catches version drift in `npm test`.
- **Independent SciPy reference.** `python scripts/validate_scipy.py --check` recomputes it without writing. It now also covers located events, T_GH, S_dS and the Nariai mass, CPL densities, times through extinction, Big Rip times and closed CPL recollapse.
- **CI.** Tests run on Ubuntu and Windows. CI also runs coverage, the SciPy job, the architecture check, counter gates, and example drift. Dependabot is configured. `.gitattributes` forces LF line endings for byte-compared data.

### Changed (numerical outputs)

Backgrounds, step counts and statuses of the examples are unchanged except for the DESI example.

- **DESI 2026 CPL preset.** It was "Undetermined · numerical/model boundary" (limited at 10^18 yr). It is now "Long-lived decelerating expansion · literal CPL extrapolation": the dark energy is dropped at a = 38.75, 10^12.61 yr after today, and a matched matter tail reaches 10¹⁰⁰ yr. Other CPL laws resolve to decelerating/coasting expansion, a Big Rip or a Big Crunch approach. CPL with wₐ = 0 is now identical to constant w.
- **CMB/Hawking crossings** move earlier by up to 0.15 dex, and the DESI equality by 0.17 dex. The old first-sample-after rule was up to 1.1 dex late on coarse grids. ΛCDM-like examples gain a `horizon-temperature` event at 10^12.08 yr.
- **`logHorizonEntropy`:**
  - rises by 9.80×10⁻⁴ dex (the Planck-length constant was truncated);
  - appears from 10^11.05 yr instead of 10^11.41 yr (explicit criterion: w = −1 to rounding and a dark-energy fraction within 10⁻⁸ of unity);
  - includes the sandbox G multiplier in both regimes;
  - shifts by −2.7×10⁻¹⁰ dex because ħ is now exactly h/2π.
- **Extra samples** resolve the approach to a Big Crunch (evenly in log a) and to a Big Rip (evenly in ln a), and mark every located event. Sample times strictly increase after the present.
- **Absent dark energy** reports `w: null`. A contracting universe without radiation reports a null effective radiation temperature.
- **Example presets.** Example configurations that are not an unchanged preset are labelled `custom`, which changes 14 configuration hashes. Hashes of unchanged configurations are identical.
- **Ensembles** draw each run's vacuum-clock seed from a separate stream, and posterior mode draws only the row index. Sensitivity steps adapt to small H₀ or Ωm.

### Fixed

- **Engine.**
  - `simulate()` never throws. Unbounded w₀, failed sample reconstruction, deep or cyclic input and `null` options now give an `invalid` or `limited` result with a reason.
  - Runs resolving less than one year no longer emit negative or non-monotone times.
  - Rounding in w₀+wₐ no longer produces a spurious Big Rip or a power law 70 dex off.
  - Events after the endpoint no longer change the solver.
  - Spurious turnarounds from constraint drift are rejected.
  - Vacuum-decay runs keep their final sample.
  - Tail interventions stop with the same status as numerical ones.
  - Classifications agree between finite runs and tails.
  - Stale tail explanations are fixed.
- **Validation.** Duplicate, overlong or reserved event ids, out-of-range seeds and names with control characters are now rejected.
- **Analyses and API.**
  - Invalid base configurations and malformed options give a 400 error.
  - Unknown configuration keys are dropped with a warning, and existing hashes are unchanged.
  - The fingerprint hashes UTF-16 code units exactly as documented.
  - Report text is sanitized.
  - The request-size limit counts bytes.
- **Interface.**
  - Crafted share links or files can no longer crash the page. A recovery screen was added, and imports are checked structurally.
  - Uncalculated edits survive reloads.
  - Storage failures are reported.
  - Analysis results survive tab switches.
  - Invalid configurations disable runs and analyses.
  - Number fields accept minus signs, exponents, the typographic minus and decimal commas, with 16 px inputs on phones.
  - Overlapping runs are sequenced.
  - Duplicate React keys are gone.
  - Slider thumbs are labelled.
  - PNG export reports failures.
  - Charts handle runs that end before 10¹ years.
- **Release metadata.** The `package-lock.json` root version said 0.1.0 during 0.2.0. `validate_scipy.py` read `package.json` from the working directory. The SciPy table was rounded incorrectly. `release-check` matched versions as substrings.

## 0.2.0 — 2026-09-14

Archived on Zenodo from GitHub release `v0.2.0`: version DOI [10.5281/zenodo.22750182](https://doi.org/10.5281/zenodo.22750182). The concept DOI [10.5281/zenodo.22343411](https://doi.org/10.5281/zenodo.22343411) resolves to the latest archived version.

- Add a separate Vinext/Nitro Vercel build with server functions, static assets and routing configuration.
- Verify the packaged Vercel homepage and scientific APIs in CI while preserving the existing Cloudflare/Sites build.
- Run simulations, ensembles, sensitivity and sweeps in a browser Web Worker through a shared analysis dispatcher. The HTTP API keeps the same engine and request body for scripts and as an automatic fallback, so no request timeout or server CPU limit applies to interactive use.
- Refine output samples inside accepted steps with a bracketed Newton iteration on τ(x) instead of a 52-step bisection. Deterministic runs are about 4–5× faster; the Dormand–Prince tableau is allocated once. Regenerated example outputs agree with the previous outputs to at most 3.6×10⁻¹⁰ (limited CPL case) and typically below 10⁻¹³ in logarithmic quantities; the independent SciPy comparison is unchanged.
- Add shareable links: the address bar encodes the last calculated configuration (`#c=…`) and a **Share link** button copies it. Opening a link restores and recalculates that universe.
- Persist the current configuration and the four-slot comparison bench in the browser, import exported result files back into the bench without recalculation, and export the visible chart as PNG in addition to SVG.
- Show validation messages under the affected input and list every failing input; tolerances, dark-matter rates and model selections now report field-specific messages.
- Fix: duplicate black-hole masses are rejected instead of producing duplicate timeline entries; a vacuum-decay draw earlier than one elapsed year terminates at the first sample instead of producing negative log-time coordinates; repeated matter–dark-energy crossings receive unique event identifiers; ensemble and sweep requests without an options object return an explicit 400 message.
- Remove unused dependencies and 56 unused interface components (recharts, cmdk, date-fns, embla-carousel-react, input-otp, react-day-picker, react-resizable-panels, @shadcn/react). Update wrangler, @cloudflare/vite-plugin and @cloudflare/workers-types to clear four high-severity audit findings; align @types/node with Node.js 24.
- Add `npm run format:check` to CI, exclude generated examples and Markdown from the formatter, make the test harness await asynchronous checks, and extend the suite to 45 checks (sample-time precision, field validation, vacuum-clock bounds, event identifiers, sensitivity, sweeps, the HTTP route and dispatcher, link encoding and result-file recognition).

## 0.1.0 — 2026-09-05

Initial research software preview.

- Adaptive FLRW numerical core, signed constant-fluid recollapse and conditional matched asymptotes.
- Five dark-energy and five dark-matter modes, safe equation interpreter, explicit validation and numerical-domain diagnostics.
- Extreme-time nested logarithms to a requested 10^1000-year endpoint for justified models.
- Conditional astrophysical tracers, ideal black-hole evaporation and optional particle/vacuum assumptions.
- English scientific interface, timeline, plots, schematic structure view, comparisons and uncertainty exploration.
- Versioned September 2026 research sources, reproducible examples and JSON/CSV/SVG/Markdown exports.
- Analytic regression suite, independent SciPy validation, CI and owner-completed publication metadata.

Archived on Zenodo: [10.5281/zenodo.22343412](https://doi.org/10.5281/zenodo.22343412). The archived GitHub tag is `v0.1.0.0`; it contains the same source as `v0.1.0`.

See `docs/scope.md` for supported boundaries. This release has not undergone external scientific peer review.
