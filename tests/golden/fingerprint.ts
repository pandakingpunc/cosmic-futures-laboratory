import type { Configuration, Result } from '../../src/science/types';
/** Per-sample quantities recorded in the extended golden corpus. */
export const FINGERPRINT_FIELDS = [
  'logYears',
  'expansionIndex',
  'logH',
  'logRhoDM',
  'logRhoR',
  'logRhoDE',
  'omegaDE',
  'q',
] as const;
export interface Fingerprint {
  status: Result['status'];
  classification: string;
  acceptedSteps: number;
  rejectedSteps: number;
  events: [id: string, logYears: number][];
  samples: (number | null)[][];
}
export interface CorpusCase {
  id: string;
  config: Configuration;
  fingerprint: Fingerprint;
}
export interface Corpus {
  regenerate: string;
  fields: string[];
  cases: CorpusCase[];
}
/** A compact summary of a result, exactly as it survives JSON serialization. */
export function fingerprint(r: Result): Fingerprint {
  return JSON.parse(
    JSON.stringify({
      status: r.status,
      classification: r.classification,
      acceptedSteps: r.diagnostics.acceptedSteps,
      rejectedSteps: r.diagnostics.rejectedSteps,
      events: r.events.map((e) => [e.id, e.logYears]),
      samples: r.samples.map((s) => FINGERPRINT_FIELDS.map((f) => s[f])),
    }),
  );
}
