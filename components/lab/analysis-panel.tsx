'use client';
import { useState } from 'react';
import { BarChart3, Grid2X2, Shuffle, Download } from 'lucide-react';
import type { Configuration } from '@/src/science/types';
import type { EnsembleOptions, EnsembleResult } from '@/src/science/analysis';
import { Choice, NumberField, Badge, format, download } from './controls';
import { ScientificPlot } from './chart';
import { compute } from './compute';
import { fateCellColor } from './plotting';
import type { AnalysisMode } from '@/src/science/dispatch';
import { VERSION, DATASET_VERSION } from '@/src/science/types';
type SensitivityRow = {
  parameter: string;
  step: number;
  derivative: number | null;
  response: number | null;
  plusOutcome: string;
  minusOutcome: string;
  horizon: number;
};
type SweepRow = {
  w0: number;
  wa: number;
  outcome: string;
  status: string;
  finalExpansion: number | null;
};
/** Outcome of a fate-map cell, naming the status when it is not resolved. */
const cellOutcome = (s: SweepRow) =>
  s.status === 'invalid' || s.status === 'limited'
    ? `${s.outcome} (${s.status})`
    : s.outcome;
export function AnalysisPanel({
  config,
  configError,
}: {
  config: Configuration;
  /** First validation error of the configuration, if any. */
  configError?: string;
}) {
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [ens, setEns] = useState<EnsembleResult | null>(null),
    [sens, setSens] = useState<SensitivityRow[] | null>(null),
    [map, setMap] = useState<SweepRow[] | null>(null);
  const [options, setOptions] = useState<EnsembleOptions>({
      runs: 32,
      seed: 42,
      distribution: 'gaussian',
      sigmas: [0.54, 0.0073, 0.05, 0.15],
      interval: 0.95,
    }),
    [cov, setCov] = useState(''),
    [posterior, setPosterior] = useState('');
  const [range, setRange] = useState({
      w0Min: -1.2,
      w0Max: -0.8,
      waMin: -0.5,
      waMax: 0.5,
      resolution: 7,
    }),
    [selected, setSelected] = useState<SweepRow | null>(null);
  const [ensMeta, setEnsMeta] = useState<{
      config: Configuration;
      options: EnsembleOptions;
    } | null>(null),
    [sweepResolution, setSweepResolution] = useState(7);
  const [sweepMeta, setSweepMeta] = useState<{
    config: Configuration;
    range: typeof range;
    timestamp: string;
  } | null>(null);
  const [sensMeta, setSensMeta] = useState<{
    config: Configuration;
    timestamp: string;
  } | null>(null);
  const intervalError =
    options.interval > 0 && options.interval < 1
      ? undefined
      : 'Enter a central interval between 0 and 1, e.g. 0.95.';
  // Analyses of an invalid configuration would only report rejected runs.
  const blocked = !!busy || !!configError;
  async function request(mode: AnalysisMode) {
    setBusy(mode);
    setError('');
    try {
      const opts =
        mode === 'ensemble'
          ? {
              ...options,
              covariance: cov.trim() ? JSON.parse(cov) : undefined,
              posterior: posterior.trim() ? JSON.parse(posterior) : undefined,
            }
          : range;
      const v = await compute<unknown>(mode, config, opts);
      if (mode === 'ensemble') {
        setEns(v as EnsembleResult);
        setEnsMeta({
          config: structuredClone(config),
          options: opts as EnsembleOptions,
        });
      }
      if (mode === 'sensitivity') {
        setSens(v as SensitivityRow[]);
        setSensMeta({
          config: structuredClone(config),
          timestamp: new Date().toISOString(),
        });
      }
      if (mode === 'sweep') {
        setMap(v as SweepRow[]);
        setSweepMeta({
          config: structuredClone(config),
          range: structuredClone(range),
          timestamp: new Date().toISOString(),
        });
        setSelected(null);
        setSweepResolution(range.resolution);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="analysis-layout">
      {configError && (
        <output className="inline-warning analysis-blocked">
          Analyses are unavailable until the configuration is valid:{' '}
          {configError}
        </output>
      )}
      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">
              <Shuffle size={14} /> UNCERTAINTY PROPAGATION
            </span>
            <h2>An ensemble of possible universes</h2>
          </div>
          <Badge tone="amber">Assumption dependent</Badge>
        </div>
        <p>
          Sample H₀, Ωm, w₀ and wₐ. Independent marginal errors illustrate
          sensitivity; a measured joint posterior requires its correlations and
          provenance.
        </p>
        <div className="analysis-controls">
          <NumberField
            label="Realizations"
            value={options.runs}
            onChange={(n) => setOptions({ ...options, runs: n })}
            hint="4–256 runs"
          />
          <NumberField
            label="Seed"
            value={options.seed}
            onChange={(n) => setOptions({ ...options, seed: n })}
          />
          <Choice
            label="Distribution"
            value={options.distribution}
            onChange={(v) =>
              setOptions({
                ...options,
                distribution: v as 'gaussian' | 'uniform',
              })
            }
            options={[
              { value: 'gaussian', label: 'Gaussian' },
              { value: 'uniform', label: 'Uniform · equal variance' },
            ]}
          />
          <NumberField
            label="Central interval"
            value={options.interval}
            onChange={(n) => setOptions({ ...options, interval: n })}
            error={intervalError}
          />
        </div>
        <div className="analysis-controls">
          {['σ(H₀)', 'σ(Ωm)', 'σ(w₀)', 'σ(wₐ)'].map((label, i) => (
            <NumberField
              key={label}
              label={label}
              value={options.sigmas[i]}
              onChange={(n) =>
                setOptions({
                  ...options,
                  sigmas: options.sigmas.map((v, j) => (j === i ? n : v)),
                })
              }
            />
          ))}
        </div>
        <details>
          <summary>Covariance or posterior samples</summary>
          <p>
            Order: [H₀, Ωm, w₀, wₐ]. Ωde is explicitly derived by closure in
            every draw. No likelihood or evidence ratio is calculated.
          </p>
          <label className="control">
            <span>Optional positive-definite 4 × 4 covariance JSON</span>
            <textarea
              value={cov}
              onChange={(e) => setCov(e.target.value)}
              placeholder="Leave empty for independent distributions"
              rows={3}
            />
          </label>
          <label className="control">
            <span>Optional posterior sample rows (overrides distribution)</span>
            <textarea
              value={posterior}
              onChange={(e) => setPosterior(e.target.value)}
              placeholder="[[67.4, 0.315, -1, 0], …]"
              rows={3}
            />
          </label>
        </details>
        <button
          className="secondary-button"
          disabled={blocked || !!intervalError}
          onClick={() => request('ensemble')}
        >
          <Shuffle size={15} />
          {busy === 'ensemble' ? 'Sampling…' : 'Run ensemble'}
        </button>
        {ens && (
          <>
            <div className="stat-strip">
              <span>
                <b>{ens.accepted}</b> accepted
              </span>
              <span>
                <b>{ens.rejected}</b> invalid configurations
              </span>
              <span>
                Seed <b>{ens.seed}</b>
              </span>
              <button
                onClick={() =>
                  download(
                    'cosmic-ensemble.json',
                    JSON.stringify(
                      {
                        version: VERSION,
                        datasetVersion: DATASET_VERSION,
                        metadata: ensMeta,
                        result: ens,
                      },
                      null,
                      2,
                    ),
                  )
                }
              >
                <Download size={14} /> Export ensemble
              </button>
            </div>
            <ScientificPlot
              title="Expansion · median and central interval"
              xMax={ensMeta?.config.endLogYears ?? config.endLogYears}
              description={`${Math.round(ens.interval * 100)}% central sampling interval. Bands condition on branches surviving to each epoch.`}
              series={[
                {
                  key: 'median',
                  label: 'Median',
                  color: '#86e9bd',
                  values: ens.bands.map((b) => ({
                    x: b.logYears,
                    y: b.median,
                  })),
                },
              ]}
              bands={ens.bands.map((b) => ({
                x: b.logYears,
                low: b.low,
                high: b.high,
              }))}
            />
            <div className="outcome-list">
              {Object.entries(ens.outcomes).map(([name, count]) => (
                <div key={name}>
                  <span>{name}</span>
                  <b>
                    {count} / {ens.accepted}
                  </b>
                </div>
              ))}
            </div>
            {ens.notes.map((n, i) => (
              <p className="fine-print" key={i}>
                {n}
              </p>
            ))}
          </>
        )}
      </div>
      <div className="analysis-grid">
        <div className="panel">
          <span className="eyebrow">
            <BarChart3 size={14} /> LOCAL SENSITIVITY
          </span>
          <h2>Which parameters matter here?</h2>
          <p>
            Central finite differences of the nested-log expansion coordinate at
            min(endpoint, 10¹¹ years). Each bar is the response to the stated
            perturbation, not a universal ranking.
          </p>
          <button
            className="secondary-button"
            disabled={blocked}
            onClick={() => request('sensitivity')}
          >
            {busy === 'sensitivity' ? 'Calculating…' : 'Calculate sensitivity'}
          </button>
          {sens && (
            <div className="sensitivity-list">
              <p className="fine-print">
                Calculated for {sensMeta?.config.name}. Exports preserve the
                configuration used for this calculation.
              </p>
              <button
                className="text-button"
                onClick={() =>
                  download(
                    'cosmic-sensitivity.json',
                    JSON.stringify(
                      {
                        version: VERSION,
                        datasetVersion: DATASET_VERSION,
                        metadata: sensMeta,
                        rows: sens,
                      },
                      null,
                      2,
                    ),
                  )
                }
              >
                Export sensitivity JSON
              </button>
              {sens.map((s) => (
                <div key={s.parameter}>
                  <div>
                    <strong>{s.parameter}</strong>
                    <span>
                      ±{s.step} → {format(s.response, 5)}
                    </span>
                  </div>
                  <div className="bar-track">
                    <i
                      style={{
                        width: `${Math.max(0, ((s.response ?? 0) / Math.max(...sens.map((s) => s.response ?? 0), 1e-10)) * 100)}%`,
                      }}
                    />
                  </div>
                  <small>
                    ∂ expansion / ∂{s.parameter} = {format(s.derivative, 5)}
                    {s.derivative === 0
                      ? ' · inactive or insensitive in this model'
                      : ''}
                  </small>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="panel">
          <span className="eyebrow">
            <Grid2X2 size={14} /> PARAMETER SWEEP
          </span>
          <h2>Explore the outcome map</h2>
          <p>
            Each cell solves the bounded future model w(a)=w₀+wₐ(1−1/a).
            Numerical/model boundaries remain visible as unresolved cells.
          </p>
          <div className="two-cols">
            {(['w0Min', 'w0Max', 'waMin', 'waMax'] as const).map((k) => (
              <NumberField
                key={k}
                label={k.replace('Min', ' minimum').replace('Max', ' maximum')}
                value={range[k]}
                onChange={(n) => setRange({ ...range, [k]: n })}
              />
            ))}
          </div>
          <NumberField
            label="Grid resolution"
            value={range.resolution}
            onChange={(n) => setRange({ ...range, resolution: n })}
            hint="3–15 points per axis"
          />
          <button
            className="secondary-button"
            disabled={blocked}
            onClick={() => request('sweep')}
          >
            {busy === 'sweep' ? 'Solving the grid…' : 'Calculate fate map'}
          </button>
          {map && (
            <>
              <div
                className="fate-map"
                style={{
                  gridTemplateColumns: `repeat(${sweepResolution},1fr)`,
                }}
              >
                {map.map((s, i) => (
                  <button
                    key={i}
                    aria-label={`w0=${s.w0.toFixed(3)}, wa=${s.wa.toFixed(3)}: ${cellOutcome(s)}`}
                    style={{ background: fateCellColor(s.status, s.outcome) }}
                    onClick={() => setSelected(s)}
                    title={`${s.w0.toFixed(3)}, ${s.wa.toFixed(3)}: ${cellOutcome(s)}`}
                  />
                ))}
              </div>
              <small>
                Horizontal: w₀ increasing → · vertical: wₐ increasing ↓
              </small>
              <p className="fine-print">
                Rose: finite phantom branch · mint: de Sitter · blue:
                accelerated · sand: other resolved expansion · gray: unresolved
                or invalid.
              </p>
              {selected && (
                <p className="map-selection">
                  w₀={format(selected.w0)}, wₐ={format(selected.wa)}
                  <br />
                  {cellOutcome(selected)}
                </p>
              )}
              <button
                className="text-button"
                onClick={() =>
                  download(
                    'cosmic-fate-map.json',
                    JSON.stringify(
                      {
                        version: VERSION,
                        datasetVersion: DATASET_VERSION,
                        metadata: sweepMeta,
                        rows: map,
                      },
                      null,
                      2,
                    ),
                  )
                }
              >
                Export grid JSON
              </button>
            </>
          )}
        </div>
      </div>
      {error && (
        <div role="alert" className="error-banner">
          {error}
        </div>
      )}
    </div>
  );
}
