# Observational data provenance

Dataset version: **2026-09-05.1**. Extraction/review date: **2026-09-05**.

The app reads presets from `data/observations/cosmology-constraints.json`; numerical equations do not embed their observational values. `sources.json` records title, author/collaboration, date, URL, DOI/arXiv where available, dataset, extracted values, uncertainties and selection notes. Companion research JSON files retain table locations, channels, confidence levels and methodological caveats.

## Input transformations

For the Planck reference, Ωb=(Ωb h²)/h² and Ωcdm=(Ωcdm h²)/h² use H₀=67.36. Ων is the **residual** of rounded Ωm=0.3153 after subtracting those components. It is not asserted to be the exact density of a 0.06-eV state. The sum of marginal means is not an exact maximum-likelihood vector. Ωr≈7.96×10⁻⁵ is a declared effective photon plus massless-species approximation; Ωde follows closure. Spatial flatness, w=−1, particle stability and representative black-hole masses are assumptions.

The DESI 2026 CPL preset uses the four verified Table 3 means H₀, Ωm, w₀ and wₐ from the specified CMB/SNe combination. Its baryon/neutrino split is a labeled reference approximation. No joint covariance was obtained. The P-ACT-H₀ example uses a reported H₀ but an illustrative composition and an explicitly illustrative Ωm spread; it must not be described as the P-ACT posterior vector.

Particle stability numbers are channel-specific **partial lifetime lower bounds** at stated confidence levels, not measured total lifetimes. User-selected finite lifetimes and sandbox rates are not observational defaults. Stellar proxy parameters and black-hole masses are user-model choices.

## Update procedure

1. Inspect collaboration releases and primary papers, comparing publication/revision dates with the current date.
2. Record the exact fit model, data combination, statistic, units, interval definition and table/equation location.
3. Verify transformations, radiation/neutrino counting and density closure. Do not merge incompatible measurements or infer covariance from marginal errors.
4. Add/update a source record and preserve the prior snapshot in version control. Note preprint status and unresolved tensions.
5. Increment the dataset version and update `DATASET_VERSION` in the science module.
6. Run scientific tests, regenerate example outputs, and review preset labels and report provenance.

Euclid's reviewed August 2026 schedule placed DR1 Foundation in November 2026 and Complete in mid-2027. No Euclid cosmological constraint vector is included. SPT information appears in specified combined analyses; this release does not claim an independently extracted SPT or standard-siren posterior.

Scientific sources retain their original copyright. Only limited metadata, extracted facts and attributed methodological summaries are included, not full papers or figures.
