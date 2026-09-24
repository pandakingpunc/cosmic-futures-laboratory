'use client';
import { useState, type ReactNode } from 'react';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { parseNumberList, parseNumeric, sameNumbers } from './numeric';
export function Choice({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="control">
      <label>{label}</label>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v !== null) onChange(v);
        }}
      >
        <SelectTrigger aria-label={label} className="lab-select">
          <SelectValue>
            {options.find((o) => o.value === value)?.label ?? String(value)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  hint,
  error,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  error?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [previousValue, setPreviousValue] = useState(value);
  if (!Object.is(previousValue, value)) {
    setPreviousValue(value);
    if (!Number.isNaN(value) && parseNumeric(draft) !== value)
      setDraft(String(value));
  }
  return (
    <label className={`control ${error ? 'has-error' : ''}`}>
      <span>{label}</span>
      <input
        aria-label={label}
        aria-invalid={error ? true : undefined}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="mono"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(parseNumeric(e.target.value));
        }}
      />
      {hint && <small>{hint}</small>}
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}
/**
 * A list of numbers edited as text. The value is committed on blur and only
 * when it changed, so passing through the field leaves the configuration
 * untouched; unreadable text stays visible next to its validation error.
 */
export function NumberListField({
  label,
  value,
  onChange,
  hint,
  error,
}: {
  label: string;
  value: number[];
  onChange: (list: number[]) => void;
  hint?: string;
  error?: string;
}) {
  const [draft, setDraft] = useState(value.join(', '));
  const [previousValue, setPreviousValue] = useState(value);
  if (previousValue !== value) {
    setPreviousValue(value);
    if (!sameNumbers(parseNumberList(draft), value)) setDraft(value.join(', '));
  }
  return (
    <label className={`control ${error ? 'has-error' : ''}`}>
      <span>{label}</span>
      <input
        aria-label={label}
        aria-invalid={error ? true : undefined}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = parseNumberList(draft);
          if (!sameNumbers(next, value)) onChange(next);
        }}
      />
      {hint && <small>{hint}</small>}
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="toggle-row">
      <div>
        <label>{label}</label>
        {hint && <small>{hint}</small>}
      </div>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
export function Section({
  title,
  children,
  badge,
  open = false,
}: {
  title: string;
  children: ReactNode;
  badge?: string;
  open?: boolean;
}) {
  return (
    <details className="config-section" open={open || undefined}>
      <summary>
        {title}
        {badge && <span className="small-tag">{badge}</span>}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}
export function Badge({
  children,
  tone = 'green',
}: {
  children: ReactNode;
  tone?: 'green' | 'amber' | 'blue' | 'muted';
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function download(
  name: string,
  contents: string,
  type = 'application/json',
) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Rasterizes an SVG chart to PNG at the given device scale and downloads it. */
export function downloadSvgAsPng(
  svg: SVGSVGElement,
  name: string,
  scale = 2,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const [, , w, h] = (svg.getAttribute('viewBox') ?? '0 0 940 360')
      .split(/\s+/)
      .map(Number);
    // An explicit intrinsic size lets every browser draw the SVG image.
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.setAttribute('width', String(w));
    copy.setAttribute('height', String(h));
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas is unavailable.'));
        ctx.scale(scale, scale);
        ctx.drawImage(image, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('PNG encoding failed.'));
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          resolve();
        }, 'image/png');
      } catch (e) {
        reject(
          new Error(
            `The chart could not be rasterized: ${(e as Error).message}`,
          ),
        );
      }
    };
    image.onerror = () =>
      reject(new Error('The chart could not be rasterized.'));
    image.src =
      'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(new XMLSerializer().serializeToString(copy));
  });
}
export function format(n: number | null | undefined, digits = 3) {
  if (n === null || n === undefined || !Number.isFinite(n))
    return 'Not available';
  return Math.abs(n) > 1e5 || (Math.abs(n) > 0 && Math.abs(n) < 0.001)
    ? n.toExponential(2)
    : n.toLocaleString('en-US', { maximumFractionDigits: digits });
}
export function Time({ logYears }: { logYears: number }) {
  return (
    <span className="science-number">
      10<sup>{format(logYears, 1)}</sup> <span className="unit">yr</span>
    </span>
  );
}
