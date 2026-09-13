# Changelog

## Unreleased

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
