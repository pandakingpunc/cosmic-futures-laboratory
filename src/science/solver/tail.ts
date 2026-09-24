import { astrophysics } from '../astrophysics';
import {
  C_KM_S,
  H0_YEAR,
  LN10,
  LOG10_INV_PLANCK_M,
  LOG10_MPC_M,
} from '../core/constants';
import { ln, safe } from '../core/numeric';
import { background, type Model } from '../model/background';
import type { Stop } from '../model/segment';
import type { CosmicEvent, PhysicsEvent, Sample } from '../types';
import type { Node } from './expanding';
import {
  applyTailIntervention,
  type TailContext,
  type TailState,
} from './tail-intervention';
export interface TailInput {
  model: Model;
  /** Final numerical node; its segment continues into the tail. */
  final: Node;
  /** Last numerical sample, the anchor of the matched asymptote. */
  last: Sample;
  startLog: number;
  endLog: number;
  queue: readonly PhysicsEvent[];
  eventIndex: number;
}
export type TailOutcome =
  | { proven: false; reason: string }
  | {
      proven: true;
      /** Density exponent n of ρ ∝ a⁻ⁿ at the anchor, before interventions. */
      exponent: number;
      /** Description of the matched asymptote for the diagnostics. */
      tail: string;
      samples: Sample[];
      events: CosmicEvent[];
      stop: Stop | null;
      /** An intervention changed the asymptote. */
      nonstandard: boolean;
      rip: boolean;
      warnings: string[];
    };
const UNSUPPORTED =
  'No proven constant-fluid asymptote for this model. Numerical expansion stops at ln(a)=60; arbitrary CPL/custom extrapolation is not continued.';
const EXTREME_RANGE =
  'Some log10(a), density logs and temperature logs themselves exceed IEEE-754 range. They are explicitly null; the nested-log expansion coordinate remains valid. Null also denotes absent components or quantities not justified in this regime.';
/**
 * Continues a resolved background past the numerical endpoint along a
 * matched constant-fluid power law, where one component dominates to 10⁻⁸.
 */
export function extendTail(input: TailInput): TailOutcome {
  const { model, final, last, startLog, endLog, queue } = input;
  const { c } = model,
    segment = final.segment;
  const b = background(final.x, final.y, segment, model);
  let n: number, dominant: number;
  const constant =
    segment.deModel === 'lambda' ||
    segment.deModel === 'constant' ||
    segment.deModel === 'bounded';
  const futureW =
    segment.deModel === 'lambda'
      ? -1
      : segment.deModel === 'bounded'
        ? segment.w0 + segment.wa
        : segment.w0;
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
  const competitor = Math.min(
    ...exponents.filter((_, i) => i !== 3 && Number.isFinite(b.logs[i])),
  );
  if (constant && segment.signDE > 0 && exponents[3] < competitor) {
    n = exponents[3];
    dominant = 3;
  } else if (segment.signDE === 0 && c.dmModel === 'stable' && c.omegaK >= 0) {
    dominant = c.omegaK > 0 ? 4 : model.matter + c.omegaDM > 0 ? 0 : 2;
    n = exponents[dominant];
  } else return { proven: false, reason: UNSUPPORTED };
  const domFraction =
    dominant === 0 ? b.fractions[0] + b.fractions[1] : b.fractions[dominant];
  if (Math.abs(1 - domFraction) > 1e-8)
    return {
      proven: false,
      reason: 'Asymptotic dominance threshold (1−fraction < 10⁻⁸) was not met.',
    };
  const ctx: TailContext = { dominant, competitor, c };
  let state: TailState = {
      n,
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
  const allTargets = [
    ...new Set([
      ...Array.from(
        { length: c.samples },
        (_, i) => startLog + ((endLog - startLog) * (i + 1)) / c.samples,
      ),
      ...queue
        .slice(eventIndex)
        .filter((e) => e.logTime > startLog && e.logTime <= endLog)
        .map((e) => e.logTime),
    ]),
  ].sort((a, b) => a - b);
  for (const lt of allTargets) {
    const { anchor, anchorA, anchorH } = state;
    const dtLog = lt + Math.log10(-Math.expm1((anchorLog - lt) * LN10));
    const heLog = anchorH + Math.log10(H0_YEAR),
      p = state.n / 2;
    let newA: number, logLogA: number, newH: number, deltaA: number;
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
    const n = state.n,
      radius = Math.log10(C_KM_S) - newH;
    const s: Sample = {
      ...anchor,
      logYears: lt,
      logA: safe(newA),
      expansionIndex: logLogA > 12 ? logLogA : Math.log10(1 + 10 ** logLogA),
      logH: safe(newH),
      logRhoB: safe(ln(c.omegaB) / LN10 - 3 * newA),
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
            2 * (radius + LOG10_MPC_M + LOG10_INV_PLANCK_M) -
            Math.log10(state.g)
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
    samples.push(s);
    lastTail = s;
    if (eventIndex < queue.length && queue[eventIndex].logTime <= lt + 1e-9) {
      // Re-anchor at this sample before the interventions apply.
      anchorLog = lt;
      anchorLogLogA = logLogA;
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
  }
  return {
    proven: true,
    exponent: n,
    tail: tailText,
    samples,
    events,
    stop,
    nonstandard,
    rip,
    warnings: lastTail.logA === null ? [EXTREME_RANGE] : [],
  };
}
