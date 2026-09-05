'use client';
import { useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  ListTree,
  FileText,
  Activity,
} from 'lucide-react';
import { Badge, Time, format, download } from './controls';
import {
  DATASET_VERSION,
  VERSION,
  type Result,
  type CosmicEvent,
  type Source,
} from '@/src/science/types';
import { presets } from '@/src/science/defaults';
import { BH_TEMPERATURE, blackHoleLifetime } from '@/src/science/astrophysics';
import { csv, report } from '@/src/science/report';
import sourcesData from '@/data/observations/sources.json';
const sources = sourcesData as Source[];
export function TimelinePanel({
  result,
  event,
  select,
}: {
  result: Result;
  event: CosmicEvent | null;
  select: (e: CosmicEvent) => void;
}) {
  const maxTime = result.samples.at(-1)?.logYears ?? result.config.endLogYears;
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">LOGARITHMIC COSMIC CHRONOLOGY</span>
          <h2>From stars to uncertain horizons</h2>
        </div>
        <Badge tone="amber">Conditional event ranges</Badge>
      </div>
      <p>
        Times are elapsed years from today. Event markers combine numerical
        crossings with explicitly labeled astrophysical estimates. They stop at
        the calculated model boundary.
      </p>
      <div className="timeline-ruler">
        <div className="ruler-line" />
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => (
          <span key={v} style={{ left: `${v * 100}%` }}>
            <i />
            <small>{format(v * maxTime, 1)}</small>
          </span>
        ))}
        {result.events.map((e) => (
          <button
            key={e.id}
            aria-label={`${e.title}, log years ${e.logYears}`}
            style={{
              left: `${Math.min(100, (e.logYears / Math.max(1, maxTime)) * 100)}%`,
            }}
            onClick={() => select(e)}
            title={e.title}
          />
        ))}
      </div>
      <p className="fine-print">Position: log₁₀(elapsed years)</p>
      <div className="timeline-layout">
        <div className="timeline-list">
          {result.events.map((e) => (
            <button
              key={e.id}
              className={`timeline-event ${event?.id === e.id ? 'selected' : ''}`}
              onClick={() => select(e)}
            >
              <Time logYears={e.logYears} />
              <div>
                <strong>{e.title}</strong>
                <small>{e.reliability}</small>
              </div>
              <ArrowUpRight size={14} />
            </button>
          ))}
        </div>
        <div className="event-detail">
          {event ? (
            <>
              <Badge
                tone={event.reliability === 'Pure what-if' ? 'amber' : 'blue'}
              >
                {event.reliability}
              </Badge>
              <h2>{event.title}</h2>
              <h3>
                <Time logYears={event.logYears} />
              </h3>
              {event.range && (
                <p>
                  Indicative range: 10^{event.range[0]}–10^{event.range[1]} yr
                </p>
              )}
              <p>{event.detail}</p>
              {event.sources.map((id) => {
                const s = sources.find((s) => s.id === id);
                return s ? (
                  <a key={id} href={s.url} target="_blank" rel="noreferrer">
                    {s.authors} · {s.date} <ArrowUpRight size={12} />
                  </a>
                ) : null;
              })}
            </>
          ) : (
            <>
              <ListTree size={32} />
              <h3>Inspect a cosmic landmark</h3>
              <p>
                Select an event to see its assumptions, reliability and
                scientific sources.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
export function EquationPanel({
  result,
  loadBranch,
}: {
  result: Result;
  loadBranch: (name: string) => void;
}) {
  return (
    <>
      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">EQUATION INSPECTOR</span>
            <h2>The model behind the trajectory</h2>
          </div>
          <Badge tone="blue">Auditable numerical method</Badge>
        </div>
        <p>
          Homogeneous, isotropic FLRW background. Densities refer to
          today&apos;s critical density. Massive neutrinos join pressureless
          matter; photons cool adiabatically even when nonthermal radiation is
          produced.
        </p>
        <div className="equations">
          {result.metadata.equations.map((eq, i) => (
            <div key={eq}>
              <span>({i + 1})</span>
              <code>{eq}</code>
            </div>
          ))}
        </div>
        <div className="method-grid">
          <div>
            <h3>Active model</h3>
            <p>
              Dark energy: {result.config.deModel}
              <br />
              w₀ = {result.config.w0}, wₐ = {result.config.wa}
              <br />
              Dark matter: {result.config.dmModel}
              <br />
              Custom expression:{' '}
              {result.config.deModel === 'custom'
                ? result.config.expression
                : 'inactive'}
            </p>
          </div>
          <div>
            <h3>Numerical diagnostics</h3>
            <p>
              Dormand–Prince 5(4)
              <br />
              Relative tolerance: {result.config.rtol}
              <br />
              Absolute tolerance: {result.config.atol}
              <br />
              Accepted / rejected steps: {result.diagnostics.acceptedSteps} /{' '}
              {result.diagnostics.rejectedSteps}
              <br />
              Max time-domain constraint residual:{' '}
              {format(result.diagnostics.maxConstraintResidual, 9)}
            </p>
          </div>
        </div>
        <p className="diagnostic-note">
          {result.diagnostics.tail ??
            'No matched asymptotic approximation used.'}
        </p>
        <h3>Regime and failure policy</h3>
        <p>
          The expanding solver uses ln(a). Supported constant-fluid recollapse
          branches use a regular time-domain acceleration equation. An explicit
          solver can reach a minimum step in stiff or singular systems; that is
          a numerical boundary, not a physical discovery. Arbitrary CPL/custom
          models do not receive an invented asymptote.
        </p>
        <div className="warning-list">
          {result.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      </div>
      <div className="panel uncertainty-tree">
        <span className="eyebrow">COSMIC UNCERTAINTY TREE</span>
        <h2>One present. Conditional futures.</h2>
        <p>
          These branches are alternatives under different assumptions. Positions
          and colors do not encode probability.
        </p>
        <div className="tree-root">
          Observed expanding Universe
          <br />
          <small>Finite observations · uncertain extrapolation</small>
        </div>
        <div className="tree-branches">
          {[
            {
              name: 'Positive cosmological constant',
              path: 'Persistent vacuum density → accelerated expansion → remnant evolution',
              tone: 'green',
            },
            {
              name: 'Persistent phantom energy',
              path: 'Growing dark-energy density → finite future-time integral → Big Rip',
              tone: 'amber',
            },
            {
              name: 'Negative vacuum energy',
              path: 'Expansion slows → turnaround → classical contraction',
              tone: 'blue',
            },
            {
              name: 'Unknown vacuum stability',
              path: 'Assumed local hazard → branch termination → unknown subsequent physics',
              tone: 'muted',
            },
          ].map((b) => (
            <button key={b.name} onClick={() => loadBranch(b.name)}>
              <Badge tone={b.tone as 'green'}>Conditional branch</Badge>
              <h3>{b.name}</h3>
              <p>{b.path}</p>
              <span>
                Calculate this branch <ArrowUpRight size={14} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
export function SourcesPanel() {
  const [query, setQuery] = useState('');
  const filtered = sources.filter((s) =>
    (s.title + ' ' + s.authors + ' ' + s.dataset)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">SCIENTIFIC SOURCES & MODEL CONFIDENCE</span>
          <h2>Every assumption has a provenance.</h2>
        </div>
        <Badge tone="blue">Reviewed 05 Sep 2026</Badge>
      </div>
      <p>
        The review favors primary sources and keeps dataset combinations
        separate. Newness does not establish reliability. This simulator
        evaluates no likelihood, so it reports no invented AIC, Bayes factor, or
        observational fit score.
      </p>
      <div className="evidence-strip">
        <div>
          <strong>What observations constrain</strong>
          <p>
            Distances, CMB fluctuations, expansion parameters and
            channel-specific particle-stability bounds.
          </p>
        </div>
        <div>
          <strong>What remains unknown</strong>
          <p>
            Far-future dark energy, dark-matter microphysics, particle lifetimes
            and quantum-gravity endpoints.
          </p>
        </div>
        <div>
          <strong>Current dataset tensions</strong>
          <p>
            CMB and local distance-ladder H₀ inferences disagree. DESI
            dark-energy preferences vary with combinations and parametrization.
          </p>
        </div>
      </div>
      <div className="source-current">
        <h3>The 2026 update matters</h3>
        <p>
          DESI&apos;s July/August 2026 Lyα full-shape update shifts that probe
          toward ΛCDM. Combined evolving-dark-energy preferences remain model
          and dataset dependent. Euclid DR1 cosmological results were not yet
          released at this review date. The Planck preset is a documented
          reference.
        </p>
        <a
          href="https://arxiv.org/html/2607.27410v3"
          target="_blank"
          rel="noreferrer"
        >
          Read the DESI 2026 analysis <ArrowUpRight size={13} />
        </a>
      </div>
      <details>
        <summary>Preset extraction and transformation notes</summary>
        {presets.map((p) => (
          <div className="preset-note" key={p.id}>
            <strong>{p.label}</strong>
            <p>{p.notes}</p>
          </div>
        ))}
      </details>
      <label className="source-search">
        <BookOpen size={16} />
        <input
          placeholder="Search publications, collaborations or datasets…"
          aria-label="Search scientific sources"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span>{filtered.length} sources</span>
      </label>
      <div className="source-list">
        {filtered.map((s, i) => (
          <article key={s.id}>
            <span className="source-number">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div>
              <div className="source-meta">
                {s.authors} <span>·</span> {s.date}
              </div>
              <h3>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                  <ArrowUpRight size={14} />
                </a>
              </h3>
              <p>{s.notes}</p>
              <details>
                <summary>Parameters, selection rationale & identifiers</summary>
                <p>
                  {s.selectedBecause}
                  <br />
                  Dataset: {s.dataset}
                  <br />
                  DOI: {s.doi ?? 'Not recorded'} · arXiv:{' '}
                  {s.arxiv ?? 'Not applicable'}
                </p>
                <pre>{JSON.stringify(s.parameters, null, 2)}</pre>
              </details>
            </div>
          </article>
        ))}
      </div>
      <button
        className="secondary-button"
        onClick={() =>
          download(
            'cosmic-scientific-sources.json',
            JSON.stringify(
              { version: DATASET_VERSION, reviewedAt: '2026-09-05', sources },
              null,
              2,
            ),
          )
        }
      >
        Export source registry
      </button>
    </div>
  );
}
export function ReportPanel({ result }: { result: Result }) {
  return (
    <div className="panel report-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">REPRODUCIBLE SCIENTIFIC REPORT</span>
          <h2>A record of this universe</h2>
        </div>
        <Badge tone="blue">
          Configuration {result.metadata.configurationHash}
        </Badge>
      </div>
      <p>
        Export the exact configuration, numerical trajectory, assumptions, event
        timeline and provenance. Reports disclose conditional assumptions and
        unsupported regimes.
      </p>
      <div className="export-grid">
        <button
          onClick={() =>
            download('cosmic-universe.json', JSON.stringify(result, null, 2))
          }
        >
          <FileText />
          <strong>Complete result</strong>
          <span>JSON · configuration + samples + metadata</span>
          <ArrowDownToLine size={15} />
        </button>
        <button
          onClick={() =>
            download('cosmic-evolution.csv', csv(result), 'text/csv')
          }
        >
          <Activity />
          <strong>Numerical trajectory</strong>
          <span>CSV · quantities and regime labels</span>
          <ArrowDownToLine size={15} />
        </button>
        <button
          onClick={() =>
            download(
              'cosmic-scientific-report.md',
              report(result),
              'text/markdown',
            )
          }
        >
          <BookOpen />
          <strong>Scientific report</strong>
          <span>Markdown · methods, events and limitations</span>
          <ArrowDownToLine size={15} />
        </button>
      </div>
      <article className="report-preview">
        <div className="eyebrow">COSMIC FUTURES LABORATORY / RUN REPORT</div>
        <h2>{result.config.name}</h2>
        {result.config.sandbox && (
          <Badge tone="amber">NONSTANDARD PHYSICS SCENARIO</Badge>
        )}
        <h3>{result.classification}</h3>
        <p>{result.explanation}</p>
        <div className="method-grid">
          <div>
            <h4>Configuration</h4>
            <p>
              H₀={result.config.H0} km/s/Mpc
              <br />
              Dark energy: {result.config.deModel}
              <br />
              Dark matter: {result.config.dmModel}
              <br />
              Endpoint: 10^{result.config.endLogYears} elapsed yr
            </p>
          </div>
          <div>
            <h4>Reproducibility</h4>
            <p>
              Software {VERSION} · Data {DATASET_VERSION}
              <br />
              Seed {result.config.seed}
              <br />
              Status {result.status}
              <br />
              {result.samples.length} output samples
            </p>
          </div>
        </div>
        <h4>Black-hole estimates</h4>
        <div className="bh-table">
          <div>
            <strong>Initial mass · M☉</strong>
            <strong>Hawking T · K</strong>
            <strong>Ideal log₁₀(lifetime/yr)</strong>
          </div>
          {result.config.blackHoleMasses.map((m) => (
            <div key={m}>
              <span>{format(m)}</span>
              <span>{format(BH_TEMPERATURE / m)}</span>
              <span>
                {result.config.evaporation === 'disabled'
                  ? 'Disabled'
                  : format(
                      blackHoleLifetime(
                        Math.log10(m),
                        result.config.evaporationFactor,
                      ),
                      2,
                    )}
              </span>
            </div>
          ))}
        </div>
        <p className="fine-print">
          Isolated Schwarzschild blackbody approximation; greybody factors,
          spin, accretion and quantum-gravity endpoint are not modeled.
        </p>
        <h4>Limitations</h4>
        {result.warnings.slice(0, 4).map((w) => (
          <p key={w}>{w}</p>
        ))}
      </article>
      <details>
        <summary>View the full export text</summary>
        <pre className="report-text">{report(result)}</pre>
      </details>
    </div>
  );
}
