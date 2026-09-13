import { defaultConfig } from '@/src/science/defaults';
import type { Configuration, Result } from '@/src/science/types';
const STORAGE_KEY = 'cosmic-futures-laboratory:v1';
const HASH_KEY = 'c';
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
export function decodeConfig(encoded: string): Configuration | null {
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    return { ...defaultConfig(), ...(value as Partial<Configuration>) };
  } catch {
    return null;
  }
}
export function shareHash(c: Configuration): string {
  return `#${HASH_KEY}=${encodeConfig(c)}`;
}
export function readSharedConfig(hash: string): Configuration | null {
  const match = new RegExp(`[#&]${HASH_KEY}=([A-Za-z0-9_-]+)`).exec(hash);
  return match ? decodeConfig(match[1]) : null;
}
export function isResult(value: unknown): value is Result {
  const r = value as Result;
  return (
    !!r &&
    typeof r === 'object' &&
    Array.isArray(r.samples) &&
    Array.isArray(r.events) &&
    typeof r.classification === 'string' &&
    !!r.config &&
    typeof r.config === 'object' &&
    !!r.metadata &&
    typeof r.metadata.configurationHash === 'string'
  );
}
export interface StoredState {
  config: Configuration;
  comparisons: Result[];
}
export function loadStored(): Partial<StoredState> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as Partial<StoredState>;
    const out: Partial<StoredState> = {};
    if (v.config && typeof v.config === 'object' && !Array.isArray(v.config))
      out.config = { ...defaultConfig(), ...v.config };
    if (Array.isArray(v.comparisons))
      out.comparisons = v.comparisons.filter(isResult).slice(0, 4);
    return out;
  } catch {
    return {};
  }
}
export function saveStored(state: StoredState): boolean {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    // Quota exceeded or storage disabled: the session simply is not persisted.
    return false;
  }
}
