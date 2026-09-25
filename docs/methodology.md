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

The engine integrates d ln|ude|/dx = −3(1+w), retaining a separate sign. Zero dark energy remains absent: its w(a) is then neither evaluated nor range-checked and samples report w as null. Constant, CPL and bounded laws require |w₀| ≤ 10⁵, and the bounded limit |w₀+wₐ| ≤ 10⁵.

| Model                 | Equation                              | Interpretation                                       |
| --------------------- | ------------------------------------- | ---------------------------------------------------- |
| Cosmological constant | w=−1                                  | Model assumption, not a measured future law          |
| Constant w            | user-selected w                       | Quintessence-like or phantom phenomenology           |
| CPL                   | w=w₀+wₐ(1−a)                          | Observational fit ansatz; its future is continued only by proof and labelled a literal extrapolation |
| Bounded continuation  | w=w₀+wₐ(1−1/a)                        | Explicit phenomenological future law                 |
| Custom                | restricted arithmetic in a or z=1/a−1 | No general asymptotic classification                 |

The custom parser permits arithmetic, powers and seven scalar functions. It does not use `eval`, dynamic code compilation, property access or JavaScript execution. Expressions are bounded in length and magnitude; a finite sampling check cannot certify their behavior at every future scale.

## Conservative dark-matter transfers

Use comoving donor C=uDM a³ and daughter R=ur a⁴. For decay Γ=1/τDM, the donor is evaluated exactly as C=C₀exp(−ΓΔt). Radiation obeys dR/dx=a ΓC/H. This removes explicit donor-decay stiffness and supports initially zero daughter radiation; for lifetimes far shorter than 1/H₀ the daughter source can still demand steps below the solver minimum. A run that resolves less than one elapsed year reports only the present state, a numerical reach of zero and that reason, never negative log-time coordinates.

For annihilation with dimensionless A, J'=A exp(−3x)/E and C=C₀/(1+C₀J). Its paired radiation source is a A C² exp(−3x)/E. For the phenomenological interaction Q=ξHρDM, C=C₀exp(−ξx), R'=aξC. Each source is calculated once and used with opposite signs in the physical continuity equations, so ΣQ=0. Modes are alternatives, not an arbitrary simultaneous particle model.

The warm-fluid model has constant wDM in [0,1/3] and C=C₀exp(−3wDMx). It does not compute free streaming or a matter transfer function. The microscopic identity of dark matter is not inferred.

## Adaptive integration and interpolation

The expansion state is [τ,R,ln|ude|,J]. A seven-stage Dormand–Prince embedded 5(4) step estimates local RMS error with scale atol+rtol·max(|y_old|,|y_new|). A failed step is reduced; no independently clipped negative density is accepted. The last stage of an accepted step, f(x+h, y_{n+1}), is reused as the first stage of the next step (first same as last), also after a rejection; it is recomputed whenever an intervention changes the model. Stage sums keep a fixed summation order, so on the same platform the restructured step reproduced the 0.2.0 trajectories bit for bit while evaluating the right-hand side about one-seventh less often. Maximum scale-factor step is 0.1. Default rtol=10⁻⁸ and atol=10⁻¹¹ are numerical settings, not observational uncertainty.

Output samples are reconstructed inside accepted steps by refining τ(x) with a bracketed Newton iteration (dτ/dx = 1/E is available from the ODE) that terminates at floating-point resolution, then taking a partial RK step to that x. `samples` sets this base grid, even in log time; event-resolving samples may be added: about samples/4 samples even in ln a when a phantom asymptote packs the approach to a Big Rip into the last log-time interval, and as many about evenly in log a between the turnaround and a=10⁻⁴ of a collapse. Located events (below) add one sample each. After the present sentinel, sample times strictly increase: approaching a Big Rip, τ reaches its limit in floating point before ln a does, so the phantom samples are spread only up to the first node whose log time already equals the final one, and any sample whose log₁₀ time equals its predecessor's is dropped. This is a representation limit of double precision (about 16 significant digits in elapsed time), not a property of the model. If a sample cannot be reconstructed, the run ends as limited at the last reconstructed sample. Rejection counts, accepted error norms, numerical reach and regime labels are retained. Minimum-step or work-budget limits are reported. Rejection heuristics are **not a rigorous stiffness detector**, and there is no general implicit-solver fallback in this version.

An optional work budget counts right-hand-side evaluations across all runs of an analysis and stops it with an explicit error when exhausted; it never changes the arithmetic, and unbudgeted runs are unaffected.

For stable constant-fluid models with negative vacuum energy or closed curvature, a regular time equation evolves [a,v=da/dτ] in u=ln(1+τ). A closed model stays on the expanding branch when its expansion provably never halts: with positive constant-w fluids, a²E² is a convex sum of exponentials in ln a plus the curvature constant, so its minimum decides whether H² stays positive. Closed models with a CPL law of wₐ < 0 always recollapse (see the CPL continuation below) and use the same equation with the closed-form ρde(a) and weight 1+3w(a) in place of (1+3w)ude. Only events that execute within the requested interval select the solver:

```
da/du = exp(u) v
dv/du = −0.5 exp(u) a [um + 2ur + (1+3w)ude].
```

This crosses v=0 naturally. The turnaround root is refined within an accepted step, and so is a later bounce, where a negative stiff component reverses the contraction. The acceleration equation then depends on a alone, so the solution is time-reversible and is classified as an oscillating classical solution; only the first turnaround and bounce are listed as events. Friedmann residual |v²/a²−Σui|/Σ|ui| is independently monitored, and a velocity root is accepted as a turnaround or bounce only where the constraint confirms that Σui vanishes there to the trusted residual 10⁻⁴; otherwise the sign change is integration drift, the branch stops as limited with that reason and no turning-point event is reported. Integration stops at a<10⁻⁴ on collapse, before the actual singularity; it does not compute quantum gravity. A turnaround within the first elapsed year is shown at one year. Other model families may report an unresolved boundary.

## Floating-point reproducibility

Every power in the engine goes through `src/science/core/pow.ts`. JavaScript's `**` and `Math.pow` are not used there. V8 evaluates them with the operating system's C library, whose last-bit rounding differs between Linux and Windows. The integration can amplify such a difference: beside the bounce of a closed oscillating model, where H nearly vanishes, it grew to 0.012 in log₁₀ H.

`pow10(x)` and `powPortable(a, b)` use only IEEE 754 arithmetic (+, −, ×, ÷ and √, which round correctly on every platform), exact operations such as `Math.round`, and the bits of the IEEE representation. They call no `Math.exp`, `Math.log` or `Math.pow`:

- a table of e^(j/64), |j| ≤ 23, is built at load time from its Taylor series in double-double arithmetic (Dekker's algorithms, without FMA);
- ln a = k·ln 2 + j/64 + ln(1 + u) is formed from the IEEE exponent k, the table entry nearest to the mantissa and a series for ln(1 + u), |u| < 0.0081, in double-double, to about 2⁻⁶⁸ relative;
- b·ln a is formed as an exact double-double product;
- e^t is reduced by multiples of ln 2 and by the same table to |t| ≤ 1/128 + 2⁻²⁰, summed as a polynomial to t⁸ and rounded once; a subnormal result is rounded once, directly onto its grid;
- a² is the correctly rounded product a·a, other integer exponents with |b|·(|e| + 1) ≤ 900 (e the binary exponent of a) use binary powering in double-double, and b = ½ is √a.

The results are nearly correctly rounded. All 2,451 exact reference powers from Python's `decimal` module (`tests/reference/pow.json`) are correctly rounded, subnormal results and results that round to zero included, and a sweep of 168,000 further inputs found one result 0.50001 ulp from the exact value ([validation](validation.md#platform-independent-powers)). Integer powers are exact whenever the result is representable, and the special cases (NaN, ±0, ±∞, negative bases) follow the `**` operator. An exact tie, where the exact power lies halfway between two doubles (possible only for special inputs such as integer powers of powers of two), may round to either neighbour instead of to even when it takes the exp(b·ln a) path: `powPortable(2 ** -43, 25)` gives 5e-324, whereas 2⁻¹⁰⁷⁵ rounds to 0.

Custom w(a) equations may use tanh. It is evaluated by `tanhPortable` (`src/science/core/numeric.ts`), fdlibm's formula on `Math.expm1`, which gives the bits of `Math.tanh` in Node.js 24; newer V8 versions take `Math.tanh` from the operating system's C library. `npm run check:arch` rejects `**` and `Math.pow` in `src/science`, `components/` and `app/` (the interface derives Ωr), and `Math.tanh` in `src/science`.

The engine's other `Math` functions (exp, expm1, log, log10, log1p, sin, cos) are V8's own fdlibm ports in Node.js 24 and give the same bits on Linux and Windows; a committed digest checks this in CI. Newer V8 versions, for example in Chrome 153, compute them with a compiled-in LLVM libc instead. That is the same on every system but not bit-identical to Node.js 24, so a browser or the Cloudflare Workers runtime (workerd) with such an engine reproduces the committed outputs only approximately ([scope](scope.md)).

## Event location

Matter–dark-energy equality, the CMB/Hawking temperature crossings and the fall of the CMB below the de Sitter horizon temperature are located on the continuous solution, not on the output grid, so their times do not depend on `samples` or the endpoint.

- **Expanding branch.** Each criterion is evaluated at the accepted nodes: equality as g = ln(ρm/ρde) for positive dark energy (every sign change, ids `equality`, `equality-2`, …); the horizon temperature as g = log₁₀Tγ − log₁₀T_GH. A sign change between two nodes is refined by an Illinois (modified regula falsi) iteration in x = ln a on states from partial Dormand–Prince steps from the earlier node, exactly as output samples are computed, until the bracket is 4ε·max(1,|x|) wide. The CMB/Hawking crossing is known in closed form, x* = ln(Tγ,0/T_H), so only τ(x*) needs one partial step. A sign change across an intervention is placed at its time. Two crossings inside one accepted step (Δln a ≤ 0.1) cancel and are not reported. Where a partial step fails inside an accepted step (the model is undefined somewhere between its nodes), that step's crossings are not located and a result warning says so; the search continues after it.
- **Matched tail.** The tail law is inverted analytically in log space: Δt = (e^{pΔx}−1)/(pE*) for p = n/2 ≠ 0 (evaluated as pΔx/ln10 − log₁₀(pE*) once pΔx > 700) and Δx/E* for p = 0, with the anchor time added by a log-sum. Each piece between tail interventions is inverted with its own anchor, rate and exponent.
- **Time-domain branch.** Every passage of a through a target scale factor is bracketed between accepted points and refined in u = ln(1+τ) by the same iteration on partial steps: a* for the CMB/Hawking crossings and a_eq = (M/Ωde)^{1/(3−n)} for equality; for a CPL law ln(ρm/ρde) = ln(M/Ωde) + 3(w₀+wₐ)ln a − 3wₐ(a−1) is convex in ln a for wₐ < 0, and its at most two roots are found on a scan of ln a ∈ [−10, 30] with bisection, so the equalities that recur as ρde returns during a collapse are located too. A rising passage is a `cool-M` event, a falling one a `warm-M` event (the CMB again hotter than the hole). Repeated crossings are numbered (`cool-M-2`, `equality-2`, …). As on the expanding branch, two passages inside one accepted step (Δu ≤ 0.02) cancel, for example a target just below the maximum scale factor.

Only real sign changes after the present are events: a hole already hotter than the CMB today (M < 2.26×10⁻⁸ M☉ for Tγ,0 = 2.7255 K) never receives a `cool` event, and a crossing within the first year is shown at one year with a note. Each located time with at least one elapsed year also receives its own output sample, so plots and CSV rows contain the exact state at the event. For result files written without located times, `cosmicEvents` falls back to real sign changes between consecutive samples, reported at the later sample. Compared with the former first-sample-after rule, the regenerated 100-sample examples report CMB/Hawking crossings up to 0.15 dex earlier and the DESI CPL equality 0.17 dex earlier; on coarse grids or at the first tail sample the former times were up to 1.1 dex late. The locator itself is exact to rounding on the numerical solution, so the times carry the integration tolerance: the validated closed-form and SciPy cases agree within 1.5×10⁻¹⁰ dex (see validation), while an independent SciPy check at the default rtol = 10⁻⁸ gives 6×10⁻¹⁰ dex for the DESI CPL equality and 1.6×10⁻⁹ dex for a crossing after a classical bounce (2×10⁻¹¹ dex at rtol = 10⁻¹⁰). Where output reconstruction fails, events before the last reconstructed time still receive their samples.

## Matched extreme-future continuation

Numerical expansion reaches at most x=60. A single-fluid tail is used only when its fractional dominance exceeds 1−10⁻⁸ and the supported model ensures future competitor ratios cannot grow. The dominant term is the positive component with the smallest exponent; components sharing that exponent form one fluid, subdominant constant-w dark energy is carried along, and negative curvature or vacuum terms must dilute faster. Bounded-w asymptotes use the known analytic limit; merely sampling w≈−1 does not establish de Sitter behavior, and deviations of w₀+wₐ from −1 at the rounding level of the inputs are treated as −1. A run that ends inside the numerical segment is classified by the same asymptote. An exponent of 2 (curvature or w=−1/3) is coasting expansion. Custom laws never receive an invented tail, and a CPL law only through one of the proofs below.

For density exponent n=3(1+w), p=n/2 and an anchor E*,a*, the tail is

```
Δln a = log(1+p E* Δτ)/p       (p ≠ 0)
Δln a = E* Δτ                 (p = 0).
```

For p<0, the denominator vanishes at finite Δτ=−1/(pE*): no sample is extended beyond that boundary. A high H alone is not the classification criterion. Single-fluid parameters are matched at the numerical anchor; subdominant-density output may be unavailable if conservative daughter injection is not continued in detail.

### Proof-based continuation of CPL laws

The CPL law w(a)=w₀+wₐ(1−a) (Chevallier & Polarski 2001; Linder 2003) is a fit ansatz for the observed expansion history. Its density has the closed form

```
|ρde|/ρcrit,0 = |Ωde| a^(−3(1+w₀+wₐ)) exp(3wₐ(a−1)),   ln|ude| = ln|Ωde| − 3(1+w₀+wₐ)x + 3wₐ(eˣ−1).
```

The integrated ln|ude| follows it to 4.4×10⁻¹⁰ dex at rtol=10⁻⁸ (5×10⁻¹³ at 10⁻¹²). Because w(a) is monotonic, one accepted state can settle the whole future. Each accepted CPL state is tested against two theorems, but only while the law in force is CPL with wₐ≠0 and no custom event changes w or the vacuum density; the Big Rip proof also needs every custom event to have executed. CPL with wₐ=0 is the constant-w law bit for bit and uses its asymptote. Fates reached this way carry the label "· literal CPL extrapolation" and an explanation that they follow from extrapolating the fit ansatz to arbitrarily large a: a mathematical consequence, not a prediction. `derived.cplContinuation` records the theorem, the state where it was verified and the rip time.

**Extinction (wₐ<0).** w(a) grows without bound. Theorem: once w≥1/3, every later w(a)≥1/3≥wᵢ of each other supported group: baryons and stable dark matter 0, warm dark matter ≤1/3, radiation 1/3, curvature −1/3, and decaying, annihilating or interacting dark matter together with the radiation it feeds, whose sum has an effective w in [0,1/3] because the transfer conserves it. So d ln(|ρde|/ρᵢ)/d ln a = −3(w−wᵢ) ≤ 0. In a flat or open model every other term of E² is positive and the expansion never halts, so |Ωde| can never grow again. At the first accepted state with w≥1/3 and |Ωde|(1+3w) < ε, with ε=10⁻²⁰, the dark energy is dropped (event `de-extinct`, a second node at the same ln a). The branch continues under the existing rules for absent dark energy: numerically to ln a=60, then the matched matter or curvature tail for stable or warm dark matter, or an explicit limited stop for transfer models. The error bounds are:

- E², hence H, a(t) and τ(a), changes by less than ε/2 relative at the drop and ever after, which is invisible at double precision.
- The omitted term ½(1+3w)Ωde of q starts below ε/2. With K=3|wₐ|a at the drop and Δ=ln(a/a_drop), Ωde falls at least like exp(−K(e^Δ−1−Δ)) while 1+3w grows at most like 1+K(e^Δ−1)/2 relative. The term therefore never exceeds ε(1.02+0.52√K)/2.
- Samples at the same times agree to 10⁻¹² for ε=10⁻²⁰ and 10⁻³⁰ (tests). After the drop, samples report dark energy as absent: `logRhoDE` and `w` are null and Ωde is 0.

The DESI 2026 preset (w₀=−0.821, wₐ=−0.65) reaches w=1/3 at a=2.776. It drops its dark energy at a=38.75, 10^12.61 yr after today, where w=23.7 and Ωde=2.4×10⁻²⁵. The drop is placed at an accepted step, so its time is a numerical checkpoint, not a physical epoch: |Ωde|(1+3w) itself falls below 10⁻²⁰ at a=35.22 (10^12.542 yr), and at rtol=10⁻¹² the drop moves to a=35.29 (10^12.543 yr) while the trajectory is unchanged. Its flat future is then matter-dominated and decelerating, with no event horizon: "Long-lived decelerating expansion · literal CPL extrapolation". SciPy quadrature of the closed-form E(x) reproduces its τ(a) through the drop and the matter tail to 4.8×10⁻¹⁰ in log₁₀ a.

The theorem needs a to keep growing, so it is not applied to closed models. A closed model must turn around once its CPL dark energy dies out, and ρde, a function of a alone, grows back on the contracting branch. A closed CPL model with wₐ<0, stable dark matter and no custom events is therefore integrated from today in proper time with the closed-form ρde(a). This covers turnarounds before or after the dark energy becomes negligible, and the collapse in which ρm=ρde twice more. Other closed cases stop as limited where the extinction conditions are met, with that reason. The turnaround time carries the constraint drift of the proper-time solver: 2.3×10⁻⁹ dex at rtol=10⁻⁸ for a turnaround at a=313, and at most 2.6×10⁻¹⁰ dex for the turnaround and the collapse equalities of the Ωk=−0.01 golden case (validation). The drift grows when a long accelerated phase precedes a late turnaround: v²−a²Σuᵢ is a first integral of the acceleration equation, so an error committed while v=da/dτ is large persists as an effective curvature term that is large relative to the small densities at the turnaround. For Ωk=−10⁻⁴ and wₐ=−0.01 (turnaround at a≈3100) the reported residual is 2.4×10⁻⁶ and the turnaround time is off by 3.3×10⁻⁶ dex (7.6×10⁻⁸ dex at rtol=10⁻¹²). A turning point whose residual exceeds 10⁻⁴ is not asserted and the run stops as limited, as for the DESI law with |Ωk| ≤ 10⁻⁸.

**Big Rip (wₐ>0).** w decreases without bound. Theorem: take an accepted state with w≤−1, positive dark energy, and the other components' |fractions| summing to at most 10⁻⁸. From then on ρde never decreases while every other density never increases; conservative transfers keep ρdm+ρr non-increasing. So E² ≥ ude(1−10⁻⁸(1+10⁻⁸)) > 0, and ln ude ≈ 3wₐa. The remaining proper time ∫dx/E therefore converges: a, H, ρde and |p| diverge at a finite time, a Type I (Big Rip) singularity in the classification of Nojiri, Odintsov & Tsujikawa (2005).

The numerical branch stops at that state and E(x) is continued in closed form: the CPL density plus the other components at their constant exponents. This is exact for stable and warm dark matter. For transfer models, their mutual exchange after this state, below 10⁻⁸ of E², is neglected, as in the matched tails, and their radiation density is reported as null.

The remaining time is integrated on adaptive Gauss–Kronrod 7–15 panels. A panel is accepted when |Kronrod−Gauss| ≤ 10⁻¹²·Kronrod. Integration stops when the last panel and the bound f(b)/λ(b) on the rest (f=1/E, λ=−d ln f/dx, ln f concave) are both below 10⁻¹⁸ of the total. Output samples (regime `asymptotic`) follow the tail's log-time grid. Where the rip lies within the interval, about samples/4 more are placed evenly in ln a, up to the last ln a whose log₁₀ time still differs from the rip's. Each time is found by inverting the integral with a bracketed Newton iteration. Samples stop strictly before the singularity (event `rip`, status terminated). Samples that would need |w|>10⁵ stop with a warning; the rip time is unaffected.

For the DESI base with (w₀,wₐ)=(−0.9, 0.3) and (−1.1, 0.2), the rips fall 25.9158799 and 23.3486282 Gyr after today. SciPy quad of ∫₀^∞dx/E agrees to 2×10⁻¹¹ and 1×10⁻¹⁰ relative at rtol=10⁻⁸, and to 1.2×10⁻¹⁴ and 9×10⁻¹⁴ at rtol=10⁻¹².

Not covered: flat or open models whose negative CPL dark energy halts the expansion, and closed models with wₐ>0 that turn around before the dark energy dominates. Both stop at their numerical boundary, as before.

At 10^1000 yr, even log₁₀a can overflow for a de Sitter solution. The interface preserves signed log₁₀(1+|log₁₀a|). Fields that cannot be represented safely are null, with the regime and field dictionary explaining the limitation. This coordinate is a display transform, not a new physical observable.

## Custom interventions

The sandbox is off by default. Timed w, G and positive vacuum-density changes can be matched when their new segment retains proven dominance. Halt, forced reversal, unsupported lifetime-history changes, sign flips and lost dominance return explicit model boundaries when a consistent continuation is unavailable. A discontinuous intervention may require external energy or momentum; using a new Friedmann coefficient does not establish a covariant modified-gravity theory. No vacuum post-decay universe is asserted.

G changes are supported only for flat models; curved models stop at the intervention because curvature is independent of the gravitational coupling and requires separate matching. H₀ is restricted to 10⁻⁶–1000 km/s/Mpc for numerical support. Simultaneous actions are processed at one boundary in listed order. Events outside the requested interval are not executed and do not change the solver. Halt, reversal and nonpositive G stop the branch with the same status and reason in the numerical segment and the matched tail. A later vacuum clock cannot supersede an earlier physical termination.

The G intervention changes the background expansion coefficient only. Black-hole and particle tracer constants retain their stated reference values; a fully coupled varying-constants theory is not implemented.

The contraction branch is reconstructed on logarithmic elapsed-time samples, including the refined turnaround. Statistical interpolation excludes the separate `isPresent` sentinel, so the present day is never treated as an elapsed year.

## Astrophysical and thermodynamic tracers

The stellar logistic proxy has chosen midpoint log₁₀yr=12.5 and slope 1.4. It illustrates broad eras motivated by Adams & Laughlin, not an inferred star-formation history. Proton/electron survival exp(−Δt/τ) is comoving survival; it does not change homogeneous fluid densities. A numeric zero can represent underflow.

The Hawking blackbody estimates use T=ℏc³/(8πGkBM) and τ=5120πG²M³/(ℏc⁴), yielding about 2.10×10⁶⁷(M/M☉)³ yr. M/M₀=(1−Δt/τ)^(1/3) until the semiclassical endpoint. The stable-remnant option imposes a Planck-mass floor. Accretion, greybody factors, spin, mergers and additional particle species are omitted. CMB/Hawking temperature crossings are diagnostics, not accretion solutions.

Tγ=Tγ,0/a is independent of nonthermal daughter radiation. The de Sitter horizon entropy S=πR²c³/(ħ·gG) (units of kB, R=c/H) and the Gibbons–Hawking temperature T_GH=ħH/(2πkB) are reported only under an explicit de Sitter criterion: positive dark energy whose w equals −1 to rounding (|1+w| ≤ 8ε times one plus the magnitude of the law's parameters, the same snap as the tail asymptote) and whose density fraction is within 10⁻⁸ of unity, the tail threshold; in the matched tail, exactly when its exponent is n=0. Elsewhere both are null. S uses the coupling G_eff=gG in force; T_GH depends on G only through H, so S·T_GH²·g is constant. The event “CMB photons fall below the de Sitter horizon temperature” is the first fall of Tγ below ħH/(2πkB) at which the criterion holds; in the de Sitter tail it lies at ln a = ln(Tγ,0/T_GH) (for the Planck preset T_GH=2.196×10⁻³⁰ K, a≈1.24×10³⁰, about 10^12.08 yr). The horizon radiation is not added to the background, and no total entropy or uniquely defined free-energy budget is claimed. A general event-horizon integral is not supplied, and the plotted Hubble radius should not be substituted for it.

All physical constants come from one module with CODATA 2018 values (c, h, kB exact, so ħ=h/2π is exact; G=6.67430×10⁻¹¹ m³ kg⁻¹ s⁻² with relative uncertainty 2.2×10⁻⁵), the IAU megaparsec and the tracer solar mass 1.98847×10³⁰ kg. The ideal lifetime coefficient keeps its 0.1.0 rounding, log₁₀ τ☉ = 67.321325469, 1.7×10⁻⁹ dex below the formula.

Black holes must fit the background. For a positive cosmological constant (Λ, or constant w=−1) with H_Λ=H₀√Ωde, the largest Schwarzschild–de Sitter black hole has the Nariai mass M_N=c³/(3√3 G H_Λ), where f(r)=1−2GM/(c²r)−H_Λ²r²/c² has a double root at r=c/(√3H_Λ) (2.16×10²² M☉ for the Planck preset). Every model is also limited to the mass c³/(2GH₀) whose Schwarzschild radius equals today's Hubble radius (4.65×10²² M☉ at H₀=67.36). Validation rejects masses above the smaller bound, reported as `derived.blackHoleMassLimit` with `derived.nariaiMass`, and warns above 10⁻³ of it, where the horizons are no longer negligible; this warning threshold is an order-of-magnitude criterion. The ideal evaporation estimate also requires net emission, T_H > T_GH, i.e. M < c³/(4GH_Λ) = (3√3/4)M_N; the Nariai bound implies it for every accepted mass, but near it the isolated-hole estimate ignores the horizon interaction and absorption of horizon radiation. Sandbox G or vacuum changes do not re-evaluate these bounds.

## Statistical interpretation

Independent Gaussian or equal-variance uniform draws illustrate sensitivity. A user may supply a positive-definite 4×4 covariance or posterior rows ordered [H₀,Ωm,w₀,wₐ]; posterior resampling draws only the row index. Density ratios are held fixed and Ωde is explicitly derived by closure in each draw. Analyses validate their base configuration and options. Seeds are integers from 0 to 2³²−1, and each run's vacuum clock takes its seed from a stream separate from the parameter draws. Draws of parameters that the selected dark-energy law does not read are reported as having no effect. Invalid draws are counted without silent resampling. Bands report the number of branches still resolved at each time and condition on survival.

Fate frequencies depend on the chosen model, priors, widths, covariance and numerical domain. They are not probabilities of the actual ultimate fate. Sensitivity measures central finite differences of the displayed expansion coordinate at min(endpoint,10¹¹ yr), with the H₀ and Ωm steps limited to half their values; when one probe is invalid it falls back to a one-sided difference against the unperturbed run. Perturbation units, step sizes and the scheme are reported, and rows without a response sort last. The bounded-model sweep solves each grid cell and shows unresolved states rather than assigning them an arbitrary fate.
