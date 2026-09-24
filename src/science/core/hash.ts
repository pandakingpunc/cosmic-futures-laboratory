import type { Configuration } from '../types';
/** Noncryptographic 32-bit FNV-1a fingerprint of the serialized configuration. */
export function hashConfig(c: Configuration) {
  let h = 2166136261;
  for (const ch of JSON.stringify(c)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
