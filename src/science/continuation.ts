import type { LocatedEvents } from './astrophysics';
import {
  OSCILLATING,
  classifyFinite,
  classifyRecollapse,
  cplRip,
  literalCpl,
  type Fate,
} from './classify';
import type { WorkBudget } from './core/limits';
import { background, type Model } from './model/background';
import { darkEnergyLaw, initialSegment, type Stop } from './model/segment';
import { integrateContraction } from './solver/contraction';
import type { SimulationCounters } from './solver/counters';
import { ripContinuation } from './solver/cpl-rip';
import type { Pending } from './solver/crossings';
import type { Node } from './solver/expanding';
import type {
  Configuration,
  CosmicEvent,
  CplContinuation,
  Result,
} from './types';
/** The parts of a run that the branch continuations extend in place. */
export interface Run {
  result: Result;
  model: Model;
  effectiveEnd: number;
  special: CosmicEvent[];
  located: LocatedEvents;
  counters?: SimulationCounters;
  budget?: WorkBudget;
}
export const RIP_REASON =
  'Finite future-time integral; singularity boundary reached.';
export function setFate(result: Result, fate: Fate) {
  result.classification = fate.classification;
  result.explanation = fate.explanation;
}
export function setStop(result: Result, stop: Stop | null) {
  if (!stop) return;
  result.status = stop.status;
  result.diagnostics.reason = stop.reason;
}
/** The expanding-branch state y = [τ, R, ln|ρde|, J] today. */
export function initialState(c: Configuration): number[] {
  const de = Math.log(Math.abs(c.omegaDE));
  return [0, c.omegaR, Number.isFinite(de) ? de : 0, 0];
}
/** The initial segment and today's background. */
export function present(model: Model) {
  const segment = initialSegment(model.c);
  return { segment, b: background(0, initialState(model.c), segment, model) };
}
/**
 * Proper-time integration of recollapsing models whose fluids depend on a
 * alone: constant-w fluids, or a closed model with a CPL law of wₐ < 0,
 * whose dark energy dies out as a grows so that curvature must halt the
 * expansion; its density returns on the contracting branch.
 */
export function contract(run: Run) {
  const { result, model } = run,
    d = result.diagnostics;
  const contraction = integrateContraction(
    model,
    run.effectiveEnd,
    run.counters,
    run.budget,
  );
  d.acceptedSteps = contraction.acceptedSteps;
  d.rejectedSteps = contraction.rejectedSteps;
  d.maxConstraintResidual = contraction.maxConstraintResidual;
  d.numericalUntilLogYears = contraction.numericalUntilLogYears;
  result.samples = contraction.samples;
  run.special.push(...contraction.events);
  Object.assign(run.located, contraction.located);
  setStop(result, contraction.stop);
  const today = present(model);
  const fate = contraction.bounced
    ? OSCILLATING
    : contraction.turned
      ? classifyRecollapse(contraction.crunch)
      : null;
  setFate(
    result,
    fate === null
      ? classifyFinite(model, today.b, today.segment)
      : darkEnergyLaw(model.c) === 'cpl'
        ? literalCpl(fate, 'recollapse')
        : fate,
  );
}
/**
 * Continues a CPL phantom branch from `final` to its finite-time
 * singularity and records the rip time in `cpl`.
 */
export function continueRip(
  run: Run,
  final: Node,
  startLog: number,
  pending: Pending | undefined,
  cpl: CplContinuation,
) {
  const { result, located } = run;
  const rip = ripContinuation({
    model: run.model,
    final,
    startLog,
    endLog: run.effectiveEnd,
    pending,
    counters: run.counters,
    budget: run.budget,
  });
  if (!rip.proven)
    return setStop(result, { status: 'limited', reason: rip.reason });
  cpl.ripLogYears = rip.ripLog;
  result.diagnostics.tail = rip.tail;
  result.samples.push(...rip.samples);
  run.special.push(...rip.events);
  rip.cool.forEach((t, i) => {
    if (t !== null) located.cool[i].push(t);
  });
  result.warnings.push(...rip.warnings);
  if (rip.reached)
    setStop(result, { status: 'terminated', reason: RIP_REASON });
  setFate(result, literalCpl(cplRip(rip.ripLog, rip.reached), 'big-rip'));
}
