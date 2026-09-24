# Contributing

Discuss a concrete scientific or usability problem before large changes. Keep the application, comments, documentation, reports and citation metadata in English. Follow the [code of conduct](CODE_OF_CONDUCT.md).

1. Create a branch and install dependencies with `npm ci`.
2. Keep numerical equations in `src/science`, observational facts in `data/observations`, and interface behavior in `components/lab`. Modules in `src/science` import only from their own or lower layers (core, model, solver, engine, analysis, dispatch, worker/entry); `scripts/check-architecture.mjs` documents the layers.
3. Cite primary sources for new physical assumptions. Specify the fit combination, confidence convention, units, validity domain and any transformations.
4. Add an independent analytic or numerical benchmark for scientific changes. A test that repeats the implementation is insufficient. Test limiting cases, conservation and termination conditions.
5. Before pushing, run `npm run check`. It runs the tests (including the golden-master comparison), type checking, lint, the architecture check, the solver work-counter check, the formatting check and example regeneration; `git diff examples/` must then be empty unless you changed numerical behaviour on purpose. Fix formatting with `npm run format`. CI also runs:
   - `npm run coverage`, which fails below its line, branch and function thresholds;
   - `npm run build`, `npm run build:vercel` and `npm run validate:vercel`;
   - `python scripts/validate_scipy.py --check`, the independent SciPy comparison (install `requirements-validation.txt` in a virtual environment first);
   - the tests on Windows as well as Linux.
6. After a deliberate numerical change, run `npm run examples` and `npm run golden:update`, and explain every changed output in the pull request. After a deliberate algorithmic change, `npm run bench` reports timings and work counters; run `npm run bench -- --update-baseline` and commit `bench/baseline.json`. When background equations change, run `python scripts/validate_scipy.py` to update `docs/scipy-validation.json`.
7. Update methodology, limitations and the changelog. Describe what was checked and any unresolved domain limits in the pull request.

Never replace failed or undefined trajectories with fabricated curves. Do not label illustrative sampling as an observational posterior or a fitted fate probability. Do not redistribute full papers or restricted datasets. Do not change author or citation metadata without the release owner's verification; `npm run release:check` checks that versions, dates and DOIs agree before a release.

The generated `components/ui` catalog is preserved as an upstream component dependency, and project lint excludes it. Custom scientific UI code remains linted. SVG/canvas have narrowly scoped semantic-role exceptions because these are functional data visualizations.
