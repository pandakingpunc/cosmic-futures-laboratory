import type { Configuration } from '../types';
/**
 * Noncryptographic 32-bit FNV-1a-style fingerprint (offset 2166136261,
 * prime 16777619) over the UTF-16 code units of JSON.stringify(c). For text
 * in the Basic Multilingual Plane each code unit is one character.
 */
export function hashConfig(c: Configuration) {
  const s = JSON.stringify(c);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
