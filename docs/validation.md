# Validation record

## Version 0.3.0 — validated 2026-09-24

Validated locally on 2026-09-24 with Node.js 24.19.0 on Windows 11 (AMD Ryzen 5 5600) and the pinned dependency tree, before GitHub publication. The CI workflow repeats the tests on Ubuntu and Windows when the source is pushed. These checks establish specific numerical and software behaviour; they are not external scientific peer review.

### Gates

- `npm test`: **197 tests** pass under `node:test`. They include:
  - the golden master: all 16 example results, the baseline report and 16 fingerprinted corpus cases, compared exactly;
  - property/fuzz invariants: 300 random configurations and 20,000 expressions per run;
  - a regression test named after each fixed audit finding;
  - analytic benchmarks, API and release-metadata checks.
- `npm run coverage`: 99.22% of lines, 95.64% of branches and 100% of functions of the measured TypeScript sources, against thresholds of 98/94/98. Node measures only modules that a test loads, so the browser worker and the re-export entries are not counted.
- `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm run check:arch` (58 modules in their layers) pass.
- `npm run bench -- --check-counters --counters-only`: the work counters are within 1% of `bench/baseline.json`.
- `python scripts/validate_scipy.py --check` passes: the independent SciPy reference matches `docs/scipy-validation.json` to 10⁻¹².
- `npm run examples` and `npm run golden:update` regenerate byte-identical files. Example timestamps come from `SOURCE_DATE_EPOCH` or the `CITATION.cff` release date.
- `npm run release:check` passes for 0.3.0, with no DOI recorded for this version.
- Production builds: see [Production builds for 0.3.0](#production-builds-for-030).

### Engine restructuring (bit-identical)

The 0.2.0 engine was split into layered modules and its Dormand–Prince step rewritten with loops of the same summation order plus first-same-as-last stage reuse. The following checks compared the new engine against the 0.2.0 source, with `Object.is` on every field (so −0, NaN and ±Infinity count), thrown messages and input mutation. All found zero differences:

- 21,000 `simulate()` configurations: valid and invalid, late interventions, dense early interventions and contracting universes;
- 370 ensemble, sensitivity, sweep and dispatcher runs, plus a 256-run ensemble and a 15×15 sweep for both presets;
- about 10.8 million reused first stages and 4.8 million reused Newton slopes, each recomputed and compared.

Removing the stage-reuse reset after an intervention makes the golden corpus fail.

### Independent audit

Six reviewers, one per subsystem, audited 0.2.0: engine core, tails and contraction, physical constants, analysis and parser, interface, and platform and documentation. A separate verifier then tried to refute each of the 74 findings. The result:

- 73 were confirmed and are fixed, each with a regression test;
- 1 was refuted;
- 1 whose verdict was uncertain (PNG export error handling) was hardened anyway.

After the fixes, a differential fuzz of 24,000 configurations against the pre-fix engine attributed every output difference to an intended fix. A SciPy check of 3,000 closed and loitering models confirmed the new non-recollapse routing: none of the 1,193 models routed as never turning around actually turns around.

### Timings

Median of 7 runs after 2 warm-ups (`npm run bench`), single Node.js process. These are indicative only; the work counters are the reproducible measure.

| Workload | 0.2.0 | 0.3.0 |
| --- | ---: | ---: |
| Default run, 240 samples to 10¹⁰⁰ yr | 10.7 ms | 5.6 ms |
| 1000 samples to 10¹¹ yr | 21.3 ms | 7.9 ms |
| Ensemble, 64 realizations | 281 ms | 139 ms |
| Sweep, 9×9 grid | 376 ms | 233 ms |
| Sensitivity | 10.9 ms | 6.5 ms |
| DESI 2026 CPL preset | 16.6 ms, stops at 10¹⁸ yr | 10.6 ms, resolved to 10¹⁰⁰ yr |

The 0.2.0 column was measured on the same machine at the start of this release cycle. Exact event location and the CPL continuation add work, which is why the ensemble and sweep gains are smaller than the ~2.6× measured for the restructuring alone.

### Production builds for 0.3.0

- `npm run build` (Cloudflare Workers through Vinext) and `npm run build:vercel` (Vinext + Nitro) complete.
- `npm run validate:vercel` passes against the packaged Vercel function: routing, SSR, 10 referenced assets, simulation, all analysis modes, and request validation and limits (413/422).
- `npm audit --audit-level=high` reports 0 vulnerabilities.

The HTTP limits are also exercised by `tests/api.test.ts`:

- streamed bodies without Content-Length, and multibyte bodies near the byte cap;
- deep nesting, runs above the cap, the audit's CPU-heavy payload, and malformed input.

### Proof-based CPL continuation

Checks added with the CPL extinction and Big Rip continuations and the proper-time integration of closed CPL models (`tests/cpl.test.ts`, `tests/quadrature.test.ts`; SciPy rows below):

- Integrated ln ρde against the closed form |Ωde| a^(−3(1+w₀+wₐ)) exp(3wₐ(a−1)) on the DESI numerical branch: 4.4×10⁻¹⁰ dex at rtol = 10⁻⁸ (test 10⁻⁹) and 5×10⁻¹³ at rtol = 10⁻¹² (test 10⁻¹²). τ(a) through the dark-energy drop (a = 38.75) and the matter tail against quadrature of dx/E with the full CPL density: 4.8×10⁻¹⁰ in log₁₀ a at fixed τ (test 10⁻⁹), in an independent Simpson rule and in SciPy quad.
- Extinction threshold 10⁻²⁰ against 10⁻³⁰: the same classification, explanation and status, and samples at common times equal to 10⁻¹² (identical bits at rtol = 10⁻⁸). After the drop, the omitted q term ½(1+3w)Ωde stays below ε(1.02+0.52√K)/2 at every numerical sample.
- Big Rip for (w₀, wₐ) = (−0.9, 0.3) and (−1.1, 0.2) on the DESI base: 25.9158799 and 23.3486282 Gyr after today. They agree with Simpson and SciPy quad of ∫₀^∞dx/E to 2.4×10⁻¹¹ and 1.0×10⁻¹⁰ relative at rtol = 10⁻⁸ (test 10⁻⁹) and to 1.2×10⁻¹⁴ and 9.2×10⁻¹⁴ at rtol = 10⁻¹² (test 10⁻¹²). Every sample time agrees with the same integral at its scale factor, and samples stop strictly before the rip.
- CPL with wₐ = 0 gives results identical to constant w, for flat, closed and negative-vacuum models.
- Closed DESI-like CPL (Ωk = −0.001 and −0.01): the turnaround agrees with a SciPy DOP853 proper-time solution at rtol = 3×10⁻¹⁴ to 2.3×10⁻⁹ dex at rtol = 10⁻⁸ (a_max = 313; the proper-time constraint drift, 1.0×10⁻⁸) and to 4.8×10⁻¹⁰ dex at rtol = 10⁻¹²; the test asserts 10⁻⁸ dex against a substitution Simpson rule.
- Runs that end before a CPL proof applies, and all non-CPL runs, are bit-identical to the previous engine (checked on the DESI preset to 10^12.5 and 10^12.6 yr with 1000 samples, a Big Rip law to 10^10.41 yr, and the Λ, constant, bounded, custom and closed-dust defaults). Only the CPL warning text changed.
- Property tests add CPL invariants. `derived.cplContinuation` is present exactly for CPL with wₐ ≠ 0, and its record is consistent with its theorem. No sample lies beyond a rip, and a CPL continuation stops strictly before it. Dark energy is absent after `de-extinct`, and there is no extinction event in a closed model. 21,000 extra fuzz configurations (seeds 21–27) passed.
- Independent review with SciPy quad of dx/E on 13 further rip cases: (w₀, wₐ) from (−1.3, 10⁻³) to (−0.5, 2) and (−1, 10⁻⁶), (−1.2, 5×10⁻³²⁴), (−1, 10⁻³⁰⁰); open, closed and radiation-heavy compositions; warm (w = 1/3) and ξ = 2 interacting dark matter, the latter with exact radiation feeding. Rip times agree to at most 1.7×10⁻¹⁰ relative and sample times to 1.2×10⁻⁹ dex at rtol = 10⁻⁸. Extinction states (w, Ωde, time) of eight flat or open cases, including negative dark energy and wₐ = −10⁴, agree with the closed form to the rtol level. Turnaround and crunch times of six closed recollapses (turnaround at a = 4 to 330, one with negative dark energy) agree to 2.3×10⁻⁹ dex, but differ by 3.3×10⁻⁶ dex for Ωk = −10⁻⁴, wₐ = −0.01 (turnaround at a ≈ 3100, residual 2.4×10⁻⁶; see methodology). A fresh fuzz seed (4242, 1500 configurations) passed.

### Located events and de Sitter thermodynamics

Checks added with exact event location, the Gibbons–Hawking temperature and the black-hole mass bounds (tests in `tests/events.test.ts`, `tests/thermodynamics.test.ts`; SciPy rows below):

- Located times against closed forms at the default rtol=10⁻⁸: flat matter+Λ equality 1.4×10⁻¹⁰ dex, bit-identical for 40/240/1000 samples and endpoints 10¹¹/10¹⁰⁰/10¹⁰⁰⁰ yr; flat ΛCDM CMB/Hawking crossings ≤ 8.5×10⁻¹² dex in the numerical branch and the de Sitter tail; matter-only ≤ 4.6×10⁻¹¹ dex including the matter tail; pure de Sitter exact to rounding; closed-dust cycloid cooling and reheating crossings ≤ 4.7×10⁻¹¹ dex. Tests assert 10⁻⁹ dex. Repeated time-domain crossings (a bounce with `cool-M-2`; closed quintessence with `equality-2`) agree with an independent SciPy a″ solution to 1.6×10⁻⁹ dex at rtol = 10⁻⁸ and 2×10⁻¹¹ dex at rtol = 10⁻¹⁰; that test asserts 5×10⁻⁹ dex.
- T_GH and S_dS agree with scipy.constants (CODATA) to rounding; S·T_GH²·g is constant to 10⁻¹³ across a G change and the tail boundary; the Planck-preset Nariai mass is 2.163112×10²² M☉.
- Property tests check strictly increasing sample times, T_GH under the entropy criterion, consistent mass bounds and a sample at every located event; 10,000 extra fuzz configurations (seeds 99 and 5) passed. In a differential check of 944 valid random configurations on 1000-sample grids, all 674 strict sign changes between grid samples contain a located crossing; the only located crossings without a grid bracket sit at the last representable time of a Big Rip or of a limited run.

## Version 0.2.0 — validated 2026-09-13

Archived on Zenodo on 2026-09-14 from GitHub release `v0.2.0` with version DOI [10.5281/zenodo.22750182](https://doi.org/10.5281/zenodo.22750182); the public record lists version 0.2.0, the author, affiliation and MIT license under concept DOI 10.5281/zenodo.22343411.

Revalidated locally on 2026-09-13 with Node.js 24.19.0, Windows, and the updated pinned dependency tree after the changes listed under 0.2.0 in `CHANGELOG.md` (browser-worker execution, Newton-refined output sampling, shareable links, browser persistence, inline validation, dependency cleanup).

- `npm test` passes **45 checks**; the harness now awaits asynchronous checks so HTTP-route assertions count. New checks cover sample-time precision (a rerun to a sample's own time reproduces log₁₀ a to 10⁻¹²), field-mapped validation, duplicate black-hole masses, the vacuum clock at lifetime 0 for 39 seeds, unique equality-event identifiers, sensitivity ordering, sweep outcomes and option validation, the dispatcher and `POST /api/simulate` handler, link encoding with non-ASCII names, and result-file recognition.
- Numerical equivalence: all 16 example configurations plus the 10¹⁰⁰ and 10¹⁰⁰⁰-year defaults were recomputed with the previous bisection sampler and the new bracketed Newton sampler. Accepted-step counts, classifications, statuses and event times are identical. The largest difference in any logarithmic sample quantity is 3.6×10⁻¹⁰ (the `limited` DESI CPL case near its stiff boundary) and at most 1.2×10⁻¹³ for every other case. Configuration hashes are unchanged.
- The independent SciPy DOP853 comparison was rerun on the regenerated examples: maximum |Δ log₁₀ a| 4.362×10⁻¹¹ (observational reference), 4.221×10⁻¹¹ (decaying dark matter), 2.709×10⁻¹¹ (matter benchmark), 7.657×10⁻¹¹ (radiation benchmark), identical to the 0.1.0 record within the printed precision.
- Type checking, linting, `npm run format:check`, the Cloudflare build, the Vercel build and `npm run validate:vercel` pass. The worker bundle is emitted under `_next/static/workers/` in both outputs.
- `npm audit --audit-level=high` reports zero vulnerabilities after updating wrangler 4.131.1, @cloudflare/vite-plugin 1.54.8 and @cloudflare/workers-types; the 0.1.0 dependency tree had since accumulated four high-severity advisories through miniflare/sharp.
- Browser checks against the development server: a modified H₀ was calculated in the worker with no request to `/api/simulate` (only the worker module was fetched); a 32-realization ensemble ran the same way; the address bar received the `#c=` link and the browser store held the configuration; a reload without the hash restored and recalculated H₀=70; a manually constructed link with H₀=72 and a new name restored, recalculated and preserved the one-slot comparison bench; an out-of-range H₀ showed the inline field message, the summary list and a disabled run button. At 375×812 CSS pixels the header shows icon-only share and export buttons with no horizontal document overflow. No console errors were observed.

Timings on the validation machine, single Node.js process, indicative only:

| Workload | Before | After |
| --- | ---: | ---: |
| Default run, 240 samples to 10¹⁰⁰ yr | 67 ms | 15 ms |
| Ensemble, 32 realizations | 0.71 s | 0.17 s |
| Ensemble, 256 realizations | 5.5 s | 1.2 s |
| Sweep, 15×15 grid | 2.8 s | 1.1 s |

## Version 0.1.0

Validated locally on 2026-09-05 with Node.js 24.19.0, Windows, and the pinned npm dependency tree. These checks establish specific numerical and software behavior; they are not external scientific peer review or a proof that arbitrary future physics is modeled correctly.

## Scientific regression suite

`npm test` passes **35 checks**. The suite covers numerical matter, radiation, curvature and de Sitter solutions; the exact flat matter–Lambda sinh solution; the constant-phantom finite-time integral; closed-dust turnaround; negative-vacuum collapse; constraint drift; extreme-time logarithmic representations; conservative dark-matter donor evolution; initial zero daughter radiation; safe expression parsing; input validation; Hawking mass-cubed scaling; particle survival; seeded ensembles; covariance validation; JSON/CSV/report serialization; and numerical-boundary reporting.

Regression cases additionally verify continuous tail density matching, simultaneous interventions in both numerical and asymptotic segments, loss of asymptotic dominance, exclusion of events beyond the requested endpoint, correct ordering of competing terminal events, explicit nonflat-G boundaries, and reconstructed contraction samples used for statistical interpolation. Test assertions and tolerances are in `tests/*.test.ts`; counts alone are not an accuracy claim.

## Independent SciPy reference

`scripts/validate_scipy.py` integrates cosmic-time scale factor and comoving donor/radiation variables with SciPy DOP853, independently of the application's log-scale-factor Dormand–Prince implementation. Reference tolerances are rtol=2×10⁻¹² and atol=10⁻¹⁴. These comparisons cover the near future through 10¹¹ elapsed years, not the extreme-time approximation.

| Case | Maximum absolute difference in log₁₀(a) |
| --- | ---: |
| Observational reference | 4.362×10⁻¹¹ |
| Decaying dark matter | 4.221×10⁻¹¹ |
| Matter benchmark | 2.709×10⁻¹¹ |
| Radiation benchmark | 7.657×10⁻¹¹ |

The decaying-matter radiation comparison has maximum absolute log-density difference 1.048×10⁻¹⁰.

Located event times are compared with SciPy root finding and quadrature (maximum |Δ log₁₀ t|): flat matter+Λ equality from `brentq` on a dense DOP853 solution, 1.43×10⁻¹⁰; closed-dust crossings from `brentq` on an independent a″ = −1/a² solution and the cycloid, 4.74×10⁻¹¹; observational-baseline CMB/Hawking and horizon-temperature crossings from `quad` of dx/E and a `brentq` root of ln Tγ,0 − x = ln T_GH(H(x)), 1.69×10⁻¹²; DESI CPL equality, with w(a) varying along the numerical branch, from `brentq` for ρm = ρde and `quad` of dx/E, 6.12×10⁻¹⁰ (the rtol = 10⁻⁸ integration error, not the locator); CPL Big Rip time (golden `cpl-big-rip`) from `quad` of dx/E to infinity, 1.01×10⁻¹¹, and its sample times at their scale factors, 4.59×10⁻¹¹; closed CPL turnaround and the three equalities (golden `cpl-closed-recollapse`, ρde returning during the collapse) from a DOP853 proper-time solution with the closed-form ρde(a), 2.59×10⁻¹⁰; matter-only and pure de Sitter closed forms, 4.39×10⁻¹¹ and 0. The DESI example also has ln ρde checked against the closed form to 4.375×10⁻¹⁰ dex, and τ(a) through the dark-energy drop and the matter tail checked to 4.799×10⁻¹⁰ in log₁₀ a at fixed τ. Full-precision results and sample counts are in [scipy-validation.json](scipy-validation.json). Python/SciPy dependencies are pinned in `requirements-validation.txt`.

## Application and production checks

- TypeScript checking, project linting and the production build pass.
- `npm audit --audit-level=high` reports zero known vulnerabilities at the validation date.
- All 16 example configurations and outputs regenerate successfully.
- HTTP smoke checks pass against both the development server and built Worker: simulation execution, invalid configurations, malformed arrays, unknown analysis modes and observation retrieval. Run `node scripts/validate-api.mjs http://localhost:8787` while `npm start -- --port 8787` is running.
- Browser checks exercised strong-phantom calculation, negative w entry, changing inputs and rerunning, a baseline/phantom comparison, a 32-realization ensemble, finite-difference sensitivity, a 7×7 outcome map, timeline navigation, source search and report rendering.
- The layout was inspected at the default desktop viewport and 390×844 CSS pixels. Mobile configuration controls and the run button remain accessible, with no horizontal document overflow. Screenshots are in `docs/media/`.
- No warning/error console messages were observed in the inspected production session. Browser download controls were exercised; the embedded browser did not expose a completed download event, so saving files to disk from that browser is not certified by this record. Export serialization is tested, and generated result files are included under `examples/`.

The [first GitHub Actions validation run](https://github.com/pandakingpunc/cosmic-futures-laboratory/actions/runs/33964495365) passed on Linux for source revision `64a8d95ddfdcfd7bf57be425b6d537a570dfdd28`. Dependency installation, scientific tests, type checking, linting, example generation, production build and dependency audit all completed successfully. This supplements the local Windows checks above.

The owner supplied the author name Mustafa Karatum and affiliation Independent researcher; citation placeholders were replaced and the local public-release metadata check passed. Version 0.1.0 was published on Zenodo on 2026-09-05 with DOI [10.5281/zenodo.22343412](https://doi.org/10.5281/zenodo.22343412). The public record metadata confirms the author, affiliation, software version and MIT license. Its source archive comes from GitHub tag `v0.1.0.0`, revision `eaeedceceff2856f9c70743eb538c28dc10e9cde`, which is also tagged `v0.1.0`. DOI registration documents archival; the numerical validation evidence is the set of checks reported above.

## Validation boundaries

No independent benchmark is claimed for realistic galaxy formation, stellar population synthesis, cosmological likelihoods, general event horizons, total entropy, quantum-gravity endpoints, or arbitrary nonstandard interventions. Those calculations are outside this version's implemented scope. Numerical failure, physical-model termination and uncertainty about the actual Universe must be interpreted separately.
