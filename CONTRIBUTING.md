# Contributing

Discuss a concrete scientific or usability problem before large changes. Keep the application, comments, documentation, reports and citation metadata in English. Follow the [code of conduct](CODE_OF_CONDUCT.md).

1. Create a branch and install dependencies with `npm ci`.
2. Keep numerical equations in `src/science`, observational facts in `data/observations`, and interface behavior in `components/lab`.
3. Cite primary sources for new physical assumptions. Specify the fit combination, confidence convention, units, validity domain and any transformations.
4. Add an independent analytic or numerical benchmark for scientific changes. A test that repeats the implementation is insufficient. Test limiting cases, conservation and termination conditions.
5. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. Regenerate examples for changes to the solver or data. Run the independent SciPy suite when background equations change.
6. Update methodology, limitations and the changelog. Describe what was checked and any unresolved domain limits in the pull request.

Never replace failed or undefined trajectories with fabricated curves. Do not label illustrative sampling as an observational posterior or a fitted fate probability. Do not redistribute full papers or restricted datasets. Keep identity placeholders until the release owner supplies verified metadata.

The generated `components/ui` catalog is preserved as an upstream component dependency; project lint excludes that catalog and its generated hooks. Custom scientific UI code remains linted. SVG/canvas have narrowly scoped semantic-role exceptions because these are functional data visualizations.
