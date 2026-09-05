import sourceRegistry from '../../data/observations/sources.json';
import type { Result } from './types';
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
export function report(r: Result): string {
  return `# Cosmic Futures Laboratory — Scientific Report\n\n${r.config.sandbox ? '**NONSTANDARD PHYSICS SCENARIO**\n\n' : ''}Generated ${r.metadata.timestamp}\n\n## Simulation Configuration\n\n${r.config.name}; endpoint 10^${r.config.endLogYears} elapsed years from today (a=1). Configuration hash: ${r.metadata.configurationHash}.\n\n\`\`\`json\n${JSON.stringify(r.config, null, 2)}\n\`\`\`\n\n## Observational Inputs\n\nPreset: ${r.config.preset}. Dataset ${r.metadata.datasetVersion}. See data/observations/cosmology-constraints.json for source IDs, transformations and covariance limitations. A preset may mix explicitly declared reference composition with reported parameters; it is not a likelihood evaluation.\n\n## Physical Assumptions\n\nFuture-only FLRW background; pressureless massive neutrinos; separately specified radiation. Dark matter: ${r.config.dmModel}. Dark energy: ${r.config.deModel}. Astrophysical populations are tracer approximations.\n\n## Numerical Method\n\n${r.metadata.solver}. rtol=${r.config.rtol}; atol=${r.config.atol}. Accepted steps=${r.diagnostics.acceptedSteps}; rejected=${r.diagnostics.rejectedSteps}. Time-domain Friedmann residual=${r.diagnostics.maxConstraintResidual}.\n\n${r.metadata.equations.map((x) => '- ' + x).join('\n')}\n\nApproximation: ${r.diagnostics.tail ?? 'No matched asymptote used.'}\n\n## Cosmic Evolution\n\n${r.samples.length} samples. Status: ${r.status}.${r.diagnostics.reason ? " " + r.diagnostics.reason : ""}\n\n## Major Events\n\n${r.events.map((e) => `- **${e.title}**: ~10^${e.logYears.toPrecision(3)} yr${e.range ? ` (indicative range 10^${e.range[0]}–10^${e.range[1]} yr)` : ''}. ${e.detail} [${e.reliability}; ${e.sources.join(', ')}]`).join('\n')}\n\n## Ultimate Fate\n\n**${r.classification}**\n\n${r.explanation}\n\n## Uncertainty\n\nThis deterministic trajectory does not assign a probability to the actual cosmic fate. Observational marginal errors do not specify a joint posterior. Ensemble bands, when separately generated, must be exported with their sampling assumptions; they are not embedded in this deterministic report.\n\n## Limitations\n\n${r.warnings.map((w) => '- ' + w).join('\n')}\n\nNull fields explicitly mean absent, undefined, unavailable, or out-of-range quantities; no finite substitute has been fabricated. CMB temperature is redshifted photon temperature, not the de Sitter horizon thermal response. Black-hole entropy and population proxies are not a total cosmic entropy.\n\n## Reproducibility\n\nSoftware ${r.metadata.version}; data ${r.metadata.datasetVersion}; seed ${r.metadata.seed}. Export the JSON result plus the release source and lockfile.\n\n## References\n\nThe versioned source registry is data/observations/sources.json; full primary-source research snapshots accompany it. Source URLs are also available in the application's Scientific Sources interface.\n\n${sourceRegistry.map((s) => `- ${s.authors} (${s.date}). ${s.title}. ${s.url}${s.doi ? ` — DOI ${s.doi}` : ''}`).join('\n')}\n`;
}
