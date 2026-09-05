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
            {options.find((o) => o.value === value)?.label ?? value}
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
  step = 'any',
  hint,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number | 'any';
  hint?: string;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  const [previousValue, setPreviousValue] = useState(value);
  if (!Object.is(previousValue, value)) {
    setPreviousValue(value);
    if (!Number.isNaN(value) && Number(draft) !== value)
      setDraft(String(value));
  }
  return (
    <label className="control">
      <span>{label}</span>
      <input
        aria-label={label}
        type="text"
        inputMode="decimal"
        className="mono"
        step={step}
        min={min}
        max={max}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value === '' ? NaN : Number(e.target.value));
        }}
      />
      {hint && <small>{hint}</small>}
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
