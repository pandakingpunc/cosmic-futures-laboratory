// Pure geometry and color decisions behind the SVG charts.
export interface Point {
  x: number;
  y: number | null;
}
export interface Band {
  x: number;
  low: number;
  high: number;
}
/**
 * Horizontal extent used for scaling. Runs can end before one year (or at
 * the present), so the axis never collapses to zero width.
 */
export const xSpan = (xMax: number) =>
  Number.isFinite(xMax) && xMax > 0 ? xMax : 1;
/** Range of the finite values that fall inside the visible window. */
export function yExtent(
  series: { values: Point[] }[],
  xMax: number,
  bands: Band[] = [],
): [number, number] {
  const vals = series.flatMap((s) =>
    s.values
      .filter((p) => p.x <= xMax && p.y !== null && Number.isFinite(p.y))
      .map((p) => p.y as number),
  );
  for (const b of bands)
    if (b.x <= xMax)
      for (const v of [b.low, b.high]) if (Number.isFinite(v)) vals.push(v);
  let ymin = vals.length ? Math.min(...vals) : 0,
    ymax = vals.length ? Math.max(...vals) : 1;
  if (ymax === ymin) {
    ymax += 1;
    ymin -= 1;
  }
  const pad = (ymax - ymin) * 0.075;
  return [ymin - pad, ymax + pad];
}
/**
 * SVG path data for the visible points. Gaps (null or non-finite values)
 * break the line; a finite point between two gaps is returned in `dots`
 * because a lone move command draws nothing.
 */
export function tracePath(
  points: Point[],
  xMax: number,
  sx: (x: number) => number,
  sy: (y: number) => number,
): { d: string; dots: { x: number; y: number }[] } {
  const visible = points.filter((p) => p.x <= xMax),
    finite = visible.map((p) => p.y !== null && Number.isFinite(p.y)),
    parts: string[] = [],
    dots: { x: number; y: number }[] = [];
  visible.forEach((p, i) => {
    if (!finite[i]) return;
    const x = sx(p.x),
      y = sy(p.y as number);
    if (!finite[i - 1] && !finite[i + 1]) dots.push({ x, y });
    else
      parts.push(`${finite[i - 1] ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`);
  });
  return { d: parts.join(' '), dots };
}
/**
 * Closed outline of an uncertainty band, or null when fewer than two visible
 * band points exist or any of them is not finite.
 */
export function bandPath(
  bands: Band[],
  xMax: number,
  sx: (x: number) => number,
  sy: (y: number) => number,
): string | null {
  const visible = bands.filter((b) => b.x <= xMax);
  if (
    visible.length < 2 ||
    !visible.every((b) => Number.isFinite(b.low) && Number.isFinite(b.high))
  )
    return null;
  const at = (x: number, y: number) =>
    `${sx(x).toFixed(2)},${sy(y).toFixed(2)}`;
  const upper = visible.map((b, i) => `${i ? 'L' : 'M'}${at(b.x, b.high)}`),
    lower = [...visible].reverse().map((b) => `L${at(b.x, b.low)}`);
  return [...upper, ...lower, 'Z'].join(' ');
}
/** Fate-map cell color; unresolved and invalid cells are never 'resolved'. */
export function fateCellColor(status: string, outcome: string) {
  if (status === 'invalid' || status === 'limited') return '#475362';
  if (outcome.includes('Rip')) return '#c78277';
  if (outcome.includes('de Sitter')) return '#83d5c2';
  if (outcome.includes('accelerated')) return '#769bbc';
  return '#bcaf71';
}
