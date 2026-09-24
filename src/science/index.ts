// Public library entry point. Modules below it are internal and may be
// reorganised; everything exported here is the stable API.
export {
  simulate,
  type SimulateOptions,
  type SimulationCounters,
} from './engine';
export {
  validate,
  type Validation,
  type ValidationField,
} from './model/validate';
export { hashConfig } from './core/hash';
export { H0_YEAR } from './core/constants';
export {
  canonicalConfig,
  defaultConfig,
  presets,
  withDefaults,
} from './defaults';
export {
  API_LIMITS,
  BudgetExceededError,
  ValidationError,
  type WorkBudget,
} from './core/limits';
export {
  ensemble,
  sensitivity,
  sweep,
  type AnalysisContext,
  type EnsembleOptions,
  type EnsembleResult,
  type Parameter,
} from './analysis';
export {
  ANALYSIS_MODES,
  isAnalysisMode,
  runAnalysis,
  type AnalysisMode,
} from './dispatch';
export { csv, report } from './report';
export { compareResults, type CompareOptions } from './compare';
export {
  DATASET_VERSION,
  EQUATIONS,
  VERSION,
  type Configuration,
  type CosmicEvent,
  type CplContinuation,
  type DarkEnergy,
  type DarkMatter,
  type DerivedQuantities,
  type PhysicsEvent,
  type Reliability,
  type Result,
  type Sample,
  type Source,
} from './types';
