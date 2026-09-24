import {
  horizonGap,
  logHawkingTemperature,
  type LocatedEvents,
} from '../astrophysics';
import { H0_YEAR, LN10, logHorizonTemperature } from '../core/constants';
import type { WorkBudget } from '../core/limits';
import {
  background,
  derivative,
  type Background,
  type Model,
} from '../model/background';
import type { Segment } from '../model/segment';
import type { Configuration } from '../types';
import { counted, rethrowBudget, type SimulationCounters } from './counters';
import { dopriStep, type Derivative } from './dopri5';
import type { Node } from './expanding';
import { illinois, logSum, tailLogElapsed } from './locate';
import { isDeSitter, type EventPoint } from './sampling';
/** Crossings still to be located in a matched tail. */
export interface Pending {
  /** ln a of each mass's CMB/Hawking crossing beyond the numerical branch, else NaN. */
  targets: number[];
  /** No horizon crossing yet, and the CMB is not colder than ħH/(2πk_B). */
  horizonArmed: boolean;
}
export const noEvents = (c: Configuration): LocatedEvents => ({
  equality: [],
  cool: c.blackHoleMasses.map(() => []),
  warm: c.blackHoleMasses.map(() => []),
  horizon: null,
});
/** ln a at which Tγ,0/a equals the Hawking temperature of each selected mass. */
export const hawkingTargets = (c: Configuration) =>
  c.blackHoleMasses.map(
    (m) => (Math.log10(c.Tcmb) - logHawkingTemperature(m)) * LN10,
  );
/**
 * ln(ρm/ρde) for positive dark energy: its sign is that of Ωm − Ωde.
 * Otherwise matter cannot be below the dark energy (+∞), or with neither
 * present there is no side (NaN).
 */
function equalityGap(b: Background, s: Segment): number {
  const top = Math.max(b.logs[0], b.logs[1]);
  const matter =
    top === -Infinity
      ? top
      : top + Math.log(Math.exp(b.logs[0] - top) + Math.exp(b.logs[1] - top));
  if (s.signDE > 0) return matter - b.logs[3];
  return matter === -Infinity ? NaN : Infinity;
}
/** f(u) and f(v) lie on different sides of zero; NaN has no side. */
const crosses = (u: number, v: number) =>
  !Number.isNaN(u) && !Number.isNaN(v) && u < 0 !== v < 0;
/**
 * Locates the event crossings of the expanding branch between its accepted
 * nodes: matter–dark-energy equality, the CMB/Hawking crossings at their
 * exact ln a, and the first fall of the CMB below the de Sitter horizon
 * temperature where the de Sitter criterion holds. A root inside a step is
 * refined on partial Dormand–Prince steps from the step's first node, as the
 * output samples are, so it does not depend on `samples` or the endpoint.
 * Sign changes across an intervention are placed at its time. Crossings are
 * resolved at accepted-step resolution: two within one step cancel. Where a
 * partial step fails inside an accepted step, that step's crossings are not
 * located and are counted in `unresolved`; the search continues after it.
 */
export function locateExpansion(
  model: Model,
  nodes: readonly Node[],
  counters?: SimulationCounters,
  budget?: WorkBudget,
): {
  events: LocatedEvents;
  points: EventPoint[];
  pending: Pending;
  unresolved: number;
} {
  const { c, logH0 } = model;
  const events = noEvents(c),
    points: EventPoint[] = [],
    targets = hawkingTargets(c);
  let segment = nodes[0].segment,
    cached = -1,
    k1: number[] | undefined;
  const rhs: Derivative = counted(
    (u, v) => derivative(u, v, segment, model),
    counters,
    'samplingEvaluations',
    budget,
  );
  const stateAt = (j: number, x: number): readonly number[] => {
    const n = nodes[j];
    segment = n.segment;
    if (x === n.x) return n.y;
    const t = dopriStep(
      rhs,
      n.x,
      n.y,
      x - n.x,
      c.rtol,
      c.atol,
      cached === j ? k1 : undefined,
    );
    cached = j;
    k1 = t.k1;
    return t.y;
  };
  const measure = (x: number, y: readonly number[], s: Segment) => {
    const b = background(x, y, s, model);
    return {
      equality: equalityGap(b, s),
      horizon: horizonGap(c, x / LN10, Math.log10(c.H0) + b.logE / LN10),
      deSitter: isDeSitter(b, s),
    };
  };
  /** Adds the output point of a crossing and returns its raw log time. */
  const record = (x: number, y: readonly number[], s: Segment) => {
    const logYears = Math.log10(y[0]) - logH0;
    points.push({ x, y, segment: s, logYears });
    return logYears;
  };
  type Measures = ReturnType<typeof measure>;
  /** Crossings between nodes j and j + 1, with the measures at both. */
  const scanStep = (j: number, previous: Measures, next: Measures) => {
    const from = nodes[j],
      to = nodes[j + 1],
      s = from.segment;
    if (to.x > from.x) {
      const at = (x: number) => stateAt(j, x);
      const root = (key: 'equality' | 'horizon') =>
        illinois(
          (x) => measure(x, at(x), s)[key],
          from.x,
          previous[key],
          to.x,
          next[key],
          counters,
        );
      if (
        crosses(previous.equality, next.equality) &&
        Number.isFinite(previous.equality + next.equality)
      ) {
        const x = root('equality');
        events.equality.push(record(x, at(x), s));
      }
      targets.forEach((t, i) => {
        if (t > from.x && t <= to.x) events.cool[i].push(record(t, at(t), s));
      });
      if (
        events.horizon === null &&
        previous.horizon >= 0 &&
        next.horizon < 0
      ) {
        const x = root('horizon'),
          y = at(x);
        if (measure(x, y, s).deSitter) events.horizon = record(x, y, s);
      }
    } else if (from.y[0] > 0) {
      if (crosses(previous.equality, next.equality))
        events.equality.push(record(from.x, from.y, s));
      if (
        events.horizon === null &&
        previous.horizon >= 0 &&
        next.horizon < 0 &&
        next.deSitter
      )
        events.horizon = record(from.x, from.y, s);
    }
  };
  // Accepted nodes are states the integrator has already evaluated.
  let previous = measure(nodes[0].x, nodes[0].y, nodes[0].segment),
    unresolved = 0;
  for (let j = 0; j + 1 < nodes.length; j++) {
    const to = nodes[j + 1],
      next = measure(to.x, to.y, to.segment);
    try {
      scanStep(j, previous, next);
    } catch (e) {
      rethrowBudget(e);
      unresolved++;
    }
    previous = next;
  }
  const end = nodes[nodes.length - 1].x;
  return {
    events,
    points,
    pending: {
      targets: targets.map((t) => (t > end ? t : NaN)),
      horizonArmed: events.horizon === null && previous.horizon >= 0,
    },
    unresolved,
  };
}
/** An accepted or located state of the time-domain branch, z = [a, da/dτ]. */
export interface TimePoint {
  u: number;
  z: number[];
}
/**
 * Every passage of a through `target` between accepted points, refined on
 * partial steps from the earlier point; `rising` marks an expanding passage.
 */
export function passages(
  pts: readonly TimePoint[],
  stateAt: (i: number, u: number) => number[],
  target: number,
  counters?: SimulationCounters,
): (TimePoint & { rising: boolean })[] {
  const found: (TimePoint & { rising: boolean })[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const before = pts[i].z[0] - target,
      after = pts[i + 1].z[0] - target;
    if (!crosses(before, after)) continue;
    try {
      const u = illinois(
        (v) => stateAt(i, v)[0] - target,
        pts[i].u,
        before,
        pts[i + 1].u,
        after,
        counters,
      );
      found.push({ u, z: stateAt(i, u), rising: after >= 0 });
    } catch (e) {
      rethrowBudget(e);
      break;
    }
  }
  return found;
}
/** Crossings located in a matched tail, as raw log₁₀ elapsed years. */
export interface TailCrossings {
  /** Per selected mass, the CMB/Hawking crossing, or null. */
  cool: (number | null)[];
  horizon: number | null;
}
/** One constant law of a matched tail, anchored at ln a = x. */
export interface TailPiece {
  x: number;
  logYears: number;
  /** log₁₀ H in km s⁻¹ Mpc⁻¹ at the anchor. */
  logH: number;
  /** Density exponent of the dominant fluid, ρ ∝ a⁻ⁿ. */
  n: number;
}
/**
 * Records in `found` the pending crossings that occur under one tail law
 * before `until`, by exact inversion of the law, and returns their times.
 * A de Sitter law (n = 0) has a constant horizon temperature, so an armed
 * horizon crossing lies at ln a = ln(Tγ,0/T_GH).
 */
export function pieceCrossings(
  c: Configuration,
  piece: TailPiece,
  until: number,
  pending: Pending | undefined,
  found: TailCrossings,
  armed: boolean,
): number[] {
  const rate = piece.logH + Math.log10(H0_YEAR),
    times: number[] = [];
  const at = (x: number) => {
    const lt = logSum(
      piece.logYears,
      tailLogElapsed(x - piece.x, piece.n / 2, rate),
    );
    if (lt > until) return null;
    times.push(lt);
    return lt;
  };
  pending?.targets.forEach((t, i) => {
    if (found.cool[i] === null && t > piece.x) found.cool[i] = at(t);
  });
  if (armed && found.horizon === null && piece.n === 0)
    found.horizon = at(
      Math.max(
        piece.x,
        (Math.log10(c.Tcmb) - logHorizonTemperature(piece.logH)) * LN10,
      ),
    );
  return times;
}
