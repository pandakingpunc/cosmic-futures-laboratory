// Parsing of typed numbers. The fields are plain text inputs so that phones
// offer a full keyboard (minus sign, exponent and both decimal separators).
const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
/**
 * Reads decimal or scientific notation. Accepts the Unicode minus (U+2212)
 * used throughout the interface and a single comma as the decimal separator
 * when no point is present. Empty text, hexadecimal, Infinity and anything
 * that is not a finite number give NaN.
 */
export function parseNumeric(text: string): number {
  let s = text.trim().replace(/−/g, '-');
  if (!s.includes('.') && s.split(',').length === 2) s = s.replace(',', '.');
  if (!NUMERIC.test(s)) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
/**
 * Reads a comma-separated list, or a semicolon-separated one whose items may
 * use a decimal comma ("1,5; 10"). Empty items (such as a trailing separator)
 * are ignored and unreadable items become NaN for validation to report.
 */
export function parseNumberList(text: string): number[] {
  return text
    .split(text.includes(';') ? ';' : ',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map(parseNumeric);
}
/** Element-wise identity, treating NaN as equal to NaN. */
export function sameNumbers(a: readonly number[], b: readonly number[]) {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}
