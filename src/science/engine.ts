import { blackHoleMassLimit, cosmicEvents } from './astrophysics';
import {
  BOUNDARY_CLASSIFICATION,
  INTERVENTION_BOUNDARY,
  INTERVENTION_NOTE,
  UNDETERMINED,
  classifyFinite,
  classifyTail,
  literalCpl,
  type Fate,
} from './classify';
import { LN10 } from './core/constants';
import { hashConfig } from './core/hash';
import { BudgetExceededError, type WorkBudget } from './core/limits';
import {
  contract,
  continueRip,
  present,
  setFate,
  setStop,
  type Run,
} from './continuation';
import { copyConfiguration } from './defaults';
import { DOMINANCE, asymptote, neverTurnsAround } from './model/asymptote';
import { EXTINCTION } from './model/cpl';
import { background, createModel, type Model } from './model/background';
import { darkEnergyLaw } from './model/segment';
import { validate } from './model/validate';
import type { SimulationCounters } from './solver/counters';
import { locateExpansion, noEvents } from './solver/crossings';
import { integrateExpansion } from './solver/expanding';
import { distinctTimes, sampleExpansion, toSample } from './solver/sampling';
import { extendTail } from './solver/tail';
import {
  DATASET_VERSION,
  EQUATIONS,
  VERSION,
  type Configuration,
  type CosmicEvent,
  type CplContinuation,
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
  /**
   * Threshold ε of the CPL extinction proof, |Ωde|(1 + 3w) < ε (default
   * 10⁻²⁰), for sensitivity checks; only numbers in (0, 10⁻¹²] are used.
   */
  extinctionThreshold?: number;
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
  const canonical = copyConfiguration(input);
  const c = canonical.config,
    { errors, warnings }: { errors: string[]; warnings: string[] } =
      canonical.problem
        ? { errors: [canonical.problem], warnings: [] }
        : validate(c);
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
  const special: CosmicEvent[] = [],
    located = noEvents(c);
  let executed = 0,
    cpl: CplContinuation | null = null;
  const vacuumLog = drawVacuumLog(c);
  try {
    const model = createModel(c);
    const effectiveEnd = Math.min(c.endLogYears, vacuumLog);
    const queue = c.events
      .filter((e) => e.logTime <= effectiveEnd)
      .sort((a, b) => a.logTime - b.logTime);
    // Only events that can run choose the solver. Closed models whose
    // expansion provably never halts stay on the expanding branch; a closed
    // CPL law with wₐ < 0 always recollapses (its dark energy dies out).
    const law = darkEnergyLaw(c);
    const canContract =
      c.dmModel === 'stable' &&
      queue.length === 0 &&
      (law === 'cpl'
        ? c.wa < 0 && c.omegaK < 0 && c.omegaDE !== 0
        : (c.omegaDE < 0 || c.omegaK < 0) &&
          ['lambda', 'constant'].includes(law) &&
          !provablyExpanding(model));
    const branch: Run = {
      result,
      model,
      effectiveEnd,
      special,
      located,
      counters: run.counters,
      budget: run.budget,
    };
    if (canContract) contract(branch);
    else ({ executed, cpl } = expand(branch, queue, run.extinctionThreshold));
  } catch (e) {
    if (e instanceof BudgetExceededError) throw e;
    const d = result.diagnostics;
    result.status = 'limited';
    d.reason = `${d.reason ? d.reason + ' ' : ''}Numerical failure: ${(e as Error).message} No data invented beyond the last reconstructed sample.`;
  }
  result.samples = distinctTimes(result.samples);
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
    ...cosmicEvents(c, result.samples, lastLog, located),
    ...special,
  ].sort((a, b) => a.logYears - b.logYears);
  if (
    result.status === 'terminated' &&
    result.classification.startsWith('Big Crunch approach')
  )
    result.events.push({
      id: 'crunch',
      title: 'Classical collapse boundary',
      logYears: lastLog,
      detail: result.diagnostics.reason,
      reliability: 'Model dependent',
      sources: ['friedmann1922'],
    });
  const bound = blackHoleMassLimit(c);
  result.derived = {
    nariaiMass: bound.nariai,
    blackHoleMassLimit: bound.limit,
    ...(darkEnergyLaw(c) === 'cpl' && { cplContinuation: cpl }),
  };
  return result;
}
function provablyExpanding(model: Model): boolean {
  const today = present(model);
  return neverTurnsAround(model, today.b, today.segment);
}
/**
 * Log-scale-factor integration, output sampling and the matched tail, or a
 * proven CPL continuation. Returns the number of custom events executed and
 * the CPL theorem applied.
 */
function expand(
  run: Run,
  queue: readonly PhysicsEvent[],
  threshold?: number,
): { executed: number; cpl: CplContinuation | null } {
  const { result, model, effectiveEnd, special, located, counters, budget } =
    run;
  const { c } = model,
    d = result.diagnostics,
    epsilon =
      threshold !== undefined && threshold > 0 && threshold <= 1e-12
        ? threshold
        : EXTINCTION;
  const expansion = integrateExpansion(
    model,
    queue,
    effectiveEnd,
    counters,
    budget,
    epsilon,
  );
  d.acceptedSteps = expansion.acceptedSteps;
  d.rejectedSteps = expansion.rejectedSteps;
  d.maxErrorNorm = expansion.maxErrorNorm;
  setStop(result, expansion.stop);
  special.push(...expansion.events);
  if (expansion.stop?.status === 'terminated')
    setFate(result, INTERVENTION_BOUNDARY);
  const law = expansion.continuation;
  const cpl: CplContinuation | null = law && {
    theorem: law.theorem,
    logYears: Math.max(0, law.logYears),
    logA: law.x / LN10,
    w: law.w,
    omegaDE: law.omegaDE,
    threshold: law.theorem === 'extinction' ? epsilon : DOMINANCE,
    ripLogYears: null,
  };
  const done = (executed: number) => ({ executed, cpl });
  // A fate proven through a CPL theorem is labelled a literal extrapolation.
  const fate = (f: Fate) =>
    setFate(result, law ? literalCpl(f, law.theorem) : f);
  const final = expansion.nodes[expansion.nodes.length - 1];
  const finalLog =
    final.y[0] > 0 ? Math.log10(final.y[0]) - model.logH0 : -Infinity;
  d.numericalUntilLogYears = Math.max(0, finalLog);
  const b = background(final.x, final.y, final.segment, model);
  // A phantom asymptote packs most of ln a into the last log-time interval;
  // extra samples even in ln a resolve the approach to the Big Rip.
  const limit = asymptote(model, b, final.segment);
  const phantom = 'n' in limit && limit.n < 0;
  const crossings = locateExpansion(model, expansion.nodes, counters, budget);
  Object.assign(located, crossings.events);
  if (crossings.unresolved)
    result.warnings.push(
      `Event location skipped ${crossings.unresolved} accepted step(s) whose interior could not be evaluated; an equality or temperature crossing inside them is not reported.`,
    );
  const sampling = sampleExpansion(
    model,
    expansion.nodes,
    Math.min(effectiveEnd, finalLog),
    phantom ? Math.ceil(c.samples / 4) : 0,
    counters,
    budget,
    // A dropped dark energy keeps a sample of the state that proved it.
    law?.theorem === 'extinction'
      ? [...crossings.points, law]
      : crossings.points,
  );
  result.samples = sampling.samples;
  if (sampling.failure) {
    setStop(result, {
      status: 'limited',
      reason: `Output sample reconstruction failed: ${sampling.failure} Samples end at the last reconstructed time.`,
    });
    return done(expansion.eventIndex);
  }
  if (!(finalLog >= 0) && result.status !== 'complete')
    d.reason += LESS_THAN_A_YEAR;
  if (result.status !== 'complete') return done(expansion.eventIndex);
  if (cpl?.theorem === 'big-rip') {
    continueRip(run, final, finalLog, crossings.pending, cpl);
    return done(expansion.eventIndex);
  }
  if (!(effectiveEnd > finalLog + 1e-8)) {
    fate(classifyFinite(model, b, final.segment));
    return done(expansion.eventIndex);
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
    pending: crossings.pending,
  });
  if (!tail.proven) {
    setStop(result, { status: 'limited', reason: tail.reason });
    return done(expansion.eventIndex);
  }
  d.tail = tail.tail;
  fate(
    classifyTail(tail.exponent, tail.nonstandard, tail.rip, tail.finalExponent),
  );
  result.samples.push(...tail.samples);
  special.push(...tail.events);
  tail.crossings.cool.forEach((t, i) => {
    if (t !== null) located.cool[i].push(t);
  });
  located.horizon ??= tail.crossings.horizon;
  setStop(result, tail.stop);
  if (tail.stop?.status === 'terminated' && !tail.rip)
    setFate(result, INTERVENTION_BOUNDARY);
  result.warnings.push(...tail.warnings);
  return done(tail.eventIndex);
}
