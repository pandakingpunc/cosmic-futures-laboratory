'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Activity,
  Orbit,
  BookOpen,
  FlaskConical,
  GitBranch,
  Image,
  Layers,
  Link2,
  ListTree,
  Plus,
  Upload,
  X,
  Check,
  CircleHelp,
  FileText,
  SlidersHorizontal,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { ConfigurationPanel } from './configuration';
import { ScientificPlot, type PlotSeries } from './chart';
import {
  Choice,
  Badge,
  Time,
  format,
  download,
  downloadSvgAsPng,
} from './controls';
import { AnalysisPanel } from './analysis-panel';
import { StructureView } from './structure-view';
import {
  TimelinePanel,
  EquationPanel,
  SourcesPanel,
  ReportPanel,
} from './detail-panels';
import { compute } from './compute';
import {
  isResult,
  loadStored,
  readSharedConfig,
  saveStored,
  shareHash,
} from './persistence';
import { defaultConfig } from '@/src/science/defaults';
import { simulate, hashConfig, validate } from '@/src/science/engine';
import {
  DATASET_VERSION,
  VERSION,
  type Configuration,
  type Result,
  type Sample,
  type CosmicEvent,
} from '@/src/science/types';
const colors = ['#8ce8bf', '#8bb5e9', '#e5b979', '#ca98d2', '#ea9995'];
type Metric =
  | 'expansion'
  | 'hubble'
  | 'densities'
  | 'composition'
  | 'temperature'
  | 'populations'
  | 'deceleration'
  | 'horizons'
  | 'entropy';
const metricOptions = [
  { value: 'expansion', label: 'Expansion history' },
  { value: 'hubble', label: 'Hubble parameter' },
  { value: 'densities', label: 'Energy densities' },
  { value: 'composition', label: 'Density fractions Ωi' },
  { value: 'temperature', label: 'Cosmic temperature' },
  { value: 'populations', label: 'Population & survival proxies' },
  { value: 'deceleration', label: 'Deceleration & equation of state' },
  { value: 'horizons', label: 'Hubble length scales' },
  { value: 'entropy', label: 'de Sitter horizon entropy' },
];
const descriptions: Record<Metric, string> = {
  expansion:
    'signed log₁₀(1 + |log₁₀ a|) · nested logarithm preserves enormous expansions',
  hubble:
    'log₁₀(|H| / km s⁻¹ Mpc⁻¹) · negative H during contraction; magnitude plotted',
  densities:
    'log₁₀(|ρi| / ρcrit,0) · the configuration specifies the sign of dark energy',
  composition:
    'Ωi = ρi / ρcrit(t) · undefined at H=0; curvature can be negative',
  temperature:
    'log₁₀(T / K) · adiabatic photons and a nonthermal effective radiation temperature',
  populations:
    'Normalized illustrative populations and tracer survival; zero can denote numerical underflow',
  deceleration: 'q = −a ä / ȧ² and dark-energy w(a) · dimensionless',
  horizons:
    'log₁₀(length / Mpc) · Hubble radii are not generally event horizons',
  entropy:
    'log₁₀(Sde Sitter / kB) · only in the de Sitter limit, not a total cosmic entropy',
};
function plotSeries(r: Result, metric: Metric): PlotSeries[] {
  const specs: Record<Metric, [keyof Sample, string][]> = {
    expansion: [['expansionIndex', 'Scale factor']],
    hubble: [['logH', 'Hubble rate']],
    densities: [
      ['logRhoB', 'Baryons'],
      ['logRhoDM', 'Dark matter'],
      ['logRhoR', 'Radiation'],
      ['logRhoDE', 'Dark energy'],
    ],
    composition: [
      ['omegaM', 'Matter'],
      ['omegaR', 'Radiation'],
      ['omegaDE', 'Dark energy'],
      ['omegaK', 'Curvature'],
    ],
    temperature: [
      ['logTcmb', 'CMB photons'],
      ['logRadiationEffectiveT', 'Effective radiation'],
    ],
    populations: [
      ['stellarFraction', 'Stellar proxy'],
      ['baryonSurvival', 'Baryon survival'],
      ['electronSurvival', 'Electron survival'],
    ],
    deceleration: [
      ['q', 'Deceleration q'],
      ['w', 'Dark-energy w'],
    ],
    horizons: [
      ['logHubbleRadiusMpc', 'Physical Hubble radius'],
      ['logComovingHubbleMpc', 'Comoving Hubble radius'],
    ],
    entropy: [['logHorizonEntropy', 'de Sitter horizon entropy']],
  };
  return specs[metric].map(([key, label], i) => ({
    key,
    label,
    color: colors[i],
    values: r.samples.map((s) => ({
      x: s.logYears,
      y: s[key] as number | null,
    })),
  }));
}
export default function Laboratory() {
  const [config, setConfig] = useState<Configuration>(() => defaultConfig()),
    [result, setResult] = useState<Result>(() => simulate(defaultConfig())),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [tab, setTab] = useState('observatory'),
    [metric, setMetric] = useState<Metric>('expansion'),
    [view, setView] = useState('full'),
    [epoch, setEpoch] = useState(11),
    [event, setEvent] = useState<CosmicEvent | null>(null),
    [comparisons, setComparisons] = useState<Result[]>([]),
    [showConfig, setShowConfig] = useState(false),
    [restored, setRestored] = useState(false);
  const resultFile = useRef<HTMLInputElement>(null);
  const run = useCallback(
    async (override?: Configuration) => {
      const target = override ?? config;
      setBusy(true);
      setError('');
      setNotice('');
      try {
        const data = await compute<Result>('deterministic', target);
        setResult(data);
        setEvent(null);
        setEpoch(Math.min(11, data.samples.at(-1)?.logYears ?? 11));
        if (data.errors.length) setError(data.errors.join(' '));
        else {
          setNotice(
            'Simulation calculated. Exports retain this configuration and its provenance.',
          );
          // The address bar always identifies the last calculated universe.
          window.history.replaceState(null, '', shareHash(data.config));
        }
        setShowConfig(false);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [config],
  );
  // Restore a shared link (takes precedence) or the previous browser session.
  // Browser storage and the URL are external systems, so the restore happens
  // in a scheduled callback rather than synchronously in the effect body.
  useEffect(() => {
    if (restored) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const shared = readSharedConfig(window.location.hash);
      const stored = loadStored();
      if (stored.comparisons?.length) setComparisons(stored.comparisons);
      const restoredConfig = shared ?? stored.config;
      if (restoredConfig && !validate(restoredConfig).errors.length) {
        setConfig(restoredConfig);
        if (hashConfig(restoredConfig) !== hashConfig(defaultConfig()))
          void run(restoredConfig);
      } else if (shared)
        setError(
          'The shared link contains an invalid configuration; the default reference universe is shown instead.',
        );
      setRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [restored, run]);
  useEffect(() => {
    if (restored) saveStored({ config, comparisons });
  }, [restored, config, comparisons]);
  const dirty = hashConfig(config) !== result.metadata.configurationHash,
    maxTime = result.samples.at(-1)?.logYears ?? config.endLogYears;
  const xMax =
    view === 'near'
      ? Math.min(12, maxTime)
      : view === 'stellar'
        ? Math.min(15, maxTime)
        : maxTime;
  const sample = useMemo(
    () =>
      result.samples.reduce<Sample | undefined>(
        (best, s) =>
          !best ||
          Math.abs(s.logYears - epoch) < Math.abs(best.logYears - epoch)
            ? s
            : best,
        undefined,
      ),
    [result, epoch],
  );
  async function shareLink() {
    const url = `${window.location.origin}${window.location.pathname}${shareHash(result.config)}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice(
        'Link copied. Opening it reproduces this configuration and recalculates the universe.',
      );
    } catch {
      window.prompt('Copy this reproducible link:', url);
    }
  }
  function addComparison(r: Result) {
    if (comparisons.length >= 4) {
      setNotice(
        'Four comparison slots are occupied. Remove one in Compare to add another.',
      );
      return false;
    }
    setComparisons([...comparisons, structuredClone(r)]);
    return true;
  }
  async function importResult(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 20e6) throw new Error('Result file exceeds 20 MB.');
      const v: unknown = JSON.parse(await file.text());
      if (!isResult(v))
        throw new Error(
          'This file is not a complete result. Configuration-only files load through Import JSON in the configuration panel.',
        );
      const check = validate(v.config);
      if (check.errors.length) throw new Error(check.errors.join(' '));
      if (addComparison(v))
        setNotice(
          `Imported ${v.config.name}${
            v.metadata.version !== VERSION
              ? ` (computed with software version ${v.metadata.version}; current is ${VERSION})`
              : ''
          } into the comparison bench.`,
        );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function saveUniverse() {
    if (addComparison(result))
      setNotice(`Saved ${result.config.name} for comparison.`);
  }
  function saveChart(kind: 'svg' | 'png') {
    const svg = document.querySelector<SVGSVGElement>('[data-export-chart]');
    if (!svg) return;
    if (kind === 'svg')
      download(
        'cosmic-evolution.svg',
        new XMLSerializer().serializeToString(svg),
        'image/svg+xml',
      );
    else
      downloadSvgAsPng(svg, 'cosmic-evolution.png').catch((e: Error) =>
        setError(e.message),
      );
  }
  function loadBranch(kind: string) {
    const c = { ...defaultConfig(), preset: 'custom', name: kind };
    if (kind === 'Persistent phantom energy') {
      c.deModel = 'constant';
      c.w0 = -1.1;
    }
    if (kind === 'Negative vacuum energy') {
      c.omegaB = 1.1;
      c.omegaDM = 0;
      c.omegaNu = 0;
      c.omegaR = 0;
      c.omegaDE = -0.1;
    }
    if (kind === 'Unknown vacuum stability') {
      c.vacuumDecay = true;
      c.vacuumLogLifetime = 80;
    }
    setConfig(c);
    setTab('observatory');
    void run(c);
  }
  return (
    <div className="laboratory">
      <header className="topbar">
        <Link
          className="brand"
          href="/"
          aria-label="Cosmic Futures Laboratory home"
        >
          <div className="brand-symbol">
            <Orbit size={29} />
          </div>
          <div>
            <strong>
              COSMIC <span>FUTURES</span>
            </strong>
            <small>NUMERICAL COSMOLOGY LABORATORY</small>
          </div>
        </Link>
        <div className="top-status">
          <span className="status-dot" /> RESEARCH PREVIEW{' '}
          <span className="top-divider" /> v{VERSION}
          <span className="desktop-only">
            · DATA {DATASET_VERSION.split('.')[0]}
          </span>
        </div>
        <div className="header-actions">
          <button
            className="header-export"
            onClick={() => void shareLink()}
            title="Copy a link that reproduces the calculated configuration"
          >
            <Link2 size={16} /> Share link
          </button>
          <button
            className="header-export"
            onClick={() =>
              download('cosmic-universe.json', JSON.stringify(result, null, 2))
            }
          >
            <ArrowDownToLine size={16} /> Export universe
          </button>
        </div>
      </header>
      <div className={`workspace ${showConfig ? 'show-config' : ''}`}>
        <ConfigurationPanel
          config={config}
          setConfig={setConfig}
          run={() => void run()}
          busy={busy}
          onError={setError}
        />
        <main className="main-surface">
          <div className="workspace-heading">
            <div>
              <div className="eyebrow">
                <span className="status-dot" /> SIMULATION WORKSPACE
              </div>
              <h1>The future of this universe</h1>
              <div className="run-identity">
                {result.config.name}
                <span className="identity-dot">·</span>
                <span className="mono">
                  {result.metadata.configurationHash}
                </span>
                <Badge tone={result.config.sandbox ? 'amber' : 'green'}>
                  {result.config.sandbox
                    ? 'Nonstandard scenario'
                    : 'Conditional physical model'}
                </Badge>
              </div>
            </div>
            <div className="heading-actions">
              <button
                className="secondary-button config-mobile"
                onClick={() => setShowConfig(!showConfig)}
              >
                <SlidersHorizontal size={15} /> Configure
              </button>
              <button className="secondary-button" onClick={saveUniverse}>
                <Plus size={15} /> Add to comparison
              </button>
            </div>
          </div>
          {dirty && (
            <div className="pending-banner">
              <span>
                <span className="status-dot amber-dot" /> Configuration changed.
                Results show the last calculated universe.
              </span>
              <button disabled={busy} onClick={() => void run()}>
                Run updated model <ArrowUpRight size={14} />
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="error-banner">
              <strong>Calculation needs attention</strong>
              <p>{error}</p>
              <button onClick={() => setError('')} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <output className="notice-banner">
              <Check size={14} />
              {notice}
              <button
                onClick={() => setNotice('')}
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </output>
          )}
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(String(v))}
            className="workspace-tabs"
          >
            <TabsList variant="line" className="main-tabs">
              {[
                { v: 'observatory', label: 'Observatory', icon: Activity },
                { v: 'timeline', label: 'Cosmic timeline', icon: ListTree },
                { v: 'analysis', label: 'Analysis', icon: FlaskConical },
                {
                  v: 'compare',
                  label: `Compare${comparisons.length ? ' · ' + comparisons.length : ''}`,
                  icon: Layers,
                },
                { v: 'equations', label: 'Equations', icon: GitBranch },
                { v: 'sources', label: 'Scientific sources', icon: BookOpen },
                { v: 'report', label: 'Report', icon: FileText },
              ].map((t) => (
                <TabsTrigger key={t.v} value={t.v}>
                  <t.icon size={15} />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="observatory">
              <section
                className={`fate-card ${result.status === 'limited' ? 'fate-limited' : ''}`}
              >
                <div className="fate-mark">
                  <Orbit size={33} />
                </div>
                <div className="fate-content">
                  <div className="eyebrow">
                    {result.status === 'terminated'
                      ? 'SELECTED MODEL TERMINATES IN'
                      : result.status === 'limited'
                        ? 'MODEL BOUNDARY REACHED'
                        : 'UNDER THE SELECTED ASSUMPTIONS'}
                  </div>
                  <h2>{result.classification}</h2>
                  <p>{result.explanation}</p>
                </div>
                <Badge tone={result.status === 'limited' ? 'amber' : 'green'}>
                  {result.status === 'complete' ? 'Calculated' : result.status}
                </Badge>
              </section>
              {result.diagnostics.reason && (
                <div className="diagnostic-note">
                  <CircleHelp size={17} />
                  <span>{result.diagnostics.reason}</span>
                </div>
              )}
              <div className="instrument-stats">
                <div>
                  <span>INITIAL EXPANSION RATE</span>
                  <strong>
                    {format(result.config.H0, 2)} <small>km/s/Mpc</small>
                  </strong>
                  <p>Hubble constant H₀</p>
                </div>
                <div>
                  <span>PRESENT MATTER DENSITY</span>
                  <strong>
                    {format(
                      (result.config.omegaB +
                        result.config.omegaDM +
                        result.config.omegaNu) *
                        100,
                      2,
                    )}
                    <small>%</small>
                  </strong>
                  <p>Baryons + dark matter + massive ν</p>
                </div>
                <div>
                  <span>COMPUTED FUTURE REACH</span>
                  <strong>
                    <Time logYears={maxTime} />
                  </strong>
                  <p>
                    {result.diagnostics.tail
                      ? 'Numerical + matched asymptote'
                      : 'Numerically resolved interval'}
                  </p>
                </div>
                <div>
                  <span>SCIENTIFIC STATUS</span>
                  <strong className="status-value">Model dependent</strong>
                  <p>Ultimate fate is not a measured probability</p>
                </div>
              </div>
              <section className="panel main-plot-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">
                      EVOLUTION OF THE COSMIC BACKGROUND
                    </span>
                    <h2>A future calculated from the equations</h2>
                  </div>
                  <div className="plot-actions">
                    <Choice
                      label="Quantity"
                      value={metric}
                      options={metricOptions}
                      onChange={(v) => setMetric(v as Metric)}
                    />
                    <Choice
                      label="Time window"
                      value={view}
                      options={[
                        { value: 'full', label: 'Full future' },
                        { value: 'near', label: 'Near future · 10¹² yr' },
                        { value: 'stellar', label: 'Stellar era · 10¹⁵ yr' },
                      ]}
                      onChange={setView}
                    />
                    <button
                      className="icon-button"
                      onClick={() => saveChart('svg')}
                      aria-label="Export visible chart as SVG"
                      title="Export SVG"
                    >
                      <ArrowDownToLine size={16} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => saveChart('png')}
                      aria-label="Export visible chart as PNG"
                      title="Export PNG"
                    >
                      <Image size={16} />
                    </button>
                  </div>
                </div>
                <ScientificPlot
                  title={metricOptions.find((x) => x.value === metric)!.label}
                  description={descriptions[metric]}
                  series={plotSeries(result, metric)}
                  xMax={xMax}
                  onInspect={setEpoch}
                  asymptote={
                    result.diagnostics.tail
                      ? result.diagnostics.numericalUntilLogYears
                      : undefined
                  }
                />
                <div className="plot-regimes">
                  <span>
                    <i className="numerical-dot" /> Adaptive numerical
                    integration
                  </span>
                  {result.diagnostics.tail && (
                    <span>
                      <i className="asymptotic-dot" /> Matched asymptotic
                      continuation
                    </span>
                  )}
                  <span>
                    Absent, undefined and unrepresentable values leave gaps.
                  </span>
                </div>
              </section>
              {sample && (
                <>
                  <section className="epoch-inspector">
                    <div>
                      <span className="eyebrow">INSPECT AN EPOCH</span>
                      <h3>
                        {sample.isPresent ? (
                          'Present day'
                        ) : (
                          <Time logYears={sample.logYears} />
                        )}
                      </h3>
                      <Badge
                        tone={sample.regime === 'asymptotic' ? 'amber' : 'blue'}
                      >
                        {sample.regime}
                      </Badge>
                    </div>
                    <div className="epoch-slider">
                      <Slider
                        aria-label="Inspect elapsed log years"
                        value={[Math.min(epoch, maxTime)]}
                        min={0}
                        max={maxTime || 1}
                        step={0.01}
                        onValueChange={(v) =>
                          setEpoch(Array.isArray(v) ? v[0] : v)
                        }
                      />
                      <div>
                        <span>Present</span>
                        <span>log₁₀(years)</span>
                        <Time logYears={maxTime} />
                      </div>
                    </div>
                    <div className="epoch-values">
                      <span>
                        log₁₀ a <b>{format(sample.logA, 4)}</b>
                      </span>
                      <span>
                        log₁₀ Tγ / K <b>{format(sample.logTcmb, 4)}</b>
                      </span>
                      <span>
                        q <b>{format(sample.q, 4)}</b>
                      </span>
                    </div>
                  </section>
                  <div className="bottom-grid">
                    <section className="panel upcoming">
                      <div className="panel-heading">
                        <h2>Landmarks ahead</h2>
                        <button
                          className="text-button"
                          onClick={() => setTab('timeline')}
                        >
                          Full timeline <ArrowUpRight size={14} />
                        </button>
                      </div>
                      {result.events.slice(0, 4).map((e) => (
                        <button
                          className="landmark"
                          key={e.id}
                          onClick={() => {
                            setEvent(e);
                            setEpoch(e.logYears);
                            setTab('timeline');
                          }}
                        >
                          <span className="landmark-point" />
                          <div>
                            <strong>{e.title}</strong>
                            <span>{e.reliability}</span>
                          </div>
                          <Time logYears={e.logYears} />
                        </button>
                      ))}
                      {!result.events.length && (
                        <p>
                          No transition was detected within the computed
                          interval.
                        </p>
                      )}
                    </section>
                    <section className="panel physics-note">
                      <span className="eyebrow">WHY THIS FUTURE?</span>
                      <h2>Assumptions shape the outcome.</h2>
                      <p>
                        A cosmological model constrains the evolution of its
                        chosen ingredients. Unknown dark-energy behavior,
                        particle stability and quantum gravity can change the
                        answer.
                      </p>
                      <div className="assumption-tags">
                        <Badge tone="blue">Observed inputs</Badge>
                        <Badge tone="amber">Uncertain physics</Badge>
                        <Badge tone="muted">Explicit approximations</Badge>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => setTab('equations')}
                      >
                        Inspect equations & uncertainty tree{' '}
                        <ArrowUpRight size={14} />
                      </button>
                    </section>
                  </div>
                  <details className="structure-details">
                    <summary>Open the schematic 3D structure view</summary>
                    <StructureView sample={sample} />
                  </details>
                </>
              )}
            </TabsContent>
            <TabsContent value="timeline">
              <TimelinePanel
                result={result}
                event={event}
                select={(e) => {
                  setEvent(e);
                  setEpoch(e.logYears);
                }}
              />
            </TabsContent>
            <TabsContent value="analysis">
              <AnalysisPanel config={config} />
            </TabsContent>
            <TabsContent value="compare">
              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">COMPARE UNIVERSES</span>
                    <h2>Same equations. Different assumptions.</h2>
                  </div>
                  <div className="heading-actions">
                    <button
                      className="secondary-button"
                      onClick={() => resultFile.current?.click()}
                    >
                      <Upload size={15} /> Import result
                    </button>
                    <button className="secondary-button" onClick={saveUniverse}>
                      <Plus size={15} /> Keep current result
                    </button>
                  </div>
                  <input
                    type="file"
                    accept=".json,application/json"
                    hidden
                    ref={resultFile}
                    onChange={(e) => {
                      void importResult(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>
                <p>
                  Save up to four calculated universes, then change the initial
                  conditions and run again. The bench and the current
                  configuration persist in this browser; exported result files
                  can be imported back without recalculation.
                </p>
                <Choice
                  label="Comparison quantity"
                  value={metric}
                  options={metricOptions}
                  onChange={(v) => setMetric(v as Metric)}
                />
                {comparisons.length ? (
                  <>
                    <ScientificPlot
                      title={
                        metricOptions.find((x) => x.value === metric)!.label
                      }
                      xMax={Math.max(
                        ...comparisons.map(
                          (r) => r.samples.at(-1)?.logYears ?? 0,
                        ),
                      )}
                      description={
                        descriptions[metric] +
                        ' · first series of each quantity'
                      }
                      series={comparisons.map((r, i) => ({
                        ...plotSeries(r, metric)[0],
                        key: String(i),
                        label: r.config.name,
                        color: colors[i],
                      }))}
                    />
                    <div className="comparison-cards">
                      {comparisons.map((r, i) => (
                        <article key={i}>
                          <div className="panel-heading">
                            <Badge tone="blue">
                              Universe {String.fromCharCode(65 + i)}
                            </Badge>
                            <button
                              className="icon-button"
                              aria-label={`Remove ${r.config.name}`}
                              onClick={() =>
                                setComparisons(
                                  comparisons.filter((_, j) => j !== i),
                                )
                              }
                            >
                              <X size={15} />
                            </button>
                          </div>
                          <h3 style={{ color: colors[i] }}>{r.config.name}</h3>
                          <strong>{r.classification}</strong>
                          <p>
                            H₀ {r.config.H0} · w₀ {r.config.w0} · wₐ{' '}
                            {r.config.wa}
                            <br />
                            DM {r.config.dmModel} · {r.events.length} events
                          </p>
                          <button
                            className="text-button"
                            onClick={() => {
                              setConfig(r.config);
                              setResult(r);
                              setTab('observatory');
                            }}
                          >
                            Inspect this universe <ArrowUpRight size={14} />
                          </button>
                          <button
                            className="text-button"
                            onClick={() =>
                              download(
                                `universe-${i + 1}.json`,
                                JSON.stringify(r, null, 2),
                              )
                            }
                          >
                            Export result
                          </button>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <Layers size={38} />
                    <h3>Your comparison bench is empty</h3>
                    <p>
                      Add the current universe, select a different dark-energy
                      model, and run the simulation to compare the results.
                    </p>
                    <button className="secondary-button" onClick={saveUniverse}>
                      Add the current universe
                    </button>
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="equations">
              <EquationPanel result={result} loadBranch={loadBranch} />
            </TabsContent>
            <TabsContent value="sources">
              <SourcesPanel />
            </TabsContent>
            <TabsContent value="report">
              <ReportPanel result={result} />
            </TabsContent>
          </Tabs>
          <footer className="lab-footer">
            <span>
              <Orbit size={13} /> COSMIC FUTURES LABORATORY
            </span>
            <span>
              Conditional models. Traceable assumptions. Reproducible results.
            </span>
            <span>v{VERSION}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
