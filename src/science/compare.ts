export interface CompareOptions {
  /** Relative tolerance for numbers: |a−b| ≤ rel·max(1,|b|). Zero means exact. */
  rel?: number;
  /** Paths skipped entirely, written as reported, e.g. 'metadata.timestamp'. */
  ignore?: readonly string[];
  /** Maximum number of mismatches reported. */
  limit?: number;
}
const describe = (v: unknown) =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
const show = (v: unknown) => {
  const text = JSON.stringify(v) ?? String(v);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
};
/**
 * Exact structural comparison of JSON-compatible values such as a Result read
 * back from a file. Key sets, strings, booleans, nulls and array lengths must
 * match exactly. Returns the paths of the first mismatches; empty means equal.
 */
export function compareResults(
  actual: unknown,
  expected: unknown,
  { rel = 0, ignore = ['metadata.timestamp'], limit = 20 }: CompareOptions = {},
): string[] {
  const mismatches: string[] = [];
  const skip = new Set(ignore);
  const report = (path: string, message: string) => {
    if (mismatches.length < limit)
      mismatches.push(`${path || '(root)'}: ${message}`);
  };
  const walk = (a: unknown, b: unknown, path: string) => {
    if (mismatches.length >= limit || skip.has(path)) return;
    if (typeof a === 'number' && typeof b === 'number') {
      const close =
        Object.is(a, b) ||
        a === b ||
        (Number.isFinite(a) &&
          Number.isFinite(b) &&
          Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)));
      if (!close) report(path, `expected ${b}, got ${a}`);
      return;
    }
    if (describe(a) !== describe(b)) {
      report(
        path,
        `expected ${show(b)} (${describe(b)}), got ${show(a)} (${describe(a)})`,
      );
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length)
        report(path, `expected length ${b.length}, got ${a.length}`);
      for (let i = 0; i < Math.min(a.length, b.length); i++)
        walk(a[i], b[i], `${path}[${i}]`);
      return;
    }
    if (a !== null && b !== null && typeof a === 'object') {
      const x = a as Record<string, unknown>,
        y = b as Record<string, unknown>;
      const at = (k: string) => (path ? `${path}.${k}` : k);
      for (const k of Object.keys(y))
        if (!Object.hasOwn(x, k) && !skip.has(at(k))) report(at(k), 'missing');
      for (const k of Object.keys(x))
        if (!Object.hasOwn(y, k) && !skip.has(at(k)))
          report(at(k), 'unexpected key');
      for (const k of Object.keys(y))
        if (Object.hasOwn(x, k)) walk(x[k], y[k], at(k));
      return;
    }
    if (a !== b) report(path, `expected ${show(b)}, got ${show(a)}`);
  };
  walk(actual, expected, '');
  return mismatches;
}
