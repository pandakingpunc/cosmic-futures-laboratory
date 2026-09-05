# Cosmic Futures Laboratory — Scientific Report

Generated 2026-09-05T11:17:49.813Z

## Simulation Configuration

observational-baseline; endpoint 10^100 elapsed years from today (a=1). Configuration hash: eac426f0.

```json
{
  "name": "observational-baseline",
  "preset": "planck2018",
  "H0": 67.36,
  "omegaB": 0.049301692328524445,
  "omegaDM": 0.26447041034523616,
  "omegaNu": 0.0015278973262394242,
  "omegaR": 0.0000796,
  "omegaDE": 0.6846204,
  "omegaK": 0,
  "Tcmb": 2.7255,
  "Neff": 3.046,
  "deModel": "lambda",
  "w0": -1,
  "wa": 0,
  "expression": "-1 + 0.1 * sin(log(a))",
  "dmModel": "stable",
  "dmLogLifetime": 12,
  "annihilation": 0.01,
  "interaction": 0.02,
  "warmW": 0.001,
  "protonDecay": false,
  "protonLogLifetime": 36,
  "electronDecay": false,
  "electronLogLifetime": 30,
  "evaporation": "hawking",
  "evaporationFactor": 1,
  "blackHoleMasses": [
    10,
    100000,
    1000000000
  ],
  "vacuumDecay": false,
  "vacuumLogLifetime": 100,
  "sandbox": false,
  "events": [],
  "endLogYears": 100,
  "samples": 100,
  "seed": 42,
  "rtol": 1e-8,
  "atol": 1e-11
}
```

## Observational Inputs

Preset: planck2018. Dataset 2026-09-05.1. See data/observations/cosmology-constraints.json for source IDs, transformations and covariance limitations. A preset may mix explicitly declared reference composition with reported parameters; it is not a likelihood evaluation.

## Physical Assumptions

Future-only FLRW background; pressureless massive neutrinos; separately specified radiation. Dark matter: stable. Dark energy: lambda. Astrophysical populations are tracer approximations.

## Numerical Method

Dormand–Prince 5(4); log-scale-factor expansion; regular time-domain contraction; matched constant-fluid asymptotes. rtol=1e-8; atol=1e-11. Accepted steps=601; rejected=0. Time-domain Friedmann residual=0.

- H²/H₀² = (Ωb + Ων,massive) a⁻³ + ρdm/ρc,0 + ρr/ρc,0 + ρde/ρc,0 + Ωk a⁻²
- dρi/dt + 3H(1 + wi)ρi = Qi; ΣQi = 0 for conservative transfers
- d ln|ρde| / d ln a = −3[1 + w(a)]
- D = (ρdm/ρc,0)a³; R = (ρr/ρc,0)a⁴; τ = H₀(t − t₀)
- dD/d ln a = −3wDM D − ΓD/H − ξD − A D² a⁻³/(H/H₀)
- dR/d ln a = a[ΓD/H + ξD + A D² a⁻³/(H/H₀)]
- Tγ = Tγ,0/a; TH = ℏc³/(8πGkB M); tevap = 5120πG²M³/(ℏc⁴)

Approximation: Matched constant-fluid asymptote, ρ ∝ a^(0.0000), subdominant fraction < 10⁻⁸. Future source ratios cannot overtake the dominant term. Numeric integration ends at log10(elapsed yr)=12.02179.

## Cosmic Evolution

201 samples. Status: complete.

## Major Events

- **CMB cooler than 1e+1 M☉ Hawking temperature**: ~10^11.7 yr. Temperature crossing only: suggests the background changes from hotter to colder than this ideal black hole. It is not a complete net-accretion calculation. [Model dependent; hawking1975]
- **CMB cooler than 1e+5 M☉ Hawking temperature**: ~10^11.8 yr. Temperature crossing only: suggests the background changes from hotter to colder than this ideal black hole. It is not a complete net-accretion calculation. [Model dependent; hawking1975]
- **CMB cooler than 1e+9 M☉ Hawking temperature**: ~10^11.9 yr. Temperature crossing only: suggests the background changes from hotter to colder than this ideal black hole. It is not a complete net-accretion calculation. [Model dependent; hawking1975]
- **Star formation becomes scarce**: ~10^12.0 yr (indicative range 10^11–10^13 yr). Illustrative depletion range for gas and long-lived stellar populations; not a computed galaxy-formation history. [Model dependent; adams1997]
- **Long-lived normal stars fade**: ~10^14.0 yr (indicative range 10^13–10^14.5 yr). Low-mass stellar lifetimes motivate this broad transition into a remnant-rich era. The plotted stellar fraction is a phenomenological proxy. [Model dependent; adams1997]
- **Bound systems may disperse**: ~10^20.0 yr (indicative range 10^19–10^22 yr). Repeated gravitational encounters can eject members of bound stellar systems. Environment-dependent order-of-magnitude range. [Model dependent; adams1997]
- **1e+1 M☉ black hole: ideal evaporation**: ~10^70.3 yr. Isolated, uncharged, nonrotating Hawking blackbody estimate. Background accretion, greybody factors and changing particle species are omitted; the endpoint is uncertain. [Model dependent; hawking1975, page1976]
- **1e+5 M☉ black hole: ideal evaporation**: ~10^82.3 yr. Isolated, uncharged, nonrotating Hawking blackbody estimate. Background accretion, greybody factors and changing particle species are omitted; the endpoint is uncertain. [Model dependent; hawking1975, page1976]
- **1e+9 M☉ black hole: ideal evaporation**: ~10^94.3 yr. Isolated, uncharged, nonrotating Hawking blackbody estimate. Background accretion, greybody factors and changing particle species are omitted; the endpoint is uncertain. [Model dependent; hawking1975, page1976]
- **Selected black-hole population depleted**: ~10^94.3 yr. The largest selected representative mass reaches its ideal evaporation endpoint. Stable matter and degenerate remnants may remain. [Model dependent; adams1997, page1976]

## Ultimate Fate

**Asymptotic de Sitter expansion**

The resolved background approaches a positive constant-density fluid. With the specified stable future law, H tends to a constant and expansion continues. Heat death remains an additional conditional thermodynamic interpretation.

## Uncertainty

This deterministic trajectory does not assign a probability to the actual cosmic fate. Observational marginal errors do not specify a joint posterior. Ensemble bands, when separately generated, must be exported with their sampling assumptions; they are not embedded in this deterministic report.

## Limitations

- Massive neutrinos are pressureless over this future-only integration. Ωr is an independently specified photons + effective massless-neutrino density. Tcmb and Neff do not silently recompute Ωr.
- Stellar populations and remnant eras are phenomenological proxies; no N-body dynamics, stellar population synthesis, or exact entropy budget is computed.

Null fields explicitly mean absent, undefined, unavailable, or out-of-range quantities; no finite substitute has been fabricated. CMB temperature is redshifted photon temperature, not the de Sitter horizon thermal response. Black-hole entropy and population proxies are not a total cosmic entropy.

## Reproducibility

Software 0.1.0; data 2026-09-05.1; seed 42. Export the JSON result plus the release source and lockfile.

## References

The versioned source registry is data/observations/sources.json; full primary-source research snapshots accompany it. Source URLs are also available in the application's Scientific Sources interface.

- Planck Collaboration; N. Aghanim et al. (2020-09-11). Planck 2018 results. VI. Cosmological parameters. https://arxiv.org/abs/1807.06209 — DOI 10.1051/0004-6361/201833910
- DESI Collaboration (2026-08-04). DESI DR2 Lyα forest full-shape cosmological constraints. https://arxiv.org/html/2607.27410v3 — DOI 10.48550/arXiv.2607.27410
- DESI Collaboration (2025-10-06). DESI DR2 Results II: Measurements of BAO and cosmological constraints. https://arxiv.org/html/2503.14738v3 — DOI 10.1103/tr6y-kpc6
- ACT Collaboration (2025). The Atacama Cosmology Telescope: DR6 Power Spectra, Likelihoods and ΛCDM Parameters. https://arxiv.org/html/2503.14452v2
- A. G. Riess et al.; SH0ES (2024). A small Magellanic Cloud distance anchor for the Hubble constant. https://arxiv.org/abs/2404.08038 — DOI 10.3847/1538-4357/ad630e
- D. Brout et al. (2022). The Pantheon+ Analysis: Cosmological Constraints. https://arxiv.org/abs/2202.04077 — DOI 10.3847/1538-4357/ac8e04
- NASA Euclid Science Center at IPAC (2026-08). Euclid data release timeline — August 2026 update. https://euclid.caltech.edu/page/data-release-timeline
- D. J. Fixsen (2009). The Temperature of the Cosmic Microwave Background. https://arxiv.org/abs/0911.1955 — DOI 10.1088/0004-637X/707/2/916
- Super-Kamiokande Collaboration; A. Takenaka et al. (2020-10-30). Search for proton decay via p→e+π0 and p→μ+π0 in Super-Kamiokande I–IV. https://arxiv.org/abs/2010.16098 — DOI 10.1103/PhysRevD.102.112011
- Super-Kamiokande Collaboration; Y. M. Liu et al. (2026-08-31). Search for proton decay into a single charged antilepton and a massless invisible particle. https://arxiv.org/abs/2608.30361
- Borexino Collaboration; M. Agostini et al. (2015-09-03). A test of electric charge conservation with Borexino. https://arxiv.org/abs/1509.01223 — DOI 10.1103/PhysRevLett.115.231802
- S. W. Hawking (1975). Particle creation by black holes. https://doi.org/10.1007/BF02345020 — DOI 10.1007/BF02345020
- D. N. Page (1976). Particle emission rates from a black hole: Massless particles from an uncharged, nonrotating hole. https://doi.org/10.1103/PhysRevD.13.198 — DOI 10.1103/PhysRevD.13.198
- F. C. Adams and G. Laughlin (1997). A Dying Universe: The Long-Term Fate and Evolution of Astrophysical Objects. https://arxiv.org/abs/astro-ph/9701131 — DOI 10.1103/RevModPhys.69.337
- M. E. Caplan (2020). Black dwarf supernova in the far future. https://arxiv.org/abs/2008.02296 — DOI 10.1093/mnras/staa2262
- R. R. Caldwell, M. Kamionkowski and N. N. Weinberg (2003). Phantom Energy and Cosmic Doomsday. https://arxiv.org/abs/astro-ph/0302506 — DOI 10.1103/PhysRevLett.91.071301
- G. Hiller, T. Höhne, D. F. Litim and T. Steudtner (2024). Vacuum Stability in the Standard Model and Beyond. https://arxiv.org/abs/2401.08811 — DOI 10.1103/PhysRevD.110.115017
- G. W. Gibbons and S. W. Hawking (1977). Cosmological event horizons, thermodynamics, and particle creation. https://doi.org/10.1103/PhysRevD.15.2738 — DOI 10.1103/PhysRevD.15.2738
- A. Friedmann (1922). On the curvature of space. https://doi.org/10.1007/BF01332580 — DOI 10.1007/BF01332580
