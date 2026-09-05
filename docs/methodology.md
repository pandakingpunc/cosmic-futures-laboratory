# Mathematical and numerical methodology

## Domain, units and initial state

The model starts **today**, with scale factor a=1 and elapsed proper time Δt=0. It does not infer the Big Bang age. H₀ is in km s⁻¹ Mpc⁻¹; a Julian year is 31,557,600 s and one Mpc is 3.0856775814913673×10²² m. The internal dimensionless time is τ=H₀Δt, with H₀ converted to yr⁻¹.

Let u_i=ρ_i/ρcrit,0 and x=ln a. The Friedmann constraint is

```
E² = (H/H₀)² = (Ωb+Ων) exp(−3x) + uDM + ur + ude + Ωk exp(−2x).
```

Curvature is a signed geometric term. Negative vacuum density is permitted. Ordinary matter and radiation must be nonnegative. Input closure must satisfy |ΣΩ−1|≤10⁻⁵; the UI offers an explicit closure action and never silently renormalizes deterministic inputs.

Massive neutrinos are pressureless for this future-only domain. Radiation is specified independently; the explicit UI derivation estimates photons plus effective massless species. It does not double count all three neutrinos as simultaneously massive matter and massless radiation. This is not a Boltzmann neutrino calculation. Neff alone does not change the trajectory unless the user updates Ωr explicitly.

## Dark energy

The engine integrates d ln|ude|/dx = −3(1+w), retaining a separate sign. Zero dark energy remains absent.

| Model                 | Equation                              | Interpretation                                       |
| --------------------- | ------------------------------------- | ---------------------------------------------------- |
| Cosmological constant | w=−1                                  | Model assumption, not a measured future law          |
| Constant w            | user-selected w                       | Quintessence-like or phantom phenomenology           |
| CPL                   | w=w₀+wₐ(1−a)                          | Observational fit ansatz; generally divergent future |
| Bounded continuation  | w=w₀+wₐ(1−1/a)                        | Explicit phenomenological future law                 |
| Custom                | restricted arithmetic in a or z=1/a−1 | No general asymptotic classification                 |

The custom parser permits arithmetic, powers and seven scalar functions. It does not use `eval`, dynamic code compilation, property access or JavaScript execution. Expressions are bounded in length and magnitude; a finite sampling check cannot certify their behavior at every future scale.

## Conservative dark-matter transfers

Use comoving donor C=uDM a³ and daughter R=ur a⁴. For decay Γ=1/τDM, the donor is evaluated exactly as C=C₀exp(−ΓΔt). Radiation obeys dR/dx=a ΓC/H. This removes explicit donor-decay stiffness and supports initially zero daughter radiation.

For annihilation with dimensionless A, J'=A exp(−3x)/E and C=C₀/(1+C₀J). Its paired radiation source is a A C² exp(−3x)/E. For the phenomenological interaction Q=ξHρDM, C=C₀exp(−ξx), R'=aξC. Each source is calculated once and used with opposite signs in the physical continuity equations, so ΣQ=0. Modes are alternatives, not an arbitrary simultaneous particle model.

The warm-fluid model has constant wDM in [0,1/3] and C=C₀exp(−3wDMx). It does not compute free streaming or a matter transfer function. The microscopic identity of dark matter is not inferred.

## Adaptive integration and interpolation

The expansion state is [τ,R,ln|ude|,J]. A seven-stage Dormand–Prince embedded 5(4) step estimates local RMS error with scale atol+rtol·max(|y_old|,|y_new|). A failed step is reduced; no independently clipped negative density is accepted. Maximum scale-factor step is 0.1. Default rtol=10⁻⁸ and atol=10⁻¹¹ are numerical settings, not observational uncertainty.

Output samples are reconstructed inside accepted steps by refining τ(x) and taking a partial RK step. Rejection counts, accepted error norms, numerical reach and regime labels are retained. Minimum-step or work-budget limits are reported. Rejection heuristics are **not a rigorous stiffness detector**, and there is no general implicit-solver fallback in this version.

For stable constant-fluid models with negative vacuum energy or closed curvature, a regular time equation evolves [a,v=da/dτ] in u=ln(1+τ):

```
da/du = exp(u) v
dv/du = −0.5 exp(u) a [um + 2ur + (1+3w)ude].
```

This crosses v=0 naturally. The turnaround root is refined within an accepted step. Friedmann residual |v²/a²−Σui|/Σ|ui| is independently monitored. Integration stops at a<10⁻⁴ on collapse, before the actual singularity; it does not compute quantum gravity. Other model families may report an unresolved boundary.

## Matched extreme-future continuation

Numerical expansion reaches at most x=60. A single-fluid tail is used only when its fractional dominance exceeds 1−10⁻⁸ and the supported model ensures future competitor ratios cannot grow. Bounded-w asymptotes use the known analytic limit; merely sampling w≈−1 does not establish de Sitter behavior. Unknown/CPL future behavior does not receive an invented tail.

For density exponent n=3(1+w), p=n/2 and an anchor E*,a*, the tail is

```
Δln a = log(1+p E* Δτ)/p       (p ≠ 0)
Δln a = E* Δτ                 (p = 0).
```

For p<0, the denominator vanishes at finite Δτ=−1/(pE*): no sample is extended beyond that boundary. A high H alone is not the classification criterion. Single-fluid parameters are matched at the numerical anchor; subdominant-density output may be unavailable if conservative daughter injection is not continued in detail.

At 10^1000 yr, even log₁₀a can overflow for a de Sitter solution. The interface preserves signed log₁₀(1+|log₁₀a|). Fields that cannot be represented safely are null, with the regime and field dictionary explaining the limitation. This coordinate is a display transform, not a new physical observable.

## Custom interventions

The sandbox is off by default. Timed w, G and positive vacuum-density changes can be matched when their new segment retains proven dominance. Halt, forced reversal, unsupported lifetime-history changes, sign flips and lost dominance return explicit model boundaries when a consistent continuation is unavailable. A discontinuous intervention may require external energy or momentum; using a new Friedmann coefficient does not establish a covariant modified-gravity theory. No vacuum post-decay universe is asserted.

G changes are supported only for flat models; curved models stop at the intervention because curvature is independent of the gravitational coupling and requires separate matching. H₀ is restricted to 10⁻⁶–1000 km/s/Mpc for numerical support. Simultaneous actions are processed at one boundary in listed order. Events outside the requested interval are not executed. A later vacuum clock cannot supersede an earlier physical termination.

The G intervention changes the background expansion coefficient only. Black-hole and particle tracer constants retain their stated reference values; a fully coupled varying-constants theory is not implemented.

The contraction branch is reconstructed on logarithmic elapsed-time samples, including the refined turnaround. Statistical interpolation excludes the separate `isPresent` sentinel, so the present day is never treated as an elapsed year.

## Astrophysical and thermodynamic tracers

The stellar logistic proxy has chosen midpoint log₁₀yr=12.5 and slope 1.4. It illustrates broad eras motivated by Adams & Laughlin, not an inferred star-formation history. Proton/electron survival exp(−Δt/τ) is comoving survival; it does not change homogeneous fluid densities. A numeric zero can represent underflow.

The Hawking blackbody estimates use T=ℏc³/(8πGkBM) and τ=5120πG²M³/(ℏc⁴), yielding about 2.10×10⁶⁷(M/M☉)³ yr. M/M₀=(1−Δt/τ)^(1/3) until the semiclassical endpoint. The stable-remnant option imposes a Planck-mass floor. Accretion, greybody factors, spin, mergers and additional particle species are omitted. CMB/Hawking temperature crossings are diagnostics, not accretion solutions.

Tγ=Tγ,0/a is independent of nonthermal daughter radiation. Horizon entropy is shown only in the de Sitter limit, in units of kB; no total entropy or uniquely defined free-energy budget is claimed. A general event-horizon integral is not supplied, and the plotted Hubble radius should not be substituted for it.

## Statistical interpretation

Independent Gaussian or equal-variance uniform draws illustrate sensitivity. A user may supply a positive-definite 4×4 covariance or posterior rows ordered [H₀,Ωm,w₀,wₐ]. Density ratios are held fixed and Ωde is explicitly derived by closure in each draw. Invalid draws are counted without silent resampling. Bands report the number of branches still resolved at each time and condition on survival.

Fate frequencies depend on the chosen model, priors, widths, covariance and numerical domain. They are not probabilities of the actual ultimate fate. Sensitivity measures central finite differences of the displayed expansion coordinate at min(endpoint,10¹¹ yr); its perturbation units and step sizes are reported. The bounded-model sweep solves each grid cell and shows unresolved states rather than assigning them an arbitrary fate.
