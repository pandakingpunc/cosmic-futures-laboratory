# Supported features and explicit boundaries

This release prioritizes a working, auditable FLRW laboratory. It is not a complete simulation of all known or speculative astrophysics.

| Capability          | Implemented scope                                                             | Boundary                                                                              |
| ------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Numerical expansion | Adaptive RK with conservative fluid transfers                                 | No general implicit stiff solver                                                      |
| Recollapse          | Stable constant-w/Λ fluids, signed curvature/vacuum                           | No general interacting contraction solver                                             |
| Extreme time        | Log-time, nested-log expansion, proven fluid tails                            | Arbitrary models stop at their numerical boundary                                     |
| Dark energy         | Λ, constant w, CPL, bounded, arithmetic custom                                | No dynamical scalar-field potential solver                                            |
| Dark matter         | Stable, decay, annihilation, warm pressure, H-proportional radiation transfer | No microscopic particle inference or free streaming                                   |
| Neutrinos           | Future pressureless massive component plus effective radiation                | No exact Fermi–Dirac background or perturbations                                      |
| Particle stability  | Optional exponential tracer survival                                          | No baryonic decay feedback on Friedmann expansion                                     |
| Black holes         | Selected mass populations, ideal temperatures, mass loss and remnants         | No spin, accretion, mergers or greybody rates                                         |
| Stellar future      | Broad event ranges and a logistic proxy                                       | No IMF synthesis, white-dwarf/neutron-star counts or galaxy-merger prediction         |
| Structure view      | Rotatable schematic 3D projected tracer groups                                | Not an N-body simulation; no Big Rip bound-system thresholds                          |
| Thermodynamics      | CMB/effective radiation T, de Sitter horizon entropy                          | No general event-horizon integral or total entropy/free-energy budget                 |
| Uncertainty         | Seeded draws, covariance/posterior input, 68%/95% and selected intervals      | No likelihood fitting or actual-fate probabilities                                    |
| Sensitivity         | Computed local finite differences                                             | Not global Sobol indices or a universal parameter ranking                             |
| Sweeps              | Two-dimensional bounded dark-energy grid                                      | Not arbitrary higher-dimensional inference                                            |
| Interventions       | Multiple timed events; some matched tails                                     | Inconsistent or unsupported continuations stop explicitly                             |
| Comparisons         | Four in-memory complete runs, multiple graph quantities, export               | First series overlaid for multiseries quantities; inspect/export full runs separately |
| Provenance          | Reviewed, bundled primary-source registry and raw research snapshots          | No automatic ingestion of new papers or posterior chains                              |
| Reports             | JSON, CSV, SVG and Markdown                                                   | No PDF/Word generator or DOI registration                                             |

“Research software preview” describes this scope honestly. Successful unit tests are not external scientific peer review. Features beyond these boundaries require additional mathematical formulation and independent validation, rather than cosmetic controls with no physical implementation.
