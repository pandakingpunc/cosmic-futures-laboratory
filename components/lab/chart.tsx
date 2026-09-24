'use client';
import { useState, useRef, type PointerEvent } from 'react';
import { format } from './controls';
import { bandPath, tracePath, xSpan, yExtent, type Band } from './plotting';
export interface PlotSeries {
  key: string;
  label: string;
  color: string;
  values: { x: number; y: number | null }[];
  dashed?: boolean;
}
export function ScientificPlot({
  series,
  xMax,
  title,
  description,
  onInspect,
  asymptote,
  bands,
}: {
  series: PlotSeries[];
  xMax: number;
  title: string;
  description?: string;
  onInspect?: (x: number) => void;
  asymptote?: number;
  bands?: Band[];
}) {
  const [hover, setHover] = useState<number | null>(null),
    ref = useRef<SVGSVGElement>(null);
  const W = 940,
    H = 360,
    L = 70,
    R = 28,
    T = 28,
    B = 58;
  const [ymin, ymax] = yExtent(series, xMax, bands),
    span = xSpan(xMax);
  const sx = (x: number) => L + (x / span) * (W - L - R),
    sy = (y: number) => T + ((ymax - y) / (ymax - ymin)) * (H - T - B);
  const axis = (v: number) =>
    Math.abs(v) > 1e5 ? v.toExponential(1) : format(v, 2);
  const band = bands ? bandPath(bands, xMax, sx, sy) : null;
  function pointer(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const xx = Math.max(
      0,
      Math.min(
        xMax,
        ((((e.clientX - rect.left) / rect.width) * W - L) / (W - L - R)) * span,
      ),
    );
    setHover(xx);
    onInspect?.(xx);
  }
  const nearest = series.map((s) => ({
    s,
    p: s.values
      .filter((v) => v.y !== null)
      .reduce<{ x: number; y: number | null } | null>(
        (best, p) =>
          best === null ||
          Math.abs(p.x - (hover ?? 0)) < Math.abs(best.x - (hover ?? 0))
            ? p
            : best,
        null,
      ),
  }));
  return (
    <div className="plot-wrap">
      <div className="plot-title">
        <h3>{title}</h3>
        <div className="legend">
          {series.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <svg
        ref={ref}
        className="scientific-plot"
        data-export-chart="true"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${title}. ${description ?? ''}`}
        onPointerMove={pointer}
        onPointerLeave={() => setHover(null)}
      >
        <rect width={W} height={H} fill="#0c131b" />
        {asymptote !== undefined && asymptote < xMax && (
          <>
            <rect
              x={sx(asymptote)}
              y={T}
              width={W - R - sx(asymptote)}
              height={H - T - B}
              fill="#eeb96b"
              opacity=".025"
            />
            <line
              x1={sx(asymptote)}
              y1={T}
              x2={sx(asymptote)}
              y2={H - B}
              stroke="#ad8853"
              opacity=".6"
              strokeDasharray="3 6"
            />
          </>
        )}
        {Array.from({ length: 6 }, (_, i) => {
          const yy = ymin + ((ymax - ymin) * i) / 5,
            xx = (span * i) / 5;
          return (
            <g key={i}>
              <line
                x1={L}
                x2={W - R}
                y1={sy(yy)}
                y2={sy(yy)}
                stroke="#25323e"
                strokeDasharray="2 5"
              />
              <text
                x={L - 14}
                y={sy(yy) + 4}
                fill="#8d9baa"
                textAnchor="end"
                fontSize="12"
                fontFamily="monospace"
              >
                {axis(yy)}
              </text>
              <line
                x1={sx(xx)}
                x2={sx(xx)}
                y1={T}
                y2={H - B}
                stroke="#25323e"
                strokeDasharray="2 5"
              />
              <text
                x={sx(xx)}
                y={H - B + 25}
                fill="#8d9baa"
                textAnchor="middle"
                fontSize="12"
                fontFamily="monospace"
              >
                {format(xx, 1)}
              </text>
            </g>
          );
        })}
        {band && <path d={band} fill="#83e9bd" opacity=".16" />}
        {series.map((s) => {
          const { d, dots } = tracePath(s.values, xMax, sx, sy);
          return (
            <g key={s.key}>
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth="2.4"
                strokeDasharray={s.dashed ? '6 4' : undefined}
                vectorEffect="non-scaling-stroke"
              />
              {dots.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="3" fill={s.color} />
              ))}
            </g>
          );
        })}
        {hover !== null && (
          <line
            x1={sx(hover)}
            x2={sx(hover)}
            y1={T}
            y2={H - B}
            stroke="#d5e3ef"
            opacity=".5"
          />
        )}
        <text
          x={(L + W - R) / 2}
          y={H - 8}
          fill="#aab9c9"
          textAnchor="middle"
          fontSize="13"
        >
          log₁₀(elapsed years from today)
        </text>
      </svg>
      <div className="chart-foot">
        <span>{description}</span>
        {hover !== null && (
          <div className="plot-inspection">
            t = 10^{format(hover, 2)} yr{' '}
            {nearest.map(({ s, p }) => (
              <span key={s.key} style={{ color: s.color }}>
                {s.label}: {format(p?.y, 5)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
