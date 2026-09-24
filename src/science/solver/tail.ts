import { astrophysics, horizonGap } from '../astrophysics';
import {
  C_KM_S,
  H0_YEAR,
  LN10,
  logDeSitterEntropy,
  logHorizonTemperature,
} from '../core/constants';
import { ln, safe } from '../core/numeric';
import { asymptote } from '../model/asymptote';
import { background, type Model } from '../model/background';
import type { Stop } from '../model/segment';
import type { CosmicEvent, PhysicsEvent, Sample } from '../types';
import { pieceCrossings, type Pending, type TailCrossings } from './crossings';
import type { Node } from './expanding';
import { DOMINANCE } from './sampling';
import {
  applyTailIntervention,
  type TailContext,
  type TailState,
} from './tail-intervention';
export interface TailInput {
  model: Model;
  /** Final numerical node; its segment continues into the tail. */
  final: Node;
  /** Sample at the final node, the anchor of the matched asymptote. */
  last: Sample;
  startLog: number;
  endLog: number;
  queue: readonly PhysicsEvent[];
  eventIndex: number;
  /** Crossings the numerical branch left to the tail. */
  pending?: Pending;
}
export type TailOutcome =
  | { proven: false; reason: string }
  | {
      proven: true;
      /** Density exponent n of ρ ∝ a⁻ⁿ at the anchor, before interventions. */
      exponent: number;
      /** The exponent in force at the end of the tail. */
      finalExponent: number;
      /** Description of the matched asymptote for the diagnostics. */
      tail: string;
      samples: Sample[];
      events: CosmicEvent[];
      stop: Stop | null;
      /** An intervention changed the asymptote. */
      nonstandard: boolean;
      rip: boolean;
      /** Index of the first queued event not yet executed. */
      eventIndex: number;
      warnings: string[];
      crossings: TailCrossings;
    };
const EXTREME_RANGE =
  'Some log10(a), density logs and temperature logs themselves exceed IEEE-754 range. They are explicitly null; the nested-log expansion coordinate remains valid. Null also denotes absent components or quantities not justified in this regime.';
/** Background indices grouped as the reported density fractions. */
const GROUPS = [[0, 1], [2], [3], [4]];
/**
 * Continues a resolved background past the numerical endpoint along a
 * matched constant-fluid power law, where one component, or a set sharing
 * one exponent, dominates to 10⁻⁸.
 */
export function extendTail(input: TailInput): TailOutcome {
  const { model, final, last, startLog, endLog, queue } = input;
  const { c } = model,
    segment = final.segment;
  const b = background(final.x, final.y, segment, model);
  const fate = asymptote(model, b, segment);
  if ('reason' in fate) return { proven: false, reason: fate.reason };
  if (fate.tailReason) return { proven: false, reason: fate.tailReason };
  const { n, dominant } = fate;
  const exponents = [
    3,
    c.dmModel === 'warm'
      ? 3 * (1 + c.warmW)
      : c.dmModel === 'interacting'
        ? 3 + c.interaction
        : 3,
    4,
    NaN,
    2,
  ];
  const competitor = Math.min(
    ...exponents.filter((_, i) => i !== 3 && Number.isFinite(b.logs[i])),
  );
  const domFraction = dominant.reduce((sum, i) => sum + b.fractions[i], 0);
  if (Math.abs(1 - domFraction) > DOMINANCE)
    return {
      proven: false,
      reason: 'Asymptotic dominance threshold (1−fraction < 10⁻⁸) was not met.',
    };
  // One dominant group has fraction 1; a tie keeps its matched fractions.
  const group = GROUPS.findIndex((g) => g.includes(dominant[0]));
  const single = dominant.every((i) => GROUPS[group].includes(i));
  const fraction = (k: number, anchorValue: number | null) =>
    single ? (k === group ? 1 : 0) : anchorValue;
  const ctx: TailContext = {
    deAlone: dominant.length === 1 && dominant[0] === 3,
    competitor,
    c,
  };
  let state: TailState = {
      n,
      deN: fate.deN,
      anchorA: final.x / LN10,
      anchorH: Math.log10(c.H0) + b.logE / LN10,
      g: segment.g,
      anchor: last,
    },
    anchorLog = startLog,
    anchorLogLogA = Math.log10(Math.max(state.anchorA, 1e-300)),
    eventIndex = input.eventIndex,
    stop: Stop | null = null,
    nonstandard = false,
    rip = false,
    lastTail = last;
  const tailText = `Matched constant-fluid asymptote, ρ ∝ a^(${(-n).toPrecision(5)}), subdominant fraction < 10⁻⁸. Future source ratios cannot overtake the dominant term. Numeric integration ends at log10(elapsed yr)=${startLog.toFixed(5)}.`;
  const samples: Sample[] = [],
    events: CosmicEvent[] = [];
  // A branch resolved for less than one year starts its grid at one year.
  const gridStart = Math.max(0, startLog);
  const allTargets = [
    ...new Set([
      ...Array.from(
        { length: c.samples },
        (_, i) => gridStart + ((endLog - gridStart) * (i + 1)) / c.samples,
      ),
      ...queue
        .slice(eventIndex)
        .filter((e) => e.logTime > startLog && e.logTime <= endLog)
        .map((e) => e.logTime),
    ]),
  ].sort((a, b) => a - b);
  const grid = new Set(allTargets),
    pending = input.pending,
    crossings: TailCrossings = {
      cool: c.blackHoleMasses.map(() => null),
      horizon: null,
    };
  let anchorX = final.x,
    armed = pending?.horizonArmed ?? false;
  /** Crossings under the current law that receive a sample of their own. */
  const locate = (): number[] => {
    const next = queue[eventIndex];
    const found = pieceCrossings(
      c,
      { x: anchorX, logYears: anchorLog, logH: state.anchorH, n: state.n },
      next && next.logTime <= endLog ? next.logTime : endLog,
      pending,
      crossings,
      armed,
    );
    // A sample just before an intervention would take over its re-anchoring.
    return found
      .filter(
        (lt) => lt >= 0 && !(next && lt > next.logTime - 1e-9) && !grid.has(lt),
      )
      .sort((a, b) => a - b);
  };
  let located = locate(),
    gi = 0,
    li = 0;
  while (gi < allTargets.length || li < located.length) {
    const lt = Math.min(allTargets[gi] ?? Infinity, located[li] ?? Infinity);
    if (allTargets[gi] === lt) gi++;
    else li++;
    const { anchor, anchorA, anchorH } = state;
    const dtLog = lt + Math.log10(-Math.expm1((anchorLog - lt) * LN10));
    const heLog = anchorH + Math.log10(H0_YEAR),
      p = state.n / 2;
    let newA: number, logLogA: number, newH: number, deltaA: number, dx: number;
    if (p < 0) {
      const tailLog = -(Math.log10(-p) + heLog);
      const ripLog =
        Math.max(anchorLog, tailLog) +
        Math.log10(
          10 ** (anchorLog - Math.max(anchorLog, tailLog)) +
            10 ** (tailLog - Math.max(anchorLog, tailLog)),
        );
      if (lt >= ripLog - 1e-10) {
        events.push({
          id: 'rip',
          title: 'Finite-time Big Rip boundary',
          logYears: ripLog,
          detail:
            'Matched constant-phantom tail: the scale factor and Hubble rate diverge at finite proper time. Samples stop before this boundary.',
          reliability: 'Model dependent',
          sources: ['phantom2003'],
        });
        rip = true;
        stop = {
          status: 'terminated',
          reason: 'Finite future-time integral; singularity boundary reached.',
        };
        break;
      }
      const u = 10 ** (Math.log10(-p) + heLog + dtLog);
      dx = Math.log1p(-u) / p;
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
      dx = deltaA * LN10;
      newA = logLogA < 307 ? 10 ** logLogA : Infinity;
      newH = anchorH;
    } else {
      const productLog = Math.log10(p) + heLog + dtLog;
      dx =
        (productLog > 30 ? productLog * LN10 : Math.log1p(10 ** productLog)) /
        p;
      deltaA = dx / LN10;
      newA = anchorA + deltaA;
      logLogA = Number.isFinite(newA)
        ? Math.log10(Math.max(newA, 1e-300))
        : anchorLogLogA;
      newH = anchorH - p * deltaA;
    }
    const { n, deN } = state,
      radius = Math.log10(C_KM_S) - newH;
    const s: Sample = {
      ...anchor,
      logYears: lt,
      isPresent: false,
      logA: safe(newA),
      expansionIndex: logLogA > 12 ? logLogA : Math.log10(1 + 10 ** logLogA),
      logH: safe(newH),
      logRhoB: safe(ln(c.omegaB) / LN10 - 3 * newA),
      logRhoDM: safe((anchor.logRhoDM ?? -Infinity) - 3 * deltaA),
      logRhoR: safe((anchor.logRhoR ?? -Infinity) - 4 * deltaA),
      logRhoDE:
        deN === null
          ? null
          : deN === 0
            ? anchor.logRhoDE
            : safe((anchor.logRhoDE ?? -Infinity) - deN * deltaA),
      logTcmb: safe(Math.log10(c.Tcmb) - newA),
      logRadiationEffectiveT: null,
      q: n / 2 - 1,
      w: deN === null ? null : deN / 3 - 1,
      logHubbleRadiusMpc: safe(radius),
      logComovingHubbleMpc: safe(radius - newA),
      logHorizonEntropy: n === 0 ? logDeSitterEntropy(radius, state.g) : null,
      logHorizonTemperature: n === 0 ? logHorizonTemperature(newH) : null,
      omegaM: fraction(0, anchor.omegaM),
      omegaR: fraction(1, anchor.omegaR),
      omegaDE: fraction(2, anchor.omegaDE),
      omegaK: fraction(3, anchor.omegaK),
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
    samples.push(s);
    lastTail = s;
    const reanchor =
      eventIndex < queue.length && queue[eventIndex].logTime <= lt + 1e-9;
    if (reanchor) {
      // Re-anchor at this sample before the interventions apply.
      anchorLog = lt;
      anchorLogLogA = logLogA;
      anchorX += dx;
      armed = crossings.horizon === null && horizonGap(c, newA, newH) >= 0;
      state = { ...state, anchorA: newA, anchorH: newH, anchor: { ...s } };
    }
    while (
      eventIndex < queue.length &&
      queue[eventIndex].logTime <= lt + 1e-9
    ) {
      const e = queue[eventIndex++];
      events.push({
        id: e.id,
        title: `Custom event: ${e.action}`,
        logYears: e.logTime,
        detail: `External intervention, value ${e.value}. Conservation across the discontinuity is not implied.`,
        reliability: 'Pure what-if',
        sources: [],
      });
      const change = applyTailIntervention(e, lt, state, ctx);
      if ('status' in change) {
        stop = change;
        break;
      }
      state = change;
      nonstandard = true;
    }
    if (stop) break;
    if (reanchor) {
      // A jump of H can move the horizon temperature above the CMB at once.
      const gap = horizonGap(c, state.anchorA, state.anchorH);
      if (armed && gap < 0 && state.n === 0) crossings.horizon = lt;
      armed = crossings.horizon === null && gap >= 0;
      located = locate().filter((t) => t > lt);
      li = 0;
    }
  }
  return {
    proven: true,
    exponent: n,
    finalExponent: state.n,
    tail: tailText,
    samples,
    events,
    stop,
    nonstandard,
    rip,
    eventIndex,
    warnings: lastTail.logA === null ? [EXTREME_RANGE] : [],
    crossings,
  };
}
