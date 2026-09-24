import sourceRegistry from '../../data/observations/sources.json';
import { flattenControl } from './core/text';
import type { DerivedQuantities, Result } from './types';
export function csv(r: Result): string {
  if (!r.samples.length) return '';
  const fields = Object.keys(r.samples[0]);
  return (
    fields.join(',') +
    '\n' +
    r.samples
      .map((s) =>
        fields
          .map((f) => {
            const v = s[f as keyof typeof s];
            return Array.isArray(v) ? '"' + v.join(';') + '"' : (v ?? '');
          })
          .join(','),
      )
      .join('\n')
  );
}
/**
 * Configuration text on one Markdown line: line breaks collapse and Markdown
 * or HTML syntax is escaped, so a name cannot add sections to the report.
 */
const inline = (v: unknown) =>
  flattenControl(String(v))
    .replace(/[\\`*_[\]()#!<>|]/g, '\\$&')
    .slice(0, 400);
/** Derived scalars in one sentence; files without them add nothing. */
function derived(r: Result): string {
  const d = r.derived;
  // An imported file may carry the derived object of another version.
  if (typeof d?.blackHoleMassLimit !== 'number') return '';
  return `\n\nEquality and temperature-crossing times are located on the continuous solution, independent of the output grid. Black-hole masses are limited to ${d.blackHoleMassLimit.toPrecision(4)} M☉: ${typeof d.nariaiMass === 'number' && d.nariaiMass <= d.blackHoleMassLimit ? 'the Nariai mass, the largest Schwarzschild–de Sitter black hole of the cosmological constant' : 'the mass whose horizon is today’s Hubble radius'}.${cplSentence(d.cplContinuation)}`;
}
/** The CPL continuation in one sentence; nothing when none applied. */
function cplSentence(p: DerivedQuantities['cplContinuation']): string {
  if (!p || typeof p !== 'object' || typeof p.logYears !== 'number') return '';
  const at = `10^${p.logYears.toFixed(3)} yr`;
  return p.theorem === 'big-rip'
    ? ` The CPL law is continued literally by proof from ${at}, where w ≤ −1 and dark energy dominates to 10⁻⁸: finite-time Big Rip at ${typeof p.ripLogYears === 'number' ? `10^${p.ripLogYears.toFixed(6)} yr` : 'an unresolved time'} (quadrature of the closed-form density; an extrapolation of the fit ansatz, not a prediction).`
    : ` The CPL dark energy is dropped at ${at}, where w ≥ 1/3 and its density fraction is below the extinction threshold, so it can never grow again (an extrapolation of the fit ansatz, not a prediction).`;
}
export function report(r: Result): string {
  return `# Cosmic Futures Laboratory — Scientific Report\n\n${r.config.sandbox ? '**NONSTANDARD PHYSICS SCENARIO**\n\n' : ''}Generated ${r.metadata.timestamp}\n\n## Simulation Configuration\n\n${inline(r.config.name)}; endpoint 10^${r.config.endLogYears} elapsed years from today (a=1). Configuration hash: ${r.metadata.configurationHash}.\n\n\`\`\`json\n${JSON.stringify(r.config, null, 2)}\n\`\`\`\n\n## Observational Inputs\n\nPreset: ${inline(r.config.preset)}. Dataset ${r.metadata.datasetVersion}. See data/observations/cosmology-constraints.json for source IDs, transformations and covariance limitations. A preset may mix explicitly declared reference composition with reported parameters; it is not a likelihood evaluation.\n\n## Physical Assumptions\n\nFuture-only FLRW background; pressureless massive neutrinos; separately specified radiation. Dark matter: ${r.config.dmModel}. Dark energy: ${r.config.deModel}. Astrophysical populations are tracer approximations.\n\n## Numerical Method\n\n${r.metadata.solver}. rtol=${r.config.rtol}; atol=${r.config.atol}. Accepted steps=${r.diagnostics.acceptedSteps}; rejected=${r.diagnostics.rejectedSteps}. Time-domain Friedmann residual=${r.diagnostics.maxConstraintResidual}.\n\n${r.metadata.equations.map((x) => '- ' + x).join('\n')}\n\nApproximation: ${r.diagnostics.tail ?? 'No matched asymptote used.'}\n\n## Cosmic Evolution\n\n${r.samples.length} samples. Status: ${r.status}.${r.diagnostics.reason ? ' ' + r.diagnostics.reason : ''}${derived(r)}\n\n## Major Events\n\n${r.events.map((e) => `- **${e.title}**: ~10^${e.logYears.toPrecision(3)} yr${e.range ? ` (indicative range 10^${e.range[0]}–10^${e.range[1]} yr)` : ''}. ${e.detail} [${e.reliability}; ${e.sources.join(', ')}]`).join('\n')}\n\n## Ultimate Fate\n\n**${r.classification}**\n\n${r.explanation}\n\n## Uncertainty\n\nThis deterministic trajectory does not assign a probability to the actual cosmic fate. Observational marginal errors do not specify a joint posterior. Ensemble bands, when separately generated, must be exported with their sampling assumptions; they are not embedded in this deterministic report.\n\n## Limitations\n\n${r.warnings.map((w) => '- ' + w).join('\n')}\n\nNull fields explicitly mean absent, undefined, unavailable, or out-of-range quantities; no finite substitute has been fabricated. CMB temperature is redshifted photon temperature; the de Sitter horizon temperature ħH/(2πk_B) is reported separately, only in the explicit de Sitter limit. Black-hole entropy and population proxies are not a total cosmic entropy.\n\n## Reproducibility\n\nSoftware ${r.metadata.version}; data ${r.metadata.datasetVersion}; seed ${r.metadata.seed}. Export the JSON result plus the release source and lockfile.\n\n## References\n\nThe versioned source registry is data/observations/sources.json; full primary-source research snapshots accompany it. Source URLs are also available in the application's Scientific Sources interface.\n\n${sourceRegistry.map((s) => `- ${s.authors} (${s.date}). ${s.title}. ${s.url}${s.doi ? ` — DOI ${s.doi}` : ''}`).join('\n')}\n`;
}
