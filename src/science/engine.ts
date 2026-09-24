import { cosmicEvents } from './astrophysics';
import {
  BOUNDARY_CLASSIFICATION,
  INTERVENTION_BOUNDARY,
  INTERVENTION_NOTE,
  OSCILLATING,
  UNDETERMINED,
  classifyFinite,
  classifyRecollapse,
  classifyTail,
  type Fate,
} from './classify';
import { hashConfig } from './core/hash';
import { BudgetExceededError, type WorkBudget } from './core/limits';
import { canonicalConfig } from './defaults';
import { asymptote, neverTurnsAround } from './model/asymptote';
import { background, createModel, type Model } from './model/background';
import { initialSegment, type Stop } from './model/segment';
import { validate } from './model/validate';
import { integrateContraction } from './solver/contraction';
import type { SimulationCounters } from './solver/counters';
import { integrateExpansion } from './solver/expanding';
import { sampleExpansion, toSample } from './solver/sampling';
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
  /**
   * Right-hand-side evaluations this run may use, shared in place with other
   * runs; exhaustion throws BudgetExceededError. Unbudgeted runs are
   * unchanged bit for bit.
   */
  budget?: WorkBudget;
}
const LESS_THAN_A_YEAR =
  ' Less than one elapsed year was resolved; only the present state is reported.';
/**
 * Integrates one configured universe: the numerical background, its output
 * samples and, where proven, a matched asymptotic tail; then classifies the
 * outcome. Solvers return outcomes, which are merged here in a fixed order.
 * Apart from an exhausted work budget, failures become explicit statuses.
 */
export function simulate(
  input: Configuration,
  options?: SimulateOptions | null,
): Result {
  const run = options ?? {};
  const canonical = canonicalConfig(input);
  const c = structuredClone(canonical.config),
    { errors, warnings } = validate(c);
  if (canonical.unknown.length)
    warnings.push(
      `Ignored unknown configuration keys: ${canonical.unknown
        .slice(0, 8)
        .map((k) => JSON.stringify(k.slice(0, 40)))
        .join(', ')}${canonical.unknown.length > 8 ? ', …' : ''}.`,
    );
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
      timestamp: run.timestamp ?? new Date().toISOString(),
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
  const special: CosmicEvent[] = [];
  let executed = 0;
  const vacuumLog = drawVacuumLog(c);
  try {
    const model = createModel(c);
    const effectiveEnd = Math.min(c.endLogYears, vacuumLog);
    const queue = c.events
      .filter((e) => e.logTime <= effectiveEnd)
      .sort((a, b) => a.logTime - b.logTime);
    // Only events that can run choose the solver. Closed models whose
    // expansion provably never halts stay on the expanding branch.
    const canContract =
      (c.omegaDE < 0 || c.omegaK < 0) &&
      ['lambda', 'constant'].includes(c.deModel) &&
      c.dmModel === 'stable' &&
      queue.length === 0 &&
      !provablyExpanding(model);
    if (canContract) contract(result, model, effectiveEnd, special, run);
    else executed = expand(result, model, effectiveEnd, queue, special, run);
  } catch (e) {
    if (e instanceof BudgetExceededError) throw e;
    const d = result.diagnostics;
    result.status = 'limited';
    d.reason = `${d.reason ? d.reason + ' ' : ''}Numerical failure: ${(e as Error).message} No data invented beyond the last reconstructed sample.`;
  }
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
  if (c.sandbox && executed) result.explanation += INTERVENTION_NOTE;
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
/** The expanding-branch state y = [τ, R, ln|ρde|, J] today. */
function initialState(c: Configuration): number[] {
  const de = Math.log(Math.abs(c.omegaDE));
  return [0, c.omegaR, Number.isFinite(de) ? de : 0, 0];
}
/** The initial segment and today's background. */
function present(model: Model) {
  const segment = initialSegment(model.c);
  return { segment, b: background(0, initialState(model.c), segment, model) };
}
function provablyExpanding(model: Model): boolean {
  const today = present(model);
  return neverTurnsAround(model, today.b, today.segment);
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
/**
 * Log-scale-factor integration, output sampling and the matched tail.
 * Returns the number of custom events executed.
 */
function expand(
  result: Result,
  model: Model,
  effectiveEnd: number,
  queue: readonly PhysicsEvent[],
  special: CosmicEvent[],
  { counters, budget }: SimulateOptions = {},
): number {
  const { c } = model,
    d = result.diagnostics;
  const expansion = integrateExpansion(
    model,
    queue,
    effectiveEnd,
    counters,
    budget,
  );
  d.acceptedSteps = expansion.acceptedSteps;
  d.rejectedSteps = expansion.rejectedSteps;
  d.maxErrorNorm = expansion.maxErrorNorm;
  setStop(result, expansion.stop);
  special.push(...expansion.events);
  if (expansion.stop?.status === 'terminated')
    setFate(result, INTERVENTION_BOUNDARY);
  const final = expansion.nodes[expansion.nodes.length - 1];
  const finalLog =
    final.y[0] > 0 ? Math.log10(final.y[0]) - model.logH0 : -Infinity;
  d.numericalUntilLogYears = Math.max(0, finalLog);
  const b = background(final.x, final.y, final.segment, model);
  // A phantom asymptote packs most of ln a into the last log-time interval;
  // extra samples even in ln a resolve the approach to the Big Rip.
  const fate = asymptote(model, b, final.segment);
  const phantom = 'n' in fate && fate.n < 0;
  const sampling = sampleExpansion(
    model,
    expansion.nodes,
    Math.min(effectiveEnd, finalLog),
    phantom ? Math.ceil(c.samples / 4) : 0,
    counters,
    budget,
  );
  result.samples = sampling.samples;
  if (sampling.failure) {
    setStop(result, {
      status: 'limited',
      reason: `Output sample reconstruction failed: ${sampling.failure} Samples end at the last reconstructed time.`,
    });
    return expansion.eventIndex;
  }
  if (!(finalLog >= 0) && result.status !== 'complete')
    d.reason += LESS_THAN_A_YEAR;
  if (result.status !== 'complete') return expansion.eventIndex;
  if (!(effectiveEnd > finalLog + 1e-8)) {
    setFate(result, classifyFinite(model, b, final.segment));
    return expansion.eventIndex;
  }
  const tail = extendTail({
    model,
    final,
    // Below one year the grid holds only the present; anchor at the node.
    last:
      finalLog >= 0
        ? result.samples[result.samples.length - 1]
        : toSample(final.x, final.y, final.segment, 0, model),
    startLog: finalLog,
    endLog: effectiveEnd,
    queue,
    eventIndex: expansion.eventIndex,
  });
  if (!tail.proven) {
    setStop(result, { status: 'limited', reason: tail.reason });
    return expansion.eventIndex;
  }
  d.tail = tail.tail;
  setFate(
    result,
    classifyTail(tail.exponent, tail.nonstandard, tail.rip, tail.finalExponent),
  );
  result.samples.push(...tail.samples);
  special.push(...tail.events);
  setStop(result, tail.stop);
  if (tail.stop?.status === 'terminated' && !tail.rip)
    setFate(result, INTERVENTION_BOUNDARY);
  result.warnings.push(...tail.warnings);
  return tail.eventIndex;
}
/** Proper-time integration of recollapsing constant-fluid models. */
function contract(
  result: Result,
  model: Model,
  effectiveEnd: number,
  special: CosmicEvent[],
  { counters, budget }: SimulateOptions = {},
) {
  const d = result.diagnostics;
  const contraction = integrateContraction(
    model,
    effectiveEnd,
    counters,
    budget,
  );
  d.acceptedSteps = contraction.acceptedSteps;
  d.rejectedSteps = contraction.rejectedSteps;
  d.maxConstraintResidual = contraction.maxConstraintResidual;
  d.numericalUntilLogYears = contraction.numericalUntilLogYears;
  result.samples = contraction.samples;
  special.push(...contraction.events);
  setStop(result, contraction.stop);
  const today = present(model);
  setFate(
    result,
    contraction.bounced
      ? OSCILLATING
      : contraction.turned
        ? classifyRecollapse(contraction.crunch)
        : classifyFinite(model, today.b, today.segment),
  );
}
