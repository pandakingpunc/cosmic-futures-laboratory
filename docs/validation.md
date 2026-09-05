# Validation record — version 0.1.0

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

The owner supplied the author name Mustafa Karatum and affiliation Independent researcher; citation placeholders were replaced and the local public-release metadata check passed. GitHub renders the software citation using the supplied name and verified public repository URL. No Zenodo archival or DOI assignment is claimed.

## Validation boundaries

No independent benchmark is claimed for realistic galaxy formation, stellar population synthesis, cosmological likelihoods, general event horizons, total entropy, quantum-gravity endpoints, or arbitrary nonstandard interventions. Those calculations are outside this version's implemented scope. Numerical failure, physical-model termination and uncertainty about the actual Universe must be interpreted separately.
