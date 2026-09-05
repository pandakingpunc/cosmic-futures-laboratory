import { compileExpression } from './expression';
import { dopriStep } from './integrator';
import { astrophysics, cosmicEvents } from './astrophysics';
import {
  DATASET_VERSION,
  EQUATIONS,
  VERSION,
  type Configuration,
  type Result,
  type Sample,
  type CosmicEvent,
} from './types';

export const H0_YEAR = 31557600 / (3.085677581491367 * 1e19);
const LN10 = Math.LN10;
const safe = (v: number): number | null => (Number.isFinite(v) ? v : null);
const log = (v: number) => (v > 0 ? Math.log(v) : -Infinity);
export function hashConfig(c: Configuration) {
  let h = 2166136261;
  for (const ch of JSON.stringify(c)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function validate(c: Configuration): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [],
    warnings: string[] = [];
  const numeric = [
    'H0',
    'omegaB',
    'omegaDM',
    'omegaNu',
    'omegaR',
    'omegaDE',
    'omegaK',
    'Tcmb',
    'Neff',
    'w0',
    'wa',
    'dmLogLifetime',
    'annihilation',
    'interaction',
    'warmW',
    'endLogYears',
    'samples',
    'seed',
    'rtol',
    'atol',
    'protonLogLifetime',
    'electronLogLifetime',
    'evaporationFactor',
    'vacuumLogLifetime',
  ] as const;
  for (const k of numeric)
    if (!Number.isFinite(c[k])) errors.push(`${k} must be finite.`);
  if (c.H0 < 1e-6 || c.H0 > 1000)
    errors.push(
      'H₀ must be between 10⁻⁶ and 1000 km/s/Mpc, the supported numerical range.',
    );
  for (const k of ['omegaB', 'omegaDM', 'omegaNu', 'omegaR'] as const)
    if (c[k] < 0)
      errors.push(
        `${k} cannot be negative in the supported fluid equations, including the sandbox.`,
      );
  const sum =
    c.omegaB + c.omegaDM + c.omegaNu + c.omegaR + c.omegaDE + c.omegaK;
  if (Math.abs(sum - 1) > 1e-5)
    errors.push(
      `Density closure fails: ΣΩ = ${sum.toPrecision(7)}. Set Ωde or Ωk explicitly so ΣΩ=1; values are never silently renormalized.`,
    );
  if (c.Tcmb <= 0) errors.push('CMB temperature must be positive.');
  if (c.Neff < 0 || c.Neff > 20)
    errors.push('Effective relativistic species must be between zero and 20.');
  for (const k of [
    'protonLogLifetime',
    'electronLogLifetime',
    'vacuumLogLifetime',
  ] as const)
    if (c[k] < 0 || c[k] > 1000)
      errors.push(`${k} must lie between 0 and 1000.`);
  if (c.endLogYears < 0 || c.endLogYears > 1000)
    errors.push('Endpoint must be from 1 to 10^1000 elapsed years.');
  if (c.samples < 40 || c.samples > 1000 || !Number.isInteger(c.samples))
    errors.push('Choose 40–1000 output samples.');
  if (c.rtol < 1e-12 || c.rtol > 1e-3 || c.atol < 1e-14 || c.atol > 1e-5)
    errors.push('Solver tolerances outside supported bounds.');
  if (c.evaporationFactor <= 0)
    errors.push('Evaporation multiplier must be positive.');
  if (
    !Array.isArray(c.blackHoleMasses) ||
    c.blackHoleMasses.length < 1 ||
    c.blackHoleMasses.length > 12 ||
    c.blackHoleMasses.some((m) => m <= 0 || !Number.isFinite(m) || m > 1e30)
  )
    errors.push('Supply 1–12 black-hole masses in (0, 10^30] solar masses.');
  if (!['hawking', 'disabled', 'remnant'].includes(c.evaporation))
    errors.push('Unknown black-hole evaporation model.');
  if (typeof c.name !== 'string' || typeof c.expression !== 'string')
    errors.push('Universe name and custom expression must be text.');
  for (const k of [
    'sandbox',
    'protonDecay',
    'electronDecay',
    'vacuumDecay',
  ] as const)
    if (typeof c[k] !== 'boolean') errors.push(`${k} must be a boolean.`);
  if (
    !['lambda', 'constant', 'cpl', 'bounded', 'custom'].includes(c.deModel) ||
    !['stable', 'decay', 'annihilation', 'warm', 'interacting'].includes(
      c.dmModel,
    )
  )
    errors.push('Unknown energy or matter model.');
  if (
    c.dmLogLifetime < 0 ||
    c.dmLogLifetime > 1000 ||
    c.interaction < 0 ||
    c.annihilation < 0 ||
    c.warmW < 0 ||
    c.warmW > 1 / 3
  )
    errors.push(
      'Dark-matter lifetime/rate/equation-of-state outside supported range.',
    );
  if (!Array.isArray(c.events)) errors.push('Custom events must be an array.');
  else {
    if (c.events.length > 20)
      errors.push('At most 20 custom events are supported.');
    if (c.events.length && !c.sandbox)
      errors.push('Enable the nonstandard sandbox to apply custom events.');
    for (const e of c.events)
      if (
        !e ||
        typeof e.id !== 'string' ||
        !Number.isFinite(e.logTime) ||
        e.logTime < 0 ||
        e.logTime > 1000 ||
        !Number.isFinite(e.value) ||
        ![
          'change-w',
          'vacuum-scale',
          'change-G',
          'halt',
          'reverse',
          'dm-lifetime',
        ].includes(e.action)
      )
        errors.push('Invalid custom event.');
  }
  if (c.deModel === 'custom') {
    try {
      const f = compileExpression(c.expression);
      for (const a of [1, 1.01, 2, 10]) f(a);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (c.deModel === 'cpl')
    warnings.push(
      'CPL is an observational parametrization, w(a)=w₀+wₐ(1−a), and generally diverges as a→∞. Its simulated future is an unvalidated mathematical extrapolation.',
    );
  if (c.deModel === 'bounded')
    warnings.push(
      'The bounded model w(a)=w₀+wₐ(1−1/a) is a phenomenological future continuation, not a scalar-field calculation or an observational posterior.',
    );
  if (c.deModel === 'custom')
    warnings.push(
      'A finite sample of w(a) cannot establish its asymptotic fate. Custom equations terminate at the supported numerical boundary.',
    );
  if (c.dmModel !== 'stable')
    warnings.push(
      'Dark-matter microphysics is unknown. Decay/annihilation/interaction rates here are user assumptions, not measured constraints. Warm-fluid pressure does not model free streaming or structure formation.',
    );
  if (c.protonDecay || c.electronDecay)
    warnings.push(
      'Particle survival is a tracer module: decay products do not feed back into the Friedmann densities. Expansion at decay-dominated epochs is therefore conditional on this test-population approximation.',
    );
  if (c.sandbox)
    warnings.push(
      'NONSTANDARD PHYSICS SANDBOX — THESE SETTINGS MAY VIOLATE KNOWN PHYSICS. Instantaneous parameter changes can require external energy or momentum.',
    );
  warnings.push(
    'Massive neutrinos are pressureless over this future-only integration. Ωr is an independently specified photons + effective massless-neutrino density. Tcmb and Neff do not silently recompute Ωr.',
  );
  warnings.push(
    'Stellar populations and remnant eras are phenomenological proxies; no N-body dynamics, stellar population synthesis, or exact entropy budget is computed.',
  );
  return { errors, warnings };
}

interface Node {
  x: number;
  y: number[];
  g: number;
  wModel: Configuration['deModel'];
  w0: number;
  wa: number;
  signDE: number;
}
interface Background {
  logE: number;
  logs: number[];
  fractions: number[];
  w: number;
  q: number;
  D: number;
  transfer: number;
}
export function simulate(input: Configuration): Result {
  const c = structuredClone(input),
    { errors, warnings } = validate(c);
  const result: Result = {
    config: structuredClone(c),
    samples: [],
    events: [],
    classification: 'Undetermined',
    explanation:
      'Ultimate fate cannot be uniquely determined under current observational and theoretical uncertainty.',
    status: errors.length ? 'invalid' : 'complete',
    errors,
    warnings,
    diagnostics: {
      acceptedSteps: 0,
      rejectedSteps: 0,
      maxConstraintResidual: 0,
      maxErrorNorm: 0,
      numericalUntilLogYears: 0,
      reason: '',
      tail: null,
    },
    metadata: {
      version: VERSION,
      datasetVersion: DATASET_VERSION,
      timestamp: new Date().toISOString(),
      solver:
        'Dormand–Prince 5(4); log-scale-factor expansion; regular time-domain contraction; matched constant-fluid asymptotes',
      timeOrigin:
        'Elapsed proper years from a(t₀)=1, not total age since the Big Bang',
      equations: EQUATIONS,
      seed: c.seed,
      configurationHash: hashConfig(c),
    },
  };
  if (errors.length) return result;
  const h0 = c.H0 * H0_YEAR,
    logH0 = Math.log10(h0),
    custom = c.deModel === 'custom' ? compileExpression(c.expression) : null;
  const matter = c.omegaB + c.omegaNu;
  const deInitial = log(Math.abs(c.omegaDE));
  const specialEvents: CosmicEvent[] = [];
  let g = 1,
    signDE = Math.sign(c.omegaDE),
    deModel = c.deModel,
    w0 = c.w0,
    wa = c.wa;
  let eventIndex = 0;
  const random = seededRandom(c.seed);
  const vacuumLog = c.vacuumDecay
    ? c.vacuumLogLifetime + Math.log10(-Math.log(Math.max(1e-15, 1 - random())))
    : Infinity;
  const effectiveEnd = Math.min(c.endLogYears, vacuumLog);
  const eventQueue = c.events
    .filter((e) => e.logTime <= effectiveEnd)
    .sort((a, b) => a.logTime - b.logTime);
  const wAt = (x: number) =>
    deModel === 'lambda'
      ? -1
      : deModel === 'constant'
        ? w0
        : deModel === 'cpl'
          ? w0 + wa * (1 - Math.exp(x))
          : deModel === 'bounded'
            ? w0 + wa * (1 - Math.exp(-x))
            : custom!(Math.exp(x));
  function background(x: number, y: number[]): Background {
    const [tau, R, lDE, J] = y;
    if (R < -c.atol || J < -c.atol)
      throw new Error(
        'A conservative component became negative; timestep rejected.',
      );
    const warm = c.dmModel === 'warm' ? c.warmW : 0;
    const gamma =
      c.dmModel === 'decay'
        ? 10 ** Math.max(-310, -c.dmLogLifetime - logH0)
        : 0;
    const xi = c.dmModel === 'interacting' ? c.interaction : 0;
    const ld =
      log(c.omegaDM) -
      3 * warm * x -
      xi * x -
      gamma * tau -
      (c.dmModel === 'annihilation' ? Math.log1p(c.omegaDM * J) : 0);
    const D = Math.exp(ld);
    const logs = [
      log(matter) - 3 * x,
      ld - 3 * x,
      log(Math.max(0, R)) - 4 * x,
      signDE ? lDE : -Infinity,
      log(Math.abs(c.omegaK)) - 2 * x,
    ];
    const max = Math.max(...logs);
    const signed = logs.map(
      (v, i) =>
        Math.exp(v - max) *
        (i === 3 ? signDE : i === 4 ? Math.sign(c.omegaK) : 1),
    );
    const sum = signed.reduce((a, b) => a + b, 0);
    if (!(sum > 0) || !Number.isFinite(max))
      throw new Error(
        'H² ≤ 0: expansion branch is undefined at this integration stage.',
      );
    const logE = 0.5 * (Math.log(g) + max + Math.log(sum));
    const fractions = signed.map((v) => v / sum),
      w = wAt(x);
    if (!Number.isFinite(w) || Math.abs(w) > 1e5)
      throw new Error(
        'Dark-energy equation exceeded its supported finite range.',
      );
    const transfer =
      (gamma * Math.exp(-logE) + xi) * D +
      (c.dmModel === 'annihilation'
        ? c.annihilation * D * D * Math.exp(-3 * x - logE)
        : 0);
    return {
      logE,
      logs,
      fractions,
      w,
      q:
        0.5 *
        (fractions[0] +
          fractions[1] * (1 + 3 * warm) +
          2 * fractions[2] +
          fractions[3] * (1 + 3 * w)),
      D,
      transfer,
    };
  }
  const derivative = (x: number, y: number[]) => {
    const b = background(x, y);
    return [
      Math.exp(-b.logE),
      b.transfer * Math.exp(x),
      signDE ? -3 * (1 + b.w) : 0,
      c.dmModel === 'annihilation'
        ? c.annihilation * Math.exp(-3 * x - b.logE)
        : 0,
    ];
  };
  function sampleAt(
    x: number,
    y: number[],
    logYears: number,
    regime: Sample['regime'] = 'numerical',
  ): Sample {
    const b = background(x, y),
      logA = x / LN10,
      logH = Math.log10(c.H0) + b.logE / LN10;
    const radius = Math.log10(299792.458) - logH;
    return {
      logYears,
      isPresent: y[0] === 0,
      logA,
      expansionIndex: Math.sign(logA) * Math.log10(1 + Math.abs(logA)),
      logH,
      logRhoB: safe(log(c.omegaB) / LN10 - 3 * logA),
      logRhoDM: safe(b.logs[1] / LN10),
      logRhoR: safe(b.logs[2] / LN10),
      logRhoDE: safe(b.logs[3] / LN10),
      omegaM: b.fractions[0] + b.fractions[1],
      omegaR: b.fractions[2],
      omegaDE: b.fractions[3],
      omegaK: b.fractions[4],
      logTcmb: Math.log10(c.Tcmb) - logA,
      logRadiationEffectiveT:
        c.omegaR > 0
          ? Math.log10(c.Tcmb) + (b.logs[2] / LN10 - Math.log10(c.omegaR)) / 4
          : null,
      q: b.q,
      w: b.w,
      logHubbleRadiusMpc: radius,
      logComovingHubbleMpc: radius - logA,
      logHorizonEntropy:
        b.q === -1
          ? Math.log10(Math.PI) + 2 * (radius + 22.48935055 + 34.791)
          : null,
      ...astrophysics(y[0] === 0 ? -Infinity : logYears, c),
      regime,
      constraintResidual: 0,
    };
  }
  const nodes: Node[] = [];
  let x = 0,
    y = [0, c.omegaR, Number.isFinite(deInitial) ? deInitial : 0, 0],
    step = 0.02;
  const snapshot = (): Node => ({
    x,
    y: [...y],
    g,
    wModel: deModel,
    w0,
    wa,
    signDE,
  });
  nodes.push(snapshot());
  const canContract =
    (c.omegaDE < 0 || c.omegaK < 0) &&
    ['lambda', 'constant'].includes(c.deModel) &&
    c.dmModel === 'stable' &&
    c.events.length === 0;
  if (canContract) {
    integrateContraction();
  } else {
    let tries = 0;
    while (
      x < 60 &&
      Math.log10(Math.max(y[0], 1e-310)) - logH0 < effectiveEnd &&
      tries++ < 40000
    ) {
      const prevY = y,
        prevX = x;
      let trial;
      try {
        trial = dopriStep(derivative, x, y, step, c.rtol, c.atol);
      } catch (e) {
        result.diagnostics.rejectedSteps++;
        step *= 0.25;
        if (step < 1e-11) {
          result.status = 'limited';
          result.diagnostics.reason =
            (e as Error).message +
            ' Explicit solver reached minimum step; possible stiffness or a singular branch. No data invented beyond this point.';
          break;
        }
        continue;
      }
      if (trial.error > 1) {
        result.diagnostics.rejectedSteps++;
        step *= trial.factor;
        if (step < 1e-11) {
          result.status = 'limited';
          result.diagnostics.reason =
            'Error tolerance cannot be met at the minimum step.';
          break;
        }
        continue;
      }
      let pending = eventQueue[eventIndex];
      if (pending && pending.logTime + logH0 < 300) {
        const target = 10 ** (pending.logTime + logH0);
        if (trial.y[0] > target && y[0] < target * (1 - 1e-9)) {
          step *= Math.max(
            0.01,
            Math.min(0.95, (target - y[0]) / (trial.y[0] - y[0])),
          );
          continue;
        }
      }
      x += step;
      y = trial.y;
      result.diagnostics.acceptedSteps++;
      result.diagnostics.maxErrorNorm = Math.max(
        result.diagnostics.maxErrorNorm,
        trial.error,
      );
      nodes.push(snapshot());
      while (pending && Math.log10(y[0]) - logH0 >= pending.logTime - 1e-8) {
        specialEvents.push({
          id: pending.id,
          title: `Custom event: ${pending.action}`,
          logYears: pending.logTime,
          detail: `User-selected value ${pending.value}. Discontinuous rule changes are external interventions; stress-energy matching is not established.`,
          reliability: 'Pure what-if',
          sources: [],
        });
        eventIndex++;
        if (pending.action === 'change-w') {
          deModel = 'constant';
          w0 = pending.value;
          wa = 0;
        }
        if (pending.action === 'vacuum-scale') {
          if (pending.value === 0) {
            signDE = 0;
          } else {
            signDE *= Math.sign(pending.value);
            y[2] += Math.log(Math.abs(pending.value));
          }
        }
        if (pending.action === 'change-G') {
          if (c.omegaK !== 0) {
            result.status = 'limited';
            result.diagnostics.reason =
              'Changing G in a curved model requires separate curvature and density matching. This intervention is supported only for flat models.';
            break;
          }
          if (pending.value <= 0) {
            result.status = 'terminated';
            result.diagnostics.reason =
              'A nonpositive G multiplier makes this solver formulation undefined.';
            break;
          }
          g = pending.value;
        }
        if (pending.action === 'dm-lifetime') {
          if (c.dmModel !== 'decay') {
            result.status = 'limited';
            result.diagnostics.reason =
              'A lifetime switch requires an already active decay model.';
            break;
          }
          result.status = 'limited';
          result.diagnostics.reason =
            'Lifetime discontinuity reached. Donor survival history requires a new matched interacting segment; this version stops explicitly.';
          break;
        }
        if (pending.action === 'halt' || pending.action === 'reverse') {
          result.status = 'terminated';
          result.diagnostics.reason = `Forced ${pending.action} reached. H cannot be instantaneously changed consistently with the unmodified Friedmann stress-energy; expansion evolution stops at this intervention.`;
          break;
        }
        try {
          background(x, y);
        } catch (e) {
          const valid = nodes[nodes.length - 1];
          y = [...valid.y];
          g = valid.g;
          deModel = valid.wModel;
          w0 = valid.w0;
          wa = valid.wa;
          signDE = valid.signDE;
          result.status = 'terminated';
          result.diagnostics.reason = `Custom event made the expansion branch undefined: ${(e as Error).message} Last valid state retained.`;
          break;
        }
        nodes.push(snapshot());
        pending = eventQueue[eventIndex];
      }
      if (result.status !== 'complete') break;
      step = Math.min(0.1, step * trial.factor, 60 - x);
      if (x === prevX || y[0] < prevY[0]) {
        result.status = 'limited';
        result.diagnostics.reason = 'Time failed to advance.';
        break;
      }
    }
    if (tries >= 40000) {
      result.status = 'limited';
      result.diagnostics.reason =
        'Integration budget reached; possible stiffness. No continuation has been fabricated.';
    }
    const finalLog = Math.log10(Math.max(y[0], 1e-300)) - logH0;
    result.diagnostics.numericalUntilLogYears = finalLog;
    const numericalEnd = Math.min(effectiveEnd, finalLog);
    const targets = [
      -Infinity,
      ...Array.from(
        { length: c.samples },
        (_, i) => (i * numericalEnd) / (c.samples - 1),
      ),
    ];
    let j = 0;
    for (const lt of targets) {
      const tau = lt === -Infinity ? 0 : 10 ** (lt + logH0);
      while (j + 1 < nodes.length && nodes[j + 1].y[0] < tau) j++;
      const n = nodes[j],
        next = nodes[Math.min(j + 1, nodes.length - 1)];
      g = n.g;
      deModel = n.wModel;
      w0 = n.w0;
      wa = n.wa;
      signDE = n.signDE;
      let px = n.x,
        py = n.y;
      if (next.x > n.x && tau > n.y[0]) {
        let lo = n.x,
          hi = next.x;
        for (let k = 0; k < 52; k++) {
          const mid = (lo + hi) / 2;
          const t = dopriStep(derivative, n.x, n.y, mid - n.x, c.rtol, c.atol);
          if (t.y[0] < tau) lo = mid;
          else hi = mid;
        }
        px = (lo + hi) / 2;
        py = dopriStep(derivative, n.x, n.y, px - n.x, c.rtol, c.atol).y;
      }
      result.samples.push(sampleAt(px, py, lt === -Infinity ? 0 : lt));
    }
    const final = nodes[nodes.length - 1];
    g = final.g;
    deModel = final.wModel;
    w0 = final.w0;
    wa = final.wa;
    signDE = final.signDE;
    if (result.status === 'complete' && effectiveEnd > finalLog + 1e-8)
      extendTail(finalLog, effectiveEnd);
    else if (result.status === 'complete') classifyFinite();
  }

  function classifyFinite() {
    if (c.omegaK < 0) {
      result.classification = 'Undetermined · closed-model branch';
      result.explanation =
        'A closed model can encounter a future turnaround even when its dark-energy density is positive. The computed interval has not established a globally expanding branch.';
      return;
    }
    if (
      signDE > 0 &&
      (deModel === 'lambda' || (deModel === 'constant' && w0 === -1))
    ) {
      result.classification = 'Asymptotic de Sitter expansion';
      result.explanation =
        'Under a positive cosmological constant and the selected conserved fluids, matter and radiation dilute while vacuum density remains constant. Expansion tends to a constant Hubble rate. A heat-death interpretation additionally assumes long-term stability of this physics.';
    } else if (signDE > 0 && deModel === 'constant' && w0 < -1) {
      result.classification = 'Big Rip under constant phantom energy';
      result.explanation =
        'The selected persistent w < −1 causes dark-energy density to grow with expansion. The integral of da/(aH) to infinite scale factor converges: this model has a finite future singularity, although the selected endpoint may precede it.';
    } else if (signDE > 0 && deModel === 'constant') {
      result.classification =
        w0 < -1 / 3
          ? 'Eternal accelerated power-law expansion'
          : 'Long-lived decelerating expansion';
      result.explanation =
        'For the selected constant equation of state, the dominant positive component dilutes as a power of the scale factor. This conditional continuation does not determine the ultimate microphysical fate.';
    } else if (signDE === 0 && c.omegaK >= 0) {
      result.classification = 'Long-lived decelerating expansion';
      result.explanation =
        'With the selected nonnegative matter, radiation and curvature terms and no dark energy, the expansion persists with a declining Hubble rate.';
    } else {
      result.classification = 'Undetermined with current physics';
      result.explanation =
        'The computed interval is conditional on the selected dynamical model. This implementation does not establish a unique infinite-future asymptote for this model.';
    }
  }
  function extendTail(startLog: number, endLog: number) {
    const b = background(x, y);
    let n: number, dominant: number;
    const constant =
      deModel === 'lambda' || deModel === 'constant' || deModel === 'bounded';
    const futureW =
      deModel === 'lambda' ? -1 : deModel === 'bounded' ? w0 + wa : w0;
    const exponents = [
      3,
      c.dmModel === 'warm'
        ? 3 * (1 + c.warmW)
        : c.dmModel === 'interacting'
          ? 3 + c.interaction
          : 3,
      4,
      3 * (1 + futureW),
      2,
    ];
    if (
      constant &&
      signDE > 0 &&
      exponents[3] <
        Math.min(
          ...exponents.filter((_, i) => i !== 3 && Number.isFinite(b.logs[i])),
        )
    ) {
      n = exponents[3];
      dominant = 3;
    } else if (signDE === 0 && c.dmModel === 'stable' && c.omegaK >= 0) {
      dominant = c.omegaK > 0 ? 4 : matter + c.omegaDM > 0 ? 0 : 2;
      n = exponents[dominant];
    } else {
      result.status = 'limited';
      result.diagnostics.reason =
        'No proven constant-fluid asymptote for this model. Numerical expansion stops at ln(a)=60; arbitrary CPL/custom extrapolation is not continued.';
      return;
    }
    const domFraction =
      dominant === 0 ? b.fractions[0] + b.fractions[1] : b.fractions[dominant];
    if (Math.abs(1 - domFraction) > 1e-8) {
      result.status = 'limited';
      result.diagnostics.reason =
        'Asymptotic dominance threshold (1−fraction < 10⁻⁸) was not met.';
      return;
    }
    const last = result.samples[result.samples.length - 1];
    let anchorLog = startLog,
      anchorA = x / LN10,
      anchorLogLogA = Math.log10(Math.max(anchorA, 1e-300)),
      anchorH = Math.log10(c.H0) + b.logE / LN10,
      anchor = last;
    result.diagnostics.tail = `Matched constant-fluid asymptote, ρ ∝ a^(${(-n).toPrecision(5)}), subdominant fraction < 10⁻⁸. Future source ratios cannot overtake the dominant term. Numeric integration ends at log10(elapsed yr)=${startLog.toFixed(5)}.`;
    classifyFinite();
    result.classification =
      n === 0
        ? 'Asymptotic de Sitter expansion'
        : n < 0
          ? 'Big Rip under constant phantom energy'
          : n < 2
            ? 'Eternal accelerated power-law expansion'
            : 'Long-lived decelerating expansion';
    result.explanation =
      n === 0
        ? 'The resolved background approaches a positive constant-density fluid. With the specified stable future law, H tends to a constant and expansion continues. Heat death remains an additional conditional thermodynamic interpretation.'
        : n < 0
          ? 'The proven phantom asymptote increases H and density as expansion proceeds. Its proper-time integral to infinite scale factor converges, giving a finite model singularity.'
          : 'The selected model approaches a proven constant-fluid power law. Density decreases with expansion, and the future proper-time integral does not end at a finite Big Rip. Microphysical ultimate fate remains uncertain.';
    const allTargets = [
      ...new Set([
        ...Array.from(
          { length: c.samples },
          (_, i) => startLog + ((endLog - startLog) * (i + 1)) / c.samples,
        ),
        ...eventQueue
          .slice(eventIndex)
          .filter((e) => e.logTime > startLog && e.logTime <= endLog)
          .map((e) => e.logTime),
      ]),
    ].sort((a, b) => a - b);
    let lastTail = last;
    for (const lt of allTargets) {
      const dtLog = lt + Math.log10(-Math.expm1((anchorLog - lt) * LN10));
      const heLog = anchorH + Math.log10(H0_YEAR),
        p = n / 2;
      let newA: number, logLogA: number, newH: number, deltaA: number;
      if (p < 0) {
        const tail = -(Math.log10(-p) + heLog);
        const ripLog =
          Math.max(anchorLog, tail) +
          Math.log10(
            10 ** (anchorLog - Math.max(anchorLog, tail)) +
              10 ** (tail - Math.max(anchorLog, tail)),
          );
        if (lt >= ripLog - 1e-10) {
          specialEvents.push({
            id: 'rip',
            title: 'Finite-time Big Rip boundary',
            logYears: ripLog,
            detail:
              'Matched constant-phantom tail: the scale factor and Hubble rate diverge at finite proper time. Samples stop before this boundary.',
            reliability: 'Model dependent',
            sources: ['phantom2003'],
          });
          result.status = 'terminated';
          result.classification = 'Big Rip';
          result.diagnostics.reason =
            'Finite future-time integral; singularity boundary reached.';
          break;
        }
        const u = 10 ** (Math.log10(-p) + heLog + dtLog);
        const dx = Math.log1p(-u) / p;
        deltaA = dx / LN10;
        newA = anchorA + deltaA;
        logLogA = Number.isFinite(newA)
          ? Math.log10(Math.max(newA, 1e-300))
          : anchorLogLogA;
        newH = anchorH - p * deltaA;
      } else if (p === 0) {
        const dxLog = heLog + dtLog - Math.log10(LN10);
        logLogA =
          Math.max(anchorLogLogA, dxLog) +
          Math.log10(
            10 ** (anchorLogLogA - Math.max(anchorLogLogA, dxLog)) +
              10 ** (dxLog - Math.max(anchorLogLogA, dxLog)),
          );
        deltaA = dxLog < 307 ? 10 ** dxLog : Infinity;
        newA = logLogA < 307 ? 10 ** logLogA : Infinity;
        newH = anchorH;
      } else {
        const productLog = Math.log10(p) + heLog + dtLog;
        const dx =
          (productLog > 30 ? productLog * LN10 : Math.log1p(10 ** productLog)) /
          p;
        deltaA = dx / LN10;
        newA = anchorA + deltaA;
        logLogA = Number.isFinite(newA)
          ? Math.log10(Math.max(newA, 1e-300))
          : anchorLogLogA;
        newH = anchorH - p * deltaA;
      }
      const radius = Math.log10(299792.458) - newH;
      const s: Sample = {
        ...anchor,
        logYears: lt,
        logA: safe(newA),
        expansionIndex: logLogA > 12 ? logLogA : Math.log10(1 + 10 ** logLogA),
        logH: safe(newH),
        logRhoB: safe(log(c.omegaB) / LN10 - 3 * newA),
        logRhoDM: safe((anchor.logRhoDM ?? -Infinity) - 3 * deltaA),
        logRhoR: safe((anchor.logRhoR ?? -Infinity) - 4 * deltaA),
        logRhoDE:
          n === 0
            ? anchor.logRhoDE
            : safe((anchor.logRhoDE ?? -Infinity) - n * deltaA),
        logTcmb: safe(Math.log10(c.Tcmb) - newA),
        logRadiationEffectiveT: null,
        q: n / 2 - 1,
        w: dominant === 3 ? n / 3 - 1 : null,
        logHubbleRadiusMpc: safe(radius),
        logComovingHubbleMpc: safe(radius - newA),
        logHorizonEntropy:
          n === 0
            ? Math.log10(Math.PI) +
              2 * (radius + 22.48935055 + 34.791) -
              Math.log10(g)
            : null,
        omegaM: dominant === 0 ? 1 : 0,
        omegaR: dominant === 2 ? 1 : 0,
        omegaDE: dominant === 3 ? 1 : 0,
        omegaK: dominant === 4 ? 1 : 0,
        ...astrophysics(lt, c),
        regime: 'asymptotic',
        constraintResidual: 0,
      };
      if (c.dmModel === 'decay') {
        const ratioLog = dtLog - c.dmLogLifetime;
        s.logRhoDM =
          ratioLog < 307 && s.logRhoDM !== null
            ? s.logRhoDM - 10 ** ratioLog / LN10
            : null;
        s.logRhoR = null;
      }
      if (c.dmModel === 'interacting') {
        s.logRhoDM = safe(
          (anchor.logRhoDM ?? -Infinity) - (3 + c.interaction) * deltaA,
        );
        s.logRhoR = null;
      }
      if (c.dmModel === 'warm')
        s.logRhoDM = safe(
          (anchor.logRhoDM ?? -Infinity) - 3 * (1 + c.warmW) * deltaA,
        );
      if (c.dmModel === 'annihilation') s.logRhoR = null;
      result.samples.push(s);
      lastTail = s;
      if (
        eventIndex < eventQueue.length &&
        eventQueue[eventIndex].logTime <= lt + 1e-9
      ) {
        anchorLog = lt;
        anchorA = newA;
        anchorLogLogA = logLogA;
        anchorH = newH;
        anchor = { ...s };
      }
      while (
        eventIndex < eventQueue.length &&
        eventQueue[eventIndex].logTime <= lt + 1e-9
      ) {
        const e = eventQueue[eventIndex++];
        specialEvents.push({
          id: e.id,
          title: `Custom event: ${e.action}`,
          logYears: e.logTime,
          detail: `External intervention, value ${e.value}. Conservation across the discontinuity is not implied.`,
          reliability: 'Pure what-if',
          sources: [],
        });
        if (e.action === 'change-w' && dominant === 3) {
          const candidate = 3 * (1 + e.value);
          const competitor = Math.min(
            ...exponents.filter(
              (_, i) => i !== 3 && Number.isFinite(b.logs[i]),
            ),
          );
          if (candidate >= competitor) {
            result.status = 'limited';
            result.diagnostics.reason =
              'The new w permits another fluid to overtake dark energy; a single-fluid tail is no longer justified.';
            break;
          }
          n = candidate;
          deModel = 'constant';
          w0 = e.value;
          result.classification = 'Custom / nonstandard evolution';
        } else if (e.action === 'change-G' && e.value > 0) {
          if (c.omegaK !== 0) {
            result.status = 'limited';
            result.diagnostics.reason =
              'Changing G in a curved model requires separate curvature and density matching. This intervention is supported only for flat models.';
            break;
          }
          anchorH += Math.log10(e.value / g) / 2;
          g = e.value;
          result.classification = 'Custom / nonstandard evolution';
        } else if (
          e.action === 'vacuum-scale' &&
          e.value > 0 &&
          dominant === 3
        ) {
          const changedDE =
            anchor.logRhoDE === null
              ? null
              : anchor.logRhoDE + Math.log10(e.value);
          // Recheck physical source ratios, including signed curvature, after a discontinuous vacuum change.
          const competing = [
            anchor.logRhoB,
            anchor.logRhoDM,
            anchor.logRhoR,
            c.omegaNu > 0 ? Math.log10(c.omegaNu) - 3 * anchorA : null,
            c.omegaK !== 0
              ? Math.log10(Math.abs(c.omegaK)) - 2 * anchorA
              : null,
          ];
          const contamination =
            changedDE === null
              ? Infinity
              : competing.reduce<number>(
                  (sum, v) => sum + (v === null ? 0 : 10 ** (v - changedDE)),
                  0,
                );
          if (contamination > 1e-8) {
            result.status = 'limited';
            result.diagnostics.reason =
              'Vacuum rescaling invalidated the single-fluid dominance threshold; a new multi-fluid segment is required.';
            break;
          }
          anchorH += Math.log10(e.value) / 2;
          anchor.logRhoDE = changedDE;
          result.classification = 'Custom / nonstandard evolution';
        } else {
          result.status = 'limited';
          result.diagnostics.reason = `Custom ${e.action} boundary reached at 10^${lt.toPrecision(5)} years. This rule invalidates the proven asymptote; no valid continuation is asserted.`;
          break;
        }
      }
      if (result.status === 'limited') break;
    }
    if (lastTail.logA === null)
      result.warnings.push(
        'Some log10(a), density logs and temperature logs themselves exceed IEEE-754 range. They are explicitly null; the nested-log expansion coordinate remains valid. Null also denotes absent components or quantities not justified in this regime.',
      );
  }

  function integrateContraction() {
    // A time-domain acceleration equation crosses H=0 without selecting an unphysical square root.
    const n = c.deModel === 'lambda' ? 0 : 3 * (1 + c.w0),
      M = matter + c.omegaDM;
    const density = (a: number) => [
      M / a ** 3,
      c.omegaR / a ** 4,
      c.omegaDE / a ** n,
      c.omegaK / a ** 2,
    ];
    const f = (u: number, z: number[]) => {
      const [a, v] = z;
      if (a <= 0) throw new Error('Scale factor reached zero.');
      const [m, r, d] = density(a);
      return [
        Math.exp(u) * v,
        -0.5 * Math.exp(u) * a * (m + 2 * r + (n - 2) * d),
      ];
    };
    const endU =
      effectiveEnd + logH0 > 300
        ? 700
        : Math.log1p(10 ** (effectiveEnd + logH0));
    let u = 0,
      z = [1, 1],
      h = 0.002,
      turned = false,
      steps = 0;
    const pts: { u: number; z: number[] }[] = [{ u, z: [...z] }];
    while (steps++ < 30000 && u < endU) {
      h = Math.min(h, endU - u);
      let s;
      try {
        s = dopriStep(f, u, z, h, c.rtol, c.atol);
      } catch {
        h *= 0.2;
        if (h < 1e-13) {
          result.status = 'limited';
          result.diagnostics.reason =
            'Time-domain branch reached minimum step near a singularity.';
          break;
        }
        continue;
      }
      if (s.error > 1) {
        h *= s.factor;
        result.diagnostics.rejectedSteps++;
        continue;
      }
      const previousU = u,
        previousZ = z;
      u += h;
      z = s.y;
      result.diagnostics.acceptedSteps++;
      pts.push({ u, z: [...z] });
      if (!turned && z[1] < 0) {
        let lo = 0,
          hi = h;
        for (let k = 0; k < 42; k++) {
          const mid = (lo + hi) / 2;
          const at = dopriStep(f, previousU, previousZ, mid, c.rtol, c.atol);
          if (at.y[1] > 0) lo = mid;
          else hi = mid;
        }
        const rootU = previousU + (lo + hi) / 2;
        turned = true;
        specialEvents.push({
          id: 'turn',
          title: 'Expansion turns into contraction',
          logYears: Math.log10(Math.expm1(rootU)) - logH0,
          detail:
            'Velocity changes sign at a root refined within an accepted step of the regular time-domain acceleration equation. The Friedmann constraint is checked independently.',
          reliability: 'Model dependent',
          sources: ['friedmann1922'],
        });
      }
      if (turned && z[0] < 1e-4) {
        result.status = 'terminated';
        result.classification = 'Big Crunch approach';
        result.diagnostics.reason =
          'Contracting scale factor reached a=10⁻⁴. The singularity itself and quantum-gravity regime are not integrated.';
        break;
      }
      if (z[0] > 1e12) {
        result.status = 'limited';
        result.diagnostics.reason =
          'Time-domain signed-curvature branch reached the supported expansion scale; no unproven continuation.';
        break;
      }
      h = Math.min(0.02, h * s.factor);
    }
    if (steps >= 30000) {
      result.status = 'limited';
      result.diagnostics.reason = 'Time-domain integration budget reached.';
    }
    const lastU = pts[pts.length - 1].u;
    const stopLog = Math.min(
      effectiveEnd,
      Math.log10(Math.expm1(lastU)) - logH0,
    );
    const firstLog = Math.min(0, stopLog);
    const times = [
      ...new Set([
        ...Array.from(
          { length: c.samples },
          (_, i) => firstLog + ((stopLog - firstLog) * i) / (c.samples - 1),
        ),
        ...specialEvents
          .filter((e) => e.id === 'turn' && e.logYears <= stopLog)
          .map((e) => e.logYears),
      ]),
    ].sort((a, b) => a - b);
    let pointIndex = 0;
    const outputPoints = [
      pts[0],
      ...times.map((lt) => {
        const targetU = Math.min(lastU, Math.log1p(10 ** (lt + logH0)));
        while (pointIndex + 1 < pts.length && pts[pointIndex + 1].u < targetU)
          pointIndex++;
        const start = pts[pointIndex];
        return {
          u: targetU,
          z:
            targetU === start.u
              ? start.z
              : dopriStep(
                  f,
                  start.u,
                  start.z,
                  targetU - start.u,
                  c.rtol,
                  c.atol,
                ).y,
        };
      }),
    ];
    for (const p of outputPoints) {
      const a = p.z[0],
        v = p.z[1],
        tau = Math.expm1(p.u),
        lt = tau > 0 ? Math.log10(tau) - logH0 : 0;
      if (lt > effectiveEnd + 1e-9) continue;
      const [m, r, d, k] = density(a),
        E = v / a,
        scale = Math.abs(m) + r + Math.abs(d) + Math.abs(k),
        residual = Math.abs(E * E - (m + r + d + k)) / Math.max(1e-300, scale);
      const la = Math.log10(a),
        eh = E === 0 ? null : Math.log10(c.H0 * Math.abs(E));
      result.diagnostics.maxConstraintResidual = Math.max(
        result.diagnostics.maxConstraintResidual,
        residual,
      );
      result.samples.push({
        logYears: lt,
        isPresent: tau === 0,
        logA: la,
        expansionIndex: Math.sign(la) * Math.log10(1 + Math.abs(la)),
        logH: eh,
        logRhoB: safe(Math.log10(c.omegaB) - 3 * la),
        logRhoDM: safe(Math.log10(c.omegaDM) - 3 * la),
        logRhoR: safe(Math.log10(c.omegaR) - 4 * la),
        logRhoDE: safe(Math.log10(Math.abs(c.omegaDE)) - n * la),
        omegaM: E * E > 1e-20 ? m / (E * E) : null,
        omegaR: E * E > 1e-20 ? r / (E * E) : null,
        omegaDE: E * E > 1e-20 ? d / (E * E) : null,
        omegaK: E * E > 1e-20 ? k / (E * E) : null,
        logTcmb: Math.log10(c.Tcmb) - la,
        logRadiationEffectiveT: Math.log10(c.Tcmb) - la,
        q: E * E > 1e-20 ? (0.5 * (m + 2 * r + (n - 2) * d)) / (E * E) : null,
        w: c.deModel === 'lambda' ? -1 : c.w0,
        logHubbleRadiusMpc: eh === null ? null : Math.log10(299792.458) - eh,
        logComovingHubbleMpc:
          eh === null ? null : Math.log10(299792.458) - eh - la,
        logHorizonEntropy: null,
        ...astrophysics(tau === 0 ? -Infinity : lt, c),
        regime: v < 0 ? 'contraction' : 'numerical',
        constraintResidual: residual,
      });
    }
    result.diagnostics.numericalUntilLogYears =
      Math.log10(Math.expm1(lastU)) - logH0;
    if (result.diagnostics.maxConstraintResidual > 1e-4) {
      result.status = 'limited';
      result.diagnostics.reason =
        'Friedmann-constraint drift exceeded 10⁻⁴; time-domain solution requires tighter tolerances.';
    }
    if (turned) {
      if (result.classification === 'Undetermined')
        result.classification = 'Recollapsing Universe';
      result.explanation =
        'The selected curvature or negative dark energy permits the expansion velocity to reach zero. The acceleration equation then evolves a contracting branch. This is a conditional classical solution; a final singularity is outside the resolved domain.';
    } else classifyFinite();
  }
  const lastLog = result.samples.at(-1)?.logYears ?? 0;
  if (
    vacuumLog <= c.endLogYears &&
    Math.abs(lastLog - vacuumLog) < 1e-8 &&
    result.status === 'complete'
  ) {
    result.samples = result.samples.filter((s) => s.logYears <= vacuumLog);
    result.classification = 'Vacuum-decay termination';
    result.status = 'terminated';
    result.explanation =
      'A seeded, user-assumed local Poisson clock terminated this branch. This is not a measured vacuum lifetime or a spacetime nucleation calculation.';
    specialEvents.push({
      id: 'vacuum',
      title: 'Assumed local vacuum-decay event',
      logYears: vacuumLog,
      detail: result.explanation,
      reliability: 'Theoretically speculative',
      sources: ['vacuum2024'],
    });
  }
  if (result.status === 'limited')
    result.classification = 'Undetermined · numerical/model boundary';
  if (c.sandbox && c.events.length)
    result.explanation +=
      ' Custom interventions are nonstandard; energy or momentum conservation at their boundaries is not established.';
  result.events = [
    ...cosmicEvents(c, result.samples, lastLog),
    ...specialEvents,
  ].sort((a, b) => a.logYears - b.logYears);
  if (
    result.status === 'terminated' &&
    result.classification === 'Big Crunch approach'
  )
    result.events.push({
      id: 'crunch',
      title: 'Classical collapse boundary',
      logYears: lastLog,
      detail: result.diagnostics.reason,
      reliability: 'Model dependent',
      sources: ['friedmann1922'],
    });
  return result;
}
