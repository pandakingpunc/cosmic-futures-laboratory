# Validation record

## Revalidation of the unreleased main branch — 2026-09-13

Revalidated locally on 2026-09-13 with Node.js 24.19.0, Windows, and the updated pinned dependency tree after the changes listed under *Unreleased* in `CHANGELOG.md` (browser-worker execution, Newton-refined output sampling, shareable links, browser persistence, inline validation, dependency cleanup).

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

Regression cases additionally verify continuous tail density matching, simultaneous interventions in both numerical and asymptotic segments, loss of asymptotic dominance, exclusion of events beyond the requested endpoint, correct ordering of competing terminal events, explicit nonflat-G boundaries, and reconstructed contraction samples used for statistical interpolation. Test assertions and tolerances are in `tests/science.test.ts`; counts alone are not an accuracy claim.

## Independent SciPy reference

`scripts/validate_scipy.py` integrates cosmic-time scale factor and comoving donor/radiation variables with SciPy DOP853, independently of the application's log-scale-factor Dormand–Prince implementation. Reference tolerances are rtol=2×10⁻¹² and atol=10⁻¹⁴. These comparisons cover the near future through 10¹¹ elapsed years, not the extreme-time approximation.

| Case | Maximum absolute difference in log₁₀(a) |
| --- | ---: |
| Observational reference | 4.363×10⁻¹¹ |
| Decaying dark matter | 4.222×10⁻¹¹ |
| Matter benchmark | 2.709×10⁻¹¹ |
| Radiation benchmark | 7.657×10⁻¹¹ |

The decaying-matter radiation comparison has maximum absolute log-density difference 1.049×10⁻¹⁰. Full-precision results and sample counts are in [scipy-validation.json](scipy-validation.json). Python/SciPy dependencies are pinned in `requirements-validation.txt`.

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
