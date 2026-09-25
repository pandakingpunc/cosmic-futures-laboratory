import { ln } from '../core/numeric';
import { pow10 } from '../core/pow';
import { background, derivative, type Model } from '../model/background';
import {
  EXTINCTION,
  altersDarkEnergy,
  cplTheorem,
  extinctionEvent,
  type CplTheorem,
} from '../model/cpl';
import {
  applyNumericalIntervention,
  initialSegment,
  undefinedBranchReason,
  type Segment,
  type Stop,
} from '../model/segment';
import type { WorkBudget } from '../core/limits';
import type { CosmicEvent, PhysicsEvent } from '../types';
import { counted, rethrowBudget, type SimulationCounters } from './counters';
import { dopriStep, type Derivative } from './dopri5';
/** An accepted state with the segment in force there. */
export interface Node {
  readonly x: number;
  readonly y: readonly number[];
  readonly segment: Segment;
}
export interface ExpansionOutcome {
  /** Accepted states; an intervention adds a second node at the same x. */
  nodes: Node[];
  stop: Stop | null;
  acceptedSteps: number;
  rejectedSteps: number;
  maxErrorNorm: number;
  /** Index of the first queued event not yet executed. */
  eventIndex: number;
  events: CosmicEvent[];
  /** The accepted state where a CPL proof applied, or null. */
  continuation: Continuation | null;
}
/**
 * A CPL state that satisfies a continuation theorem. For extinction the
 * branch goes on with the dark energy removed (a second node at the same x);
 * for big-rip the numerical branch ends here. A closed model stops at its
 * extinction instead, since its CPL density would grow back after the
 * turnaround.
 */
export interface Continuation extends Node {
  theorem: CplTheorem;
  /** log₁₀ elapsed years; negative within the first year. */
  logYears: number;
  w: number;
  omegaDE: number;
}
const CLOSED_EXTINCTION =
  'The CPL dark energy has become negligible, but this closed model must later recollapse, and on a contracting branch the CPL density, a function of a alone, grows back. The proper-time solver that integrates it supports only stable dark matter without custom events; no continuation is asserted.';
const MAX_TRIES = 40000,
  MIN_STEP = 1e-11,
  MAX_X = 60;
/**
 * Adaptive log-scale-factor integration of y = [τ, R, ln|ρde|, J] up to
 * ln a = 60 or the requested elapsed time, executing queued interventions at
 * accepted-step boundaries. The first stage of each step reuses the previous
 * step's last stage (FSAL) until an intervention changes the segment. A CPL
 * law is tested at every accepted state against its continuation theorems
 * (model/cpl.ts) unless a custom event changes w or the vacuum; the big-rip
 * proof also requires that no custom event remains.
 */
export function integrateExpansion(
  model: Model,
  queue: readonly PhysicsEvent[],
  effectiveEnd: number,
  counters?: SimulationCounters,
  budget?: WorkBudget,
  threshold = EXTINCTION,
): ExpansionOutcome {
  const { c, logH0 } = model;
  const cpl =
    initialSegment(c).deModel === 'cpl' && !queue.some(altersDarkEnergy);
  let continuation: Continuation | null = null;
  const deInitial = ln(Math.abs(c.omegaDE));
  let x = 0,
    y: readonly number[] = [
      0,
      c.omegaR,
      Number.isFinite(deInitial) ? deInitial : 0,
      0,
    ],
    segment = initialSegment(c),
    step = 0.02,
    k1: number[] | undefined,
    stop: Stop | null = null,
    eventIndex = 0,
    acceptedSteps = 0,
    rejectedSteps = 0,
    maxErrorNorm = 0;
  const rhs: Derivative = counted(
    (u, v) => derivative(u, v, segment, model),
    counters,
    'derivativeEvaluations',
    budget,
  );
  const nodes: Node[] = [],
    events: CosmicEvent[] = [];
  const snapshot = () => nodes.push({ x, y: [...y], segment });
  snapshot();
  let tries = 0;
  while (
    x < MAX_X &&
    Math.log10(Math.max(y[0], 1e-310)) - logH0 < effectiveEnd &&
    tries++ < MAX_TRIES
  ) {
    const prevY = y,
      prevX = x;
    let trial;
    try {
      trial = dopriStep(rhs, x, y, step, c.rtol, c.atol, k1);
    } catch (e) {
      rethrowBudget(e);
      rejectedSteps++;
      step *= 0.25;
      if (step < MIN_STEP) {
        stop = {
          status: 'limited',
          reason:
            (e as Error).message +
            ' Explicit solver reached minimum step; possible stiffness or a singular branch. No data invented beyond this point.',
        };
        break;
      }
      continue;
    }
    k1 = trial.k1;
    if (trial.error > 1) {
      rejectedSteps++;
      step *= trial.factor;
      if (step < MIN_STEP) {
        stop = {
          status: 'limited',
          reason: 'Error tolerance cannot be met at the minimum step.',
        };
        break;
      }
      continue;
    }
    let pending = queue[eventIndex];
    if (pending && pending.logTime + logH0 < 300) {
      const target = pow10(pending.logTime + logH0);
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
    k1 = trial.k7;
    acceptedSteps++;
    maxErrorNorm = Math.max(maxErrorNorm, trial.error);
    snapshot();
    while (pending && Math.log10(y[0]) - logH0 >= pending.logTime - 1e-8) {
      events.push({
        id: pending.id,
        title: `Custom event: ${pending.action}`,
        logYears: pending.logTime,
        detail: `User-selected value ${pending.value}. Discontinuous rule changes are external interventions; stress-energy matching is not established.`,
        reliability: 'Pure what-if',
        sources: [],
      });
      eventIndex++;
      k1 = undefined;
      const change = applyNumericalIntervention(segment, y, pending, c);
      if ('stop' in change) {
        stop = change.stop;
        break;
      }
      try {
        background(x, change.y, change.segment, model);
      } catch (e) {
        // The last node already holds the valid state, which is retained.
        stop = {
          status: 'terminated',
          reason: undefinedBranchReason((e as Error).message),
        };
        break;
      }
      segment = change.segment;
      y = change.y;
      snapshot();
      pending = queue[eventIndex];
    }
    if (stop) break;
    step = Math.min(0.1, step * trial.factor, MAX_X - x);
    if (x === prevX || y[0] < prevY[0]) {
      stop = { status: 'limited', reason: 'Time failed to advance.' };
      break;
    }
    if (!cpl || segment.signDE === 0) continue;
    const logYears = Math.log10(y[0]) - logH0;
    if (!(logYears < effectiveEnd)) continue;
    const b = background(x, y, segment, model),
      theorem = cplTheorem(b, segment, threshold);
    if (!theorem || (theorem === 'big-rip' && eventIndex < queue.length))
      continue;
    if (theorem === 'extinction' && model.signK < 0) {
      // A closed model must later recollapse, and its CPL density, a
      // function of a alone, grows back on the contracting branch.
      stop = { status: 'limited', reason: CLOSED_EXTINCTION };
      break;
    }
    continuation = {
      theorem,
      x,
      y,
      segment,
      logYears,
      w: b.w,
      omegaDE: b.fractions[3],
    };
    if (theorem === 'big-rip') break;
    events.push(extinctionEvent(logYears, Math.exp(x), b.w, b.fractions[3]));
    segment = { ...segment, signDE: 0 };
    k1 = undefined;
    snapshot();
  }
  if (tries >= MAX_TRIES)
    stop = {
      status: 'limited',
      reason:
        'Integration budget reached; possible stiffness. No continuation has been fabricated.',
    };
  return {
    nodes,
    stop,
    acceptedSteps,
    rejectedSteps,
    maxErrorNorm,
    eventIndex,
    events,
    continuation,
  };
}
