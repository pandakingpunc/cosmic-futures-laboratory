'use client';
import { useRef } from 'react';
import {
  Play,
  RotateCcw,
  Upload,
  Plus,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import type { Configuration, PhysicsEvent } from '@/src/science/types';
import { defaultConfig, presets } from '@/src/science/defaults';
import { validate } from '@/src/science/engine';
import { Choice, NumberField, Section, Toggle, format } from './controls';
export function ConfigurationPanel({
  config: c,
  setConfig,
  run,
  busy,
  onError,
}: {
  config: Configuration;
  setConfig: (c: Configuration) => void;
  run: () => void;
  busy: boolean;
  onError: (s: string) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Configuration>(key: K, v: Configuration[K]) =>
    setConfig({ ...c, [key]: v, preset: key === 'name' ? c.preset : 'custom' });
  const number = (key: keyof Configuration, label: string, hint?: string) => (
    <NumberField
      label={label}
      value={c[key] as number}
      onChange={(v) => set(key, v)}
      hint={hint}
    />
  );
  const sum =
    c.omegaB + c.omegaDM + c.omegaNu + c.omegaR + c.omegaDE + c.omegaK;
  const issues = validate(c);
  function example(value: string) {
    let next = { ...defaultConfig(), preset: 'custom', name: value };
    if (value === 'Mild phantom')
      next = { ...next, deModel: 'constant', w0: -1.05 };
    if (value === 'Strong phantom')
      next = { ...next, deModel: 'constant', w0: -1.5 };
    if (value === 'Decaying dark matter')
      next = { ...next, dmModel: 'decay', dmLogLifetime: 11 };
    if (value === 'Closed matter Universe')
      next = {
        ...next,
        omegaB: 2,
        omegaDM: 0,
        omegaNu: 0,
        omegaR: 0,
        omegaDE: 0,
        omegaK: -1,
      };
    if (value === 'Negative vacuum energy')
      next = {
        ...next,
        omegaB: 1.1,
        omegaDM: 0,
        omegaNu: 0,
        omegaR: 0,
        omegaDE: -0.1,
      };
    if (value === 'Hypothetical proton decay')
      next = { ...next, protonDecay: true };
    if (value === 'Stable black-hole remnants')
      next = { ...next, evaporation: 'remnant' };
    if (value === '10¹⁰⁰⁰-year baseline') next = { ...next, endLogYears: 1000 };
    setConfig(next);
  }
  return (
    <aside className="configuration-panel">
      <div className="config-heading">
        <span className="eyebrow">
          <SlidersHorizontal size={14} /> INITIAL CONDITIONS
        </span>
        <h2>Define your universe</h2>
        <p>Change the assumptions. Calculate the consequences.</p>
      </div>
      <div className="config-scroll">
        <div className="preset-block">
          <Choice
            label="Observational preset"
            value={c.preset}
            options={[
              ...presets.map((p) => ({ value: p.id, label: p.label })),
              { value: 'custom', label: 'Custom Universe' },
            ]}
            onChange={(v) => v !== 'custom' && setConfig(defaultConfig(v))}
          />
          <Choice
            label="Example scenarios"
            value="choose"
            options={[
              { value: 'choose', label: 'Load an example…' },
              ...[
                'Mild phantom',
                'Strong phantom',
                'Decaying dark matter',
                'Closed matter Universe',
                'Negative vacuum energy',
                'Hypothetical proton decay',
                'Stable black-hole remnants',
                '10¹⁰⁰⁰-year baseline',
              ].map((x) => ({ value: x, label: x })),
            ]}
            onChange={(v) => v !== 'choose' && example(v)}
          />
        </div>
        <Section title="Cosmological parameters" open badge="01">
          <label className="control">
            <span>Universe name</span>
            <input
              value={c.name}
              onChange={(e) => set('name', e.target.value)}
              maxLength={100}
            />
          </label>
          {number('H0', 'H₀ · km s⁻¹ Mpc⁻¹')}
          <div className="two-cols">
            {number('omegaB', 'Ωb · baryons')}
            {number('omegaDM', 'Ωcdm · dark matter')}
            {number('omegaNu', 'Ων · massive neutrinos')}
            {number('omegaR', 'Ωr · radiation')}
            {number('omegaDE', 'Ωde · dark energy')}
            {number('omegaK', 'Ωk · curvature')}
          </div>
          <div
            className={`closure ${Math.abs(sum - 1) > 1e-5 ? 'invalid' : ''}`}
          >
            ΣΩ = {format(sum, 7)}{' '}
            <button
              onClick={() =>
                set(
                  'omegaDE',
                  1 - c.omegaB - c.omegaDM - c.omegaNu - c.omegaR - c.omegaK,
                )
              }
            >
              Set Ωde by closure
            </button>
          </div>
          <div className="two-cols">
            {number('Tcmb', 'CMB temperature · K')}
            {number('Neff', 'Effective species Neff')}
          </div>
          <button
            className="text-button"
            onClick={() =>
              set(
                'omegaR',
                (2.4728e-5 / (c.H0 / 100) ** 2) *
                  (c.Tcmb / 2.7255) ** 4 *
                  (1 + 0.2271 * Math.max(0, c.Neff - 1.0153)),
              )
            }
          >
            Derive Ωr from Tcmb + massless species
          </button>
          <small>
            Future-only pressureless massive-neutrino approximation. Radiation
            is updated only by this explicit action.
          </small>
        </Section>
        <Section title="Dark energy" open badge="02">
          <Choice
            label="Equation-of-state model"
            value={c.deModel}
            options={[
              { value: 'lambda', label: 'Cosmological constant · Λ' },
              {
                value: 'constant',
                label: 'Constant w · quintessence / phantom',
              },
              { value: 'cpl', label: 'CPL · observational extrapolation' },
              { value: 'bounded', label: 'Bounded future continuation' },
              { value: 'custom', label: 'Custom equation w(a)' },
            ]}
            onChange={(v) => set('deModel', v as Configuration['deModel'])}
          />
          {c.deModel === 'lambda' ? (
            <div className="equation-pill">w(a) = −1</div>
          ) : (
            <div className="two-cols">
              {number('w0', 'w₀')}
              {['cpl', 'bounded'].includes(c.deModel) && number('wa', 'wₐ')}
            </div>
          )}
          {c.deModel === 'custom' && (
            <label className="control">
              <span>w(a) expression</span>
              <input
                className="mono"
                value={c.expression}
                onChange={(e) => set('expression', e.target.value)}
                maxLength={240}
              />
              <small>
                a, z=1/a−1, + − * / ^, log, exp, sin, cos, sqrt, abs, tanh.
              </small>
            </label>
          )}
          {c.deModel === 'cpl' && (
            <p className="inline-warning">
              CPL diverges in the far future. A fit to the observed past does
              not validate this extrapolation.
            </p>
          )}
          {c.deModel === 'bounded' && (
            <div className="equation-pill">w(a) = w₀ + wₐ(1 − 1/a)</div>
          )}
        </Section>
        <Section title="Dark matter" badge="03">
          <Choice
            label="Dark-matter evolution"
            value={c.dmModel}
            options={[
              { value: 'stable', label: 'Stable cold dark matter' },
              { value: 'decay', label: 'Decay into nonthermal radiation' },
              { value: 'annihilation', label: 'Annihilation into radiation' },
              { value: 'warm', label: 'Warm-fluid pressure proxy' },
              {
                value: 'interacting',
                label: 'Transfer Q = ξHρdm to radiation',
              },
            ]}
            onChange={(v) => set('dmModel', v as Configuration['dmModel'])}
          />
          {c.dmModel === 'decay' &&
            number('dmLogLifetime', 'log₁₀(mean lifetime / yr)')}
          {c.dmModel === 'annihilation' &&
            number('annihilation', 'Dimensionless annihilation coefficient A')}
          {c.dmModel === 'interacting' &&
            number('interaction', 'Transfer coefficient ξ')}
          {c.dmModel === 'warm' &&
            number(
              'warmW',
              'Effective warm-fluid w',
              'No free streaming or structure suppression is calculated.',
            )}
        </Section>
        <Section title="Extreme future physics" badge="04">
          <Toggle
            label="Hypothetical proton decay"
            checked={c.protonDecay}
            onChange={(v) => set('protonDecay', v)}
            hint="Unobserved. Stable by default."
          />
          {c.protonDecay &&
            number(
              'protonLogLifetime',
              'Proton log₁₀(mean lifetime / yr)',
              'p → e⁺π⁰: τ/B > 2.4×10³⁴ yr at 90% CL; not a total-lifetime measurement.',
            )}
          <Toggle
            label="Hypothetical electron decay"
            checked={c.electronDecay}
            onChange={(v) => set('electronDecay', v)}
            hint="May violate electric charge conservation."
          />
          {c.electronDecay &&
            number('electronLogLifetime', 'Electron log₁₀(mean lifetime / yr)')}
          <Choice
            label="Black-hole endpoint"
            value={c.evaporation}
            options={[
              { value: 'hawking', label: 'Semiclassical Hawking evaporation' },
              { value: 'disabled', label: 'What-if: no evaporation' },
              {
                value: 'remnant',
                label: 'What-if: stable Planck-mass remnants',
              },
            ]}
            onChange={(v) =>
              set('evaporation', v as Configuration['evaporation'])
            }
          />
          {number(
            'evaporationFactor',
            'Evaporation rate multiplier',
            '1 = isolated Schwarzschild blackbody estimate.',
          )}
          <label className="control">
            <span>Black-hole masses · M☉</span>
            <input
              defaultValue={c.blackHoleMasses.join(', ')}
              key={c.blackHoleMasses.join(',')}
              onBlur={(e) =>
                set('blackHoleMasses', e.target.value.split(',').map(Number))
              }
            />
            <small>Comma separated, e.g. 10, 1e5, 1e9.</small>
          </label>
          <Toggle
            label="Stochastic vacuum-decay toy model"
            checked={c.vacuumDecay}
            onChange={(v) => set('vacuumDecay', v)}
            hint="Assumed local Poisson hazard; vacuum lifetime unknown."
          />
          {c.vacuumDecay &&
            number('vacuumLogLifetime', 'Vacuum log₁₀(mean lifetime / yr)')}
        </Section>
        <Section title="Nonstandard physics sandbox" badge="OFF BY DEFAULT">
          <Toggle
            label="Enable what-if physics"
            checked={c.sandbox}
            onChange={(v) =>
              setConfig({ ...c, sandbox: v, events: v ? c.events : [] })
            }
          />
          {c.sandbox && (
            <>
              <p className="inline-warning">
                NONSTANDARD PHYSICS SANDBOX — THESE SETTINGS MAY VIOLATE KNOWN
                PHYSICS.
              </p>
              <h4>Break the Universe</h4>
              <p className="muted">
                Define interventions. Invalid continuations return their last
                valid state and a reason.
              </p>
              {c.events.map((e, i) => (
                <div className="event-editor" key={e.id}>
                  <button
                    className="icon-button remove"
                    aria-label={`Remove custom event ${i + 1}`}
                    onClick={() =>
                      set(
                        'events',
                        c.events.filter((x) => x.id !== e.id),
                      )
                    }
                  >
                    <X size={14} />
                  </button>
                  <NumberField
                    label={`Event ${i + 1} · log₁₀(years)`}
                    value={e.logTime}
                    onChange={(v) =>
                      set(
                        'events',
                        c.events.map((x) =>
                          x.id === e.id ? { ...x, logTime: v } : x,
                        ),
                      )
                    }
                  />
                  <Choice
                    label="Action"
                    value={e.action}
                    options={[
                      { value: 'change-w', label: 'Change dark-energy w' },
                      {
                        value: 'vacuum-scale',
                        label: 'Multiply vacuum density',
                      },
                      { value: 'change-G', label: 'Set G / G₀' },
                      { value: 'dm-lifetime', label: 'Change DM lifetime' },
                      { value: 'halt', label: 'Force halt' },
                      { value: 'reverse', label: 'Force reversal' },
                    ]}
                    onChange={(v) =>
                      set(
                        'events',
                        c.events.map((x) =>
                          x.id === e.id
                            ? { ...x, action: v as PhysicsEvent['action'] }
                            : x,
                        ),
                      )
                    }
                  />
                  <NumberField
                    label="New value / multiplier"
                    value={e.value}
                    onChange={(v) =>
                      set(
                        'events',
                        c.events.map((x) =>
                          x.id === e.id ? { ...x, value: v } : x,
                        ),
                      )
                    }
                  />
                </div>
              ))}
              <button
                className="secondary-button"
                onClick={() =>
                  set('events', [
                    ...c.events,
                    {
                      id: `event-${Date.now()}`,
                      logTime: 40,
                      action: 'change-w',
                      value: -1.1,
                    },
                  ])
                }
              >
                <Plus size={14} /> Add physics event
              </button>
            </>
          )}
        </Section>
        <Section title="Duration & numerical method" open badge="05">
          <Choice
            label="Future endpoint"
            value={String(c.endLogYears)}
            options={[6, 9, 12, 20, 40, 67, 100, 1000]
              .map((n) => ({
                value: String(n),
                label: `10^${n} years from today`,
              }))
              .concat(
                ![6, 9, 12, 20, 40, 67, 100, 1000].includes(c.endLogYears)
                  ? [
                      {
                        value: String(c.endLogYears),
                        label: `Custom · 10^${c.endLogYears} yr`,
                      },
                    ]
                  : [],
              )}
            onChange={(v) => set('endLogYears', Number(v))}
          />
          {number('endLogYears', 'Custom log₁₀(endpoint / yr)')}
          <div className="two-cols">
            {number('seed', 'Random seed')}
            {number('samples', 'Output samples')}
            {number('rtol', 'Relative tolerance')}
            {number('atol', 'Absolute tolerance')}
          </div>
        </Section>
      </div>
      <div className="config-run">
        {issues.errors.length > 0 && (
          <p className="inline-warning">{issues.errors[0]}</p>
        )}
        <button
          className="run-button"
          onClick={run}
          disabled={busy || issues.errors.length > 0}
        >
          <Play size={17} fill="currentColor" />
          {busy ? 'CALCULATING…' : 'RUN SIMULATION'}
          <span>↗</span>
        </button>
        <div className="config-actions">
          <button onClick={() => setConfig(defaultConfig())}>
            <RotateCcw size={13} /> Reset
          </button>
          <button onClick={() => file.current?.click()}>
            <Upload size={13} /> Import JSON
          </button>
        </div>
        <input
          type="file"
          accept=".json,application/json"
          hidden
          ref={file}
          onChange={async (e) => {
            try {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 1e6)
                throw new Error('Configuration file exceeds 1 MB.');
              const v = JSON.parse(await f.text());
              const nc = { ...defaultConfig(), ...(v.config ?? v) };
              const check = validate(nc);
              if (check.errors.length) throw new Error(check.errors.join(' '));
              setConfig(nc);
            } catch (e) {
              onError((e as Error).message);
            }
          }}
        />
      </div>
    </aside>
  );
}
