import { seededRandom } from '../../src/science/core/random';
import { defaultConfig } from '../../src/science/defaults';
import type {
  Configuration,
  DarkEnergy,
  DarkMatter,
  PhysicsEvent,
} from '../../src/science/types';
/** A seeded source of random choices for property tests. */
export function chooser(seed: number) {
  const random = seededRandom(seed);
  const pick = <T>(values: readonly T[]): T =>
    values[Math.floor(random() * values.length)];
  const uniform = (lo: number, hi: number) => lo + (hi - lo) * random();
  const logUniform = (lo: number, hi: number) =>
    10 ** uniform(Math.log10(lo), Math.log10(hi));
  const chance = (p: number) => random() < p;
  const integer = (lo: number, hi: number) =>
    lo + Math.floor(random() * (hi - lo + 1));
  return { random, pick, uniform, logUniform, chance, integer };
}
export type Chooser = ReturnType<typeof chooser>;
const DARK_ENERGY: DarkEnergy[] = [
  'lambda',
  'constant',
  'cpl',
  'bounded',
  'custom',
];
const DARK_MATTER: DarkMatter[] = [
  'stable',
  'decay',
  'annihilation',
  'warm',
  'interacting',
];
const EXPRESSIONS = [
  '-1 + 0.1 * sin(log(a))',
  '-1 + 0.05 * tanh(log(a))',
  '-0.9',
  '-1.1 + 0.1 / a',
  '-1 + 0.2 * z / (1 + z)',
  '-1 + 0.01 * a',
  '-1 + sqrt((a - 1.1) * (a - 1.9))',
  '-1 + 0.3 * cos(3 * log(a))',
  '-1 - 0.05 * exp(-a)',
];
const W_PAIRS = [
  [-1, 0],
  [-2.2, 1.2],
  [-1.4, 0.4],
  [-1.13, 0.13],
  [-0.9, -0.1],
  [-1 / 3, 0],
  [-1.05, 0],
  [-1.5, 0],
  [0, 0],
  [0.5, 0],
  [1, 0],
] as const;
/** Densities, closed through Ωde or Ωk; some are extreme or degenerate. */
function densities(ch: Chooser): Partial<Configuration> {
  const { pick, uniform, chance } = ch;
  const mode = pick([
    'flat',
    'flat',
    'open',
    'closed',
    'negative-vacuum',
    'single',
    'heavy',
  ] as const);
  if (mode === 'single') {
    const key = pick(['omegaB', 'omegaDM', 'omegaR', 'omegaDE', 'omegaK']);
    return {
      omegaB: 0,
      omegaDM: 0,
      omegaNu: 0,
      omegaR: 0,
      omegaDE: 0,
      omegaK: 0,
      [key]: 1,
    };
  }
  const omegaB = mode === 'heavy' ? uniform(0, 3) : uniform(0, 0.1),
    omegaDM = uniform(0, mode === 'heavy' ? 2 : 0.5),
    omegaNu = chance(0.5) ? uniform(0, 0.005) : 0,
    omegaR = pick([0, 9.1e-5, uniform(0, 0.01)]);
  const matter = omegaB + omegaDM + omegaNu + omegaR;
  if (mode === 'flat' || mode === 'heavy')
    return { omegaB, omegaDM, omegaNu, omegaR, omegaK: 0, omegaDE: 1 - matter };
  if (mode === 'negative-vacuum') {
    const omegaDE = -uniform(0, 0.5);
    return {
      omegaB,
      omegaDM,
      omegaNu,
      omegaR,
      omegaDE,
      omegaK: 1 - matter - omegaDE,
    };
  }
  const omegaK = mode === 'open' ? uniform(0, 1) : -uniform(0, 1);
  const closeWithK = chance(0.3);
  const omegaDE = closeWithK ? pick([0, uniform(0, 1)]) : 1 - matter - omegaK;
  return {
    omegaB,
    omegaDM,
    omegaNu,
    omegaR,
    omegaDE,
    omegaK: closeWithK ? 1 - matter - omegaDE : omegaK,
  };
}
function events(ch: Chooser, end: number): PhysicsEvent[] {
  const { pick, uniform, chance, integer } = ch;
  const list: PhysicsEvent[] = [];
  const count = integer(0, 4);
  for (let i = 0; i < count; i++) {
    const action = pick([
      'change-w',
      'vacuum-scale',
      'change-G',
      'halt',
      'reverse',
      'dm-lifetime',
    ] as const);
    // Simultaneous events share one time boundary.
    const logTime =
      list.length && chance(0.3)
        ? list[list.length - 1].logTime
        : chance(0.2)
          ? uniform(0, 1000)
          : uniform(0, Math.max(end, 1));
    const value =
      action === 'change-w'
        ? pick([-1, -1.5, -0.8, 0, 1, uniform(-2, 1)])
        : action === 'vacuum-scale'
          ? pick([0, -1, 0.25, 4, 1e-200])
          : action === 'change-G'
            ? pick([0, -1, 0.5, 4])
            : action === 'dm-lifetime'
              ? uniform(0, 30)
              : 0;
    list.push({ id: `e${i}`, logTime, action, value });
  }
  return list;
}
/** Breaks one field so that validation must report it. */
function corrupt(ch: Chooser, c: Configuration): Configuration {
  const broken = { ...c } as Record<string, unknown>;
  const which = ch.integer(0, 11);
  if (which === 0) broken.omegaB = -0.1;
  else if (which === 1) broken.omegaDE = c.omegaDE + 0.5;
  else if (which === 2) broken.H0 = 0;
  else if (which === 3) broken.samples = 39;
  else if (which === 4) broken.seed = 1.5;
  else if (which === 5) {
    broken.sandbox = false;
    broken.events = [{ id: 'x', logTime: 5, action: 'halt', value: 0 }];
  } else if (which === 6) {
    broken.deModel = 'constant';
    broken.w0 = 1e6;
  } else if (which === 7) broken.name = 'a\nb';
  else if (which === 8) broken.endLogYears = '12';
  else if (which === 9) broken.events = [null];
  else if (which === 10) broken.blackHoleMasses = [];
  else broken.omegaB = 1e13;
  return broken as unknown as Configuration;
}
/** A random configuration covering every model family; some are invalid. */
export function generateConfig(ch: Chooser): Configuration {
  const { pick, uniform, logUniform, chance, integer } = ch;
  const [w0, wa] = chance(0.6)
    ? pick(W_PAIRS)
    : [uniform(-3, 1), chance(0.5) ? 0 : uniform(-1, 1)];
  const endLogYears = pick([
    uniform(0, 15),
    uniform(10, 100),
    uniform(100, 1000),
    1000,
    0,
    12,
  ]);
  const c: Configuration = {
    ...defaultConfig(pick(['planck2018', 'desi2026', 'act2025'])),
    ...densities(ch),
    name: `fuzz ${integer(0, 1e6)}`,
    preset: 'custom',
    H0: chance(0.8)
      ? uniform(50, 80)
      : pick([1e-6, 1, 1000, logUniform(1e-6, 1000)]),
    deModel: pick(DARK_ENERGY),
    w0,
    wa,
    expression: pick(EXPRESSIONS),
    dmModel: pick(DARK_MATTER),
    dmLogLifetime: chance(0.1) ? uniform(0, 3) : uniform(5, 40),
    annihilation: logUniform(1e-4, 1e3),
    interaction: uniform(0, 0.5),
    warmW: uniform(0, 1 / 3),
    protonDecay: chance(0.3),
    protonLogLifetime: uniform(0, 60),
    electronDecay: chance(0.2),
    electronLogLifetime: uniform(0, 60),
    evaporation: pick(['hawking', 'disabled', 'remnant'] as const),
    evaporationFactor: logUniform(1e-3, 1e3),
    blackHoleMasses: pick([[10, 1e5, 1e9], [15], [1e-8, 3e6], [1e12, 14]]),
    vacuumDecay: chance(0.25),
    vacuumLogLifetime: uniform(0, 120),
    sandbox: false,
    events: [],
    endLogYears,
    samples: chance(0.05) ? 400 : integer(40, 120),
    seed: integer(0, 0xffffffff),
    rtol: pick([1e-8, 1e-8, 1e-6, 1e-10]),
    atol: pick([1e-11, 1e-11, 1e-9, 1e-13]),
  };
  if (chance(0.3)) {
    c.sandbox = true;
    c.events = events(ch, endLogYears);
  }
  return chance(0.1) ? corrupt(ch, c) : c;
}
