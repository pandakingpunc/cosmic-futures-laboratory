export type DarkEnergy = 'lambda' | 'constant' | 'cpl' | 'bounded' | 'custom';
export type DarkMatter =
  | 'stable'
  | 'decay'
  | 'annihilation'
  | 'warm'
  | 'interacting';
export type Reliability =
  | 'Established physics'
  | 'Observationally constrained'
  | 'Model dependent'
  | 'Theoretically speculative'
  | 'Pure what-if';
export interface PhysicsEvent {
  id: string;
  logTime: number;
  action:
    | 'change-w'
    | 'vacuum-scale'
    | 'change-G'
    | 'halt'
    | 'reverse'
    | 'dm-lifetime';
  value: number;
}
export interface Configuration {
  name: string;
  preset: string;
  H0: number;
  omegaB: number;
  omegaDM: number;
  omegaNu: number;
  omegaR: number;
  omegaDE: number;
  omegaK: number;
  Tcmb: number;
  Neff: number;
  deModel: DarkEnergy;
  w0: number;
  wa: number;
  expression: string;
  dmModel: DarkMatter;
  dmLogLifetime: number;
  annihilation: number;
  interaction: number;
  warmW: number;
  protonDecay: boolean;
  protonLogLifetime: number;
  electronDecay: boolean;
  electronLogLifetime: number;
  evaporation: 'hawking' | 'disabled' | 'remnant';
  evaporationFactor: number;
  blackHoleMasses: number[];
  vacuumDecay: boolean;
  vacuumLogLifetime: number;
  sandbox: boolean;
  events: PhysicsEvent[];
  endLogYears: number;
  samples: number;
  seed: number;
  rtol: number;
  atol: number;
}
export interface Sample {
  logYears: number;
  isPresent: boolean;
  logA: number | null;
  expansionIndex: number;
  logH: number | null;
  logRhoB: number | null;
  logRhoDM: number | null;
  logRhoR: number | null;
  logRhoDE: number | null;
  omegaM: number | null;
  omegaR: number | null;
  omegaDE: number | null;
  omegaK: number | null;
  logTcmb: number | null;
  logRadiationEffectiveT: number | null;
  q: number | null;
  w: number | null;
  logHubbleRadiusMpc: number | null;
  logComovingHubbleMpc: number | null;
  logHorizonEntropy: number | null;
  stellarFraction: number;
  baryonSurvival: number;
  electronSurvival: number;
  bhMassFractions: number[];
  regime: 'numerical' | 'asymptotic' | 'contraction';
  constraintResidual: number;
}
export interface CosmicEvent {
  id: string;
  title: string;
  logYears: number;
  range?: [number, number];
  detail: string;
  reliability: Reliability;
  sources: string[];
}
export interface Result {
  config: Configuration;
  samples: Sample[];
  events: CosmicEvent[];
  classification: string;
  explanation: string;
  status: 'complete' | 'terminated' | 'limited' | 'invalid';
  warnings: string[];
  errors: string[];
  diagnostics: {
    acceptedSteps: number;
    rejectedSteps: number;
    maxConstraintResidual: number;
    maxErrorNorm: number;
    numericalUntilLogYears: number;
    reason: string;
    tail: string | null;
  };
  metadata: {
    version: string;
    datasetVersion: string;
    timestamp: string;
    solver: string;
    timeOrigin: string;
    equations: string[];
    seed: number;
    configurationHash: string;
  };
}
export interface Source {
  id: string;
  title: string;
  authors: string;
  date: string;
  url: string;
  doi: string | null;
  arxiv: string | null;
  dataset: string;
  selectedBecause: string;
  notes: string;
  parameters: Record<string, unknown>;
}
export const VERSION = '0.1.0';
export const DATASET_VERSION = '2026-09-05.1';
export const EQUATIONS = [
  'H²/H₀² = (Ωb + Ων,massive) a⁻³ + ρdm/ρc,0 + ρr/ρc,0 + ρde/ρc,0 + Ωk a⁻²',
  'dρi/dt + 3H(1 + wi)ρi = Qi; ΣQi = 0 for conservative transfers',
  'd ln|ρde| / d ln a = −3[1 + w(a)]',
  'D = (ρdm/ρc,0)a³; R = (ρr/ρc,0)a⁴; τ = H₀(t − t₀)',
  'dD/d ln a = −3wDM D − ΓD/H − ξD − A D² a⁻³/(H/H₀)',
  'dR/d ln a = a[ΓD/H + ξD + A D² a⁻³/(H/H₀)]',
  'Tγ = Tγ,0/a; TH = ℏc³/(8πGkB M); tevap = 5120πG²M³/(ℏc⁴)',
];
