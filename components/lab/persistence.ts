import { defaultConfig } from '@/src/science/defaults';
import type { Configuration, PhysicsEvent, Result } from '@/src/science/types';
// Shared links, imported files and browser storage are untrusted input: every
// configuration is projected onto the known fields before it reaches React.
const LEGACY_KEY = 'cosmic-futures-laboratory:v1';
const CONFIG_KEY = 'cosmic-futures-laboratory:v2:config';
const BENCH_KEY = 'cosmic-futures-laboratory:v2:bench';
const HASH_KEY = 'c';
const BENCH_SLOTS = 4;
type Loose = Record<string, unknown>;
const isObject = (v: unknown): v is Loose =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const isNumberOrNull = (v: unknown) => v === null || typeof v === 'number';
const isStringArray = (v: unknown) =>
  Array.isArray(v) && v.every((s) => typeof s === 'string');
function isPhysicsEvent(v: unknown): v is PhysicsEvent {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.logTime === 'number' &&
    typeof v.action === 'string' &&
    typeof v.value === 'number'
  );
}
export interface ConfigInspection {
  config: Configuration;
  /** Fields the laboratory does not know; they are dropped. */
  unknown: string[];
  /** Known fields with the wrong type; the reference value is kept instead. */
  invalid: string[];
}
/**
 * Starts from the reference configuration and copies only known fields whose
 * runtime type matches it. Malformed custom events are dropped one by one.
 * Values are not range-checked here; validate() reports those.
 */
export function inspectConfig(raw: unknown): ConfigInspection {
  const config = defaultConfig(),
    target = config as unknown as Loose,
    unknown: string[] = [],
    invalid: string[] = [];
  if (!isObject(raw)) return { config, unknown, invalid: ['configuration'] };
  for (const [key, value] of Object.entries(raw)) {
    if (!Object.hasOwn(target, key)) unknown.push(key);
    else if (key === 'events') {
      if (!Array.isArray(value)) invalid.push(key);
      else {
        const kept = value.filter(isPhysicsEvent);
        if (kept.length !== value.length) invalid.push(key);
        config.events = kept.map(({ id, logTime, action, value }) => ({
          id,
          logTime,
          action,
          value,
        }));
      }
    } else if (key === 'blackHoleMasses') {
      if (Array.isArray(value) && value.every((m) => typeof m === 'number'))
        config.blackHoleMasses = [...(value as number[])];
      else invalid.push(key);
    } else if (value !== null && typeof value === typeof target[key])
      target[key] = value;
    else invalid.push(key);
  }
  return { config, unknown, invalid };
}
export function sanitizeConfig(raw: unknown): Configuration {
  return inspectConfig(raw).config;
}
/** URL-safe base64 of the configuration JSON, for shareable links. */
export function encodeConfig(c: Configuration): string {
  const bytes = new TextEncoder().encode(JSON.stringify(c));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
/** The decoded JSON value, or undefined when any decoding stage fails. */
function decodeJson(encoded: string): unknown {
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return undefined;
  }
}
export function decodeConfig(encoded: string): Configuration | null {
  const value = decodeJson(encoded);
  return isObject(value) ? sanitizeConfig(value) : null;
}
export function shareHash(c: Configuration): string {
  return `#${HASH_KEY}=${encodeConfig(c)}`;
}
/**
 * A shared link is absent, unreadable (for example truncated by a chat
 * client) or readable. Readable links still need validate().
 */
export type SharedLink =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | ({ kind: 'ok' } & ConfigInspection);
export function parseShareHash(hash: string): SharedLink {
  const match = new RegExp(`[#&]${HASH_KEY}=([^&]*)`).exec(hash);
  if (!match) return { kind: 'none' };
  const value = decodeJson(match[1]);
  return isObject(value)
    ? { kind: 'ok', ...inspectConfig(value) }
    : { kind: 'invalid' };
}
export function readSharedConfig(hash: string): Configuration | null {
  const link = parseShareHash(hash);
  return link.kind === 'ok' ? link.config : null;
}
const NUMERIC_SAMPLE_FIELDS = [
  'logA',
  'expansionIndex',
  'logH',
  'logRhoB',
  'logRhoDM',
  'logRhoR',
  'logRhoDE',
  'omegaM',
  'omegaR',
  'omegaDE',
  'omegaK',
  'logTcmb',
  'logRadiationEffectiveT',
  'q',
  'w',
  'logHubbleRadiusMpc',
  'logComovingHubbleMpc',
  'logHorizonEntropy',
  'stellarFraction',
  'baryonSurvival',
  'electronSurvival',
  'constraintResidual',
] as const;
function isSample(v: unknown) {
  return (
    isObject(v) &&
    typeof v.logYears === 'number' &&
    Number.isFinite(v.logYears) &&
    typeof v.isPresent === 'boolean' &&
    typeof v.regime === 'string' &&
    Array.isArray(v.bhMassFractions) &&
    v.bhMassFractions.every(isNumberOrNull) &&
    NUMERIC_SAMPLE_FIELDS.every((k) => isNumberOrNull(v[k])) &&
    // Added after 0.2.0; older files omit it.
    (v.logHorizonTemperature === undefined ||
      isNumberOrNull(v.logHorizonTemperature))
  );
}
function isEvent(v: unknown) {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.logYears === 'number' &&
    Number.isFinite(v.logYears) &&
    typeof v.detail === 'string' &&
    typeof v.reliability === 'string' &&
    isStringArray(v.sources) &&
    (v.range === undefined ||
      (Array.isArray(v.range) &&
        v.range.length === 2 &&
        v.range.every((x) => typeof x === 'number')))
  );
}
/**
 * Structural check of a result file: every field the laboratory renders has
 * the type it expects, so an edited or truncated file is rejected on import
 * instead of failing later while drawing.
 */
export function isResult(value: unknown): value is Result {
  if (!isObject(value)) return false;
  const { diagnostics: d, metadata: m } = value;
  return (
    isObject(value.config) &&
    inspectConfig(value.config).invalid.length === 0 &&
    Array.isArray(value.samples) &&
    value.samples.every(isSample) &&
    Array.isArray(value.events) &&
    value.events.every(isEvent) &&
    typeof value.classification === 'string' &&
    typeof value.explanation === 'string' &&
    ['complete', 'terminated', 'limited', 'invalid'].includes(
      value.status as string,
    ) &&
    isStringArray(value.warnings) &&
    isStringArray(value.errors) &&
    isObject(d) &&
    [
      'acceptedSteps',
      'rejectedSteps',
      'maxConstraintResidual',
      'maxErrorNorm',
      'numericalUntilLogYears',
    ].every((k) => isNumberOrNull(d[k])) &&
    typeof d.reason === 'string' &&
    (d.tail === null || typeof d.tail === 'string') &&
    isObject(m) &&
    [
      'version',
      'datasetVersion',
      'timestamp',
      'solver',
      'timeOrigin',
      'configurationHash',
    ].every((k) => typeof m[k] === 'string') &&
    isStringArray(m.equations) &&
    typeof m.seed === 'number' &&
    (value.derived === undefined || isObject(value.derived))
  );
}
/** A recognized result with unknown configuration fields removed. */
function storedResult(value: unknown): Result | null {
  return isResult(value)
    ? { ...value, config: sanitizeConfig(value.config) }
    : null;
}
export interface StoredState {
  config?: Configuration;
  /** Fields of the stored configuration that were malformed and reset. */
  configIssues?: string[];
  /** The address-bar hash this browser wrote when the config was saved. */
  lastRunHash?: string;
  comparisons?: Result[];
  /** Stored bench entries that failed the structural check. */
  droppedComparisons?: number;
}
function storage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}
function read(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}
function write(key: string, value: string): boolean {
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch {
    // Quota exceeded or storage disabled.
    return false;
  }
}
function exists(key: string) {
  try {
    return storage()?.getItem(key) != null;
  } catch {
    return false;
  }
}
function remove(key: string) {
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}
/**
 * Reads the configuration and the comparison bench. Both fall back to the
 * single combined record written by version 0.2.0.
 */
export function loadStored(): StoredState {
  const out: StoredState = {};
  const legacy = read(LEGACY_KEY),
    old = isObject(legacy) ? legacy : {};
  const saved = read(CONFIG_KEY),
    record = isObject(saved) ? saved : { config: old.config };
  if (isObject(record.config)) {
    const { config, invalid } = inspectConfig(record.config);
    out.config = config;
    if (invalid.length) out.configIssues = invalid;
    if (typeof record.lastRunHash === 'string')
      out.lastRunHash = record.lastRunHash;
  }
  const bench = read(BENCH_KEY) ?? old.comparisons;
  if (Array.isArray(bench)) {
    const kept = bench.slice(0, BENCH_SLOTS).map(storedResult);
    out.comparisons = kept.filter((r): r is Result => r !== null);
    const dropped = kept.length - out.comparisons.length;
    if (dropped) out.droppedComparisons = dropped;
  }
  return out;
}
/** Drops the bench from the 0.2.0 record; its configuration stays until migrated. */
function releaseLegacyBench() {
  const legacy = read(LEGACY_KEY),
    config = isObject(legacy) ? legacy.config : undefined;
  if (!isObject(config) || exists(CONFIG_KEY)) remove(LEGACY_KEY);
  else write(LEGACY_KEY, JSON.stringify({ config }));
}
export function saveConfig(config: Configuration, lastRunHash: string) {
  const ok = write(CONFIG_KEY, JSON.stringify({ config, lastRunHash }));
  if (ok && exists(BENCH_KEY)) remove(LEGACY_KEY);
  return ok;
}
/** Saves the bench on its own key, so editing never re-serializes it. */
export function saveBench(comparisons: Result[]): boolean {
  const value = JSON.stringify(comparisons);
  if (write(BENCH_KEY, value)) {
    if (exists(LEGACY_KEY)) releaseLegacyBench();
    return true;
  }
  // The legacy combined record may hold the space the bench needs; it holds
  // the same bench, which was read from it.
  if (!exists(LEGACY_KEY)) return false;
  releaseLegacyBench();
  return write(BENCH_KEY, value);
}
/** Forgets the stored configuration and, optionally, the bench. */
export function clearStored({ bench = false } = {}) {
  remove(CONFIG_KEY);
  const legacy = read(LEGACY_KEY);
  if (bench || !isObject(legacy)) remove(LEGACY_KEY);
  else write(LEGACY_KEY, JSON.stringify({ comparisons: legacy.comparisons }));
  if (bench) remove(BENCH_KEY);
}
