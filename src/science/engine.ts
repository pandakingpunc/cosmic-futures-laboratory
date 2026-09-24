import { cosmicEvents } from './astrophysics';
import {
  BOUNDARY_CLASSIFICATION,
  INTERVENTION_NOTE,
  UNDETERMINED,
  classifyFinite,
  classifyRecollapse,
  classifyTail,
  type Fate,
} from './classify';
import { hashConfig } from './core/hash';
import { createModel, type Model } from './model/background';
import { initialSegment, type Stop } from './model/segment';
import { validate } from './model/validate';
import { integrateContraction } from './solver/contraction';
import type { SimulationCounters } from './solver/counters';
import { integrateExpansion } from './solver/expanding';
import { sampleExpansion } from './solver/sampling';
import { extendTail } from './solver/tail';
import {
  DATASET_VERSION,
  EQUATIONS,
  VERSION,
  type Configuration,
  type CosmicEvent,
  type PhysicsEvent,
  type Result,
} from './types';
import { drawVacuumLog, vacuumTermination } from './vacuum';
export { H0_YEAR } from './core/constants';
export { hashConfig } from './core/hash';
export { seededRandom } from './core/random';
export {
  validate,
  type Validation,
  type ValidationField,
} from './model/validate';
export type { SimulationCounters } from './solver/counters';
export interface SimulateOptions {
  /** Replaces the wall-clock metadata.timestamp, for reproducible files. */
  timestamp?: string;
  /** Incremented in place; counting never changes the arithmetic. */
  counters?: SimulationCounters;
}
/**
 * Integrates one configured universe: the numerical background, its output
 * samples and, where proven, a matched asymptotic tail; then classifies the
 * outcome. Solvers return outcomes, which are merged here in a fixed order.
 */
export function simulate(
  input: Configuration,
  options: SimulateOptions = {},
): Result {
  const c = structuredClone(input),
    { errors, warnings } = validate(c),
    { counters } = options;
  const result: Result = {
    config: structuredClone(c),
    samples: [],
    events: [],
    ...UNDETERMINED,
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
      timestamp: options.timestamp ?? new Date().toISOString(),
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
  const model = createModel(c);
  const vacuumLog = drawVacuumLog(c);
  const effectiveEnd = Math.min(c.endLogYears, vacuumLog);
  const queue = c.events
    .filter((e) => e.logTime <= effectiveEnd)
    .sort((a, b) => a.logTime - b.logTime);
  const special: CosmicEvent[] = [];
  const canContract =
    (c.omegaDE < 0 || c.omegaK < 0) &&
    ['lambda', 'constant'].includes(c.deModel) &&
    c.dmModel === 'stable' &&
    c.events.length === 0;
  if (canContract) contract(result, model, effectiveEnd, special, counters);
  else expand(result, model, effectiveEnd, queue, special, counters);
  const lastLog = result.samples.at(-1)?.logYears ?? 0;
  const vacuum =
    result.status === 'complete'
      ? vacuumTermination(c, vacuumLog, result.samples, lastLog)
      : null;
  if (vacuum) {
    result.samples = vacuum.samples;
    setFate(result, vacuum.fate);
    result.status = 'terminated';
    special.push(vacuum.event);
  }
  if (result.status === 'limited')
    result.classification = BOUNDARY_CLASSIFICATION;
  if (c.sandbox && c.events.length) result.explanation += INTERVENTION_NOTE;
  result.events = [
    ...cosmicEvents(c, result.samples, lastLog),
    ...special,
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
function setFate(result: Result, fate: Fate) {
  result.classification = fate.classification;
  result.explanation = fate.explanation;
}
function setStop(result: Result, stop: Stop | null) {
  if (!stop) return;
  result.status = stop.status;
  result.diagnostics.reason = stop.reason;
}
/** Log-scale-factor integration, output sampling and the matched tail. */
function expand(
  result: Result,
  model: Model,
  effectiveEnd: number,
  queue: readonly PhysicsEvent[],
  special: CosmicEvent[],
  counters?: SimulationCounters,
) {
  const { c } = model,
    d = result.diagnostics;
  const expansion = integrateExpansion(model, queue, effectiveEnd, counters);
  d.acceptedSteps = expansion.acceptedSteps;
  d.rejectedSteps = expansion.rejectedSteps;
  d.maxErrorNorm = expansion.maxErrorNorm;
  setStop(result, expansion.stop);
  special.push(...expansion.events);
  const final = expansion.nodes[expansion.nodes.length - 1];
  const finalLog = Math.log10(Math.max(final.y[0], 1e-300)) - model.logH0;
  d.numericalUntilLogYears = finalLog;
  result.samples = sampleExpansion(
    model,
    expansion.nodes,
    Math.min(effectiveEnd, finalLog),
    counters,
  );
  if (result.status !== 'complete') return;
  if (!(effectiveEnd > finalLog + 1e-8)) {
    setFate(result, classifyFinite(c, final.segment));
    return;
  }
  const tail = extendTail({
    model,
    final,
    last: result.samples[result.samples.length - 1],
    startLog: finalLog,
    endLog: effectiveEnd,
    queue,
    eventIndex: expansion.eventIndex,
  });
  if (!tail.proven) {
    setStop(result, { status: 'limited', reason: tail.reason });
    return;
  }
  d.tail = tail.tail;
  setFate(result, classifyTail(tail.exponent, tail.nonstandard, tail.rip));
  result.samples.push(...tail.samples);
  special.push(...tail.events);
  setStop(result, tail.stop);
  result.warnings.push(...tail.warnings);
}
/** Proper-time integration of recollapsing constant-fluid models. */
function contract(
  result: Result,
  model: Model,
  effectiveEnd: number,
  special: CosmicEvent[],
  counters?: SimulationCounters,
) {
  const d = result.diagnostics;
  const contraction = integrateContraction(model, effectiveEnd, counters);
  d.acceptedSteps = contraction.acceptedSteps;
  d.rejectedSteps = contraction.rejectedSteps;
  d.maxConstraintResidual = contraction.maxConstraintResidual;
  d.numericalUntilLogYears = contraction.numericalUntilLogYears;
  result.samples = contraction.samples;
  special.push(...contraction.events);
  setStop(result, contraction.stop);
  setFate(
    result,
    contraction.turned
      ? classifyRecollapse(contraction.crunch)
      : classifyFinite(model.c, initialSegment(model.c)),
  );
}
