'use client';
import { useEffect, useRef, useState } from 'react';
import type { Sample } from '@/src/science/types';
import { seededRandom } from '@/src/science/engine';
import { Slider } from '@/components/ui/slider';
import { Badge, Time, format } from './controls';
export function StructureView({ sample }: { sample: Sample }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [angle, setAngle] = useState(30),
    [zoom, setZoom] = useState(1),
    drag = useRef<number | null>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio, 2),
      W = 1000,
      H = 520;
    el.width = W * dpr;
    el.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#080f16';
    ctx.fillRect(0, 0, W, H);
    const rng = seededRandom(1337),
      rot = (angle * Math.PI) / 180;
    const scale = 1 + Math.min(8, Math.max(0, sample.expansionIndex)) * 0.45;
    function project(x: number, y: number, z: number) {
      const xx = x * Math.cos(rot) + z * Math.sin(rot),
        zz = -x * Math.sin(rot) + z * Math.cos(rot),
        p = 1 / (1 + zz * 0.3);
      return {
        x: W / 2 + xx * 235 * p * zoom,
        y: H / 2 + y * 185 * p * zoom,
        z: zz,
        p,
      };
    }
    const particles = Array.from({ length: 160 }, (_, i) => {
      const cx = ((i % 8) % 2) * 0.9 - 0.45,
        cy = (Math.floor((i % 8) / 2) % 2) * 0.7 - 0.35,
        cz = Math.floor((i % 8) / 4) * 1 - 0.5;
      const p = project(
        cx * scale + (rng() - 0.5) * 0.18,
        cy * scale + (rng() - 0.5) * 0.18,
        cz * scale + (rng() - 0.5) * 0.18,
      );
      return { ...p, r: 1.1 + rng() * 1.6 };
    }).sort((a, b) => b.z - a.z);
    ctx.strokeStyle = '#243644';
    ctx.lineWidth = 1;
    const vertices = Array.from({ length: 8 }, (_, i) =>
      project(i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1),
    );
    for (let i = 0; i < 8; i++)
      for (let bit = 0; bit < 3; bit++) {
        const j = i ^ (1 << bit);
        if (j < i) continue;
        ctx.beginPath();
        ctx.moveTo(vertices[i].x, vertices[i].y);
        ctx.lineTo(vertices[j].x, vertices[j].y);
        ctx.stroke();
      }
    for (const p of particles) {
      ctx.globalAlpha = Math.max(
        0.2,
        Math.min(1, 0.65 + 0.35 * sample.stellarFraction),
      );
      ctx.fillStyle = sample.stellarFraction > 0.1 ? '#b5eada' : '#92a5bb';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.8, p.r * p.p), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#8295a7';
    ctx.font = '13px monospace';
    ctx.fillText('NORMALIZED SCHEMATIC · FIXED SEEDED TRACERS', 28, 35);
    ctx.fillText('BOUND CLUSTERS RETAIN INTERNAL SCALE', 28, H - 24);
  }, [sample, angle, zoom]);
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">SCHEMATIC STRUCTURE VIEW</span>
          <h2>A changing cosmic scale</h2>
        </div>
        <Badge tone="amber">Not an N-body simulation</Badge>
      </div>
      <p>
        Seeded tracer groups illustrate increasing separation using the selected
        simulation state. The expansion mapping is compressed for visibility;
        coordinates and populations are not a structure-formation prediction.
      </p>
      <canvas
        className="structure-canvas"
        ref={canvas}
        role="img"
        aria-label="Rotatable 3D projection of eight schematic bound tracer groups"
        onPointerDown={(e) => {
          drag.current = e.clientX;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current !== null) {
            setAngle((v) => v + (e.clientX - drag.current!) * 0.5);
            drag.current = e.clientX;
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      />
      <div className="structure-controls">
        <div className="structure-control">
          Rotate{' '}
          <Slider
            aria-label="Structure camera rotation"
            value={[angle]}
            min={0}
            max={360}
            onValueChange={(v) => setAngle(Array.isArray(v) ? v[0] : v)}
          />
        </div>
        <div className="structure-control">
          Zoom{' '}
          <Slider
            aria-label="Structure camera zoom"
            value={[zoom]}
            min={0.5}
            max={2}
            step={0.05}
            onValueChange={(v) => setZoom(Array.isArray(v) ? v[0] : v)}
          />
        </div>
      </div>
      <div className="stat-strip">
        <span>
          {sample.isPresent ? (
            'Present day'
          ) : (
            <Time logYears={sample.logYears} />
          )}
        </span>
        <span>
          Stellar proxy <b>{format(sample.stellarFraction * 100)}%</b>
        </span>
        <span>{sample.regime}</span>
      </div>
    </div>
  );
}
