'use client';

import { useState, type ReactNode } from 'react';
import { resolveTokensSafe, type TokenContext } from '@/lib/content/tokens';

export function TextField({
  label,
  value,
  onChange,
  rows = 1,
  hint,
  ctx,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  hint?: string;
  ctx?: TokenContext;
  disabled?: boolean;
}) {
  const showPreview = ctx && value.includes('{');
  return (
    <label className="block">
      <span className="studio-label">{label}</span>
      {hint ? <span className="ml-2 text-xs text-muted">{hint}</span> : null}
      {rows > 1 ? (
        <textarea value={value} rows={rows} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="studio-input mt-1" />
      ) : (
        <input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="studio-input mt-1" />
      )}
      {showPreview ? <span className="mt-1 block text-xs leading-relaxed text-muted">Reads as: {resolveTokensSafe(value, ctx)}</span> : null}
    </label>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: readonly (T | readonly [T, string])[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="studio-label">{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)} className="studio-input mt-1">
        {options.map((o) => {
          const [v, l] = typeof o === 'string' ? [o, o] : o;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </label>
  );
}

/** Ordered list editor: add, remove, move. */
export function ListEditor<T>({
  title,
  items,
  onChange,
  make,
  render,
  max = 20,
  min = 0,
  addLabel = 'Add',
  disabled,
}: {
  title?: string;
  items: T[];
  onChange: (next: T[]) => void;
  make?: () => T;
  render: (item: T, set: (v: T) => void, index: number) => ReactNode;
  max?: number;
  min?: number;
  addLabel?: string;
  disabled?: boolean;
}) {
  const set = (i: number, v: T) => onChange(items.map((x, j) => (j === i ? v : x)));
  const move = (i: number, d: number) => {
    const n = [...items];
    const [x] = n.splice(i, 1);
    n.splice(i + d, 0, x);
    onChange(n);
  };
  return (
    <div>
      {title ? <p className="studio-label">{title}</p> : null}
      <ol className="mt-2 space-y-3">
        {items.map((it, i) => (
          <li key={i} className="rounded-xl border border-cream-300 bg-white/60 p-3">
            <div className="mb-2 flex items-center justify-end gap-1 text-xs">
              <span className="mr-auto font-semibold text-muted">#{i + 1}</span>
              <button type="button" className="studio-btn-quiet" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                ↑
              </button>
              <button type="button" className="studio-btn-quiet" disabled={disabled || i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                ↓
              </button>
              <button type="button" className="studio-btn-quiet" disabled={disabled || items.length <= min} onClick={() => onChange(items.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
            {render(it, (v) => set(i, v), i)}
          </li>
        ))}
      </ol>
      {make && items.length < max ? (
        <button type="button" className="studio-btn mt-3" disabled={disabled} onClick={() => onChange([...items, make()])}>
          + {addLabel}
        </button>
      ) : null}
    </div>
  );
}

export function StringList({ title, items, onChange, max = 6, min = 0, ctx, disabled }: { title: string; items: string[]; onChange: (v: string[]) => void; max?: number; min?: number; ctx?: TokenContext; disabled?: boolean }) {
  return (
    <ListEditor
      title={title}
      items={items}
      onChange={onChange}
      make={() => ''}
      max={max}
      min={min}
      disabled={disabled}
      render={(v, set) => <TextField label="Text" value={v} onChange={set} rows={2} ctx={ctx} disabled={disabled} />}
    />
  );
}

export function FactPalette({ ctx }: { ctx: TokenContext }) {
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState('');
  const facts = Object.entries(ctx.facts).filter(([k, f]) => !q || k.toLowerCase().includes(q.toLowerCase()) || f.method.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="studio-card p-4">
      <p className="studio-label">Verified figures</p>
      <p className="mt-1 text-xs text-muted">Numbers must be inserted as tokens so they stay tied to the data. Click to copy.</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="studio-input mt-2 py-1.5 text-sm" />
      <ul className="mt-2 max-h-[28rem] space-y-1 overflow-y-auto text-xs">
        {facts.slice(0, 200).map(([k, f]) => (
          <li key={k}>
            <button
              type="button"
              title={f.method}
              onClick={() => {
                void navigator.clipboard?.writeText(`{${k}}`);
                setCopied(k);
              }}
              className="w-full rounded px-1.5 py-1 text-left hover:bg-cream-200"
            >
              <code className="text-navy-800">{`{${k}}`}</code> <span className="text-ink">{resolveTokensSafe(`{${k}}`, ctx)}</span>
              {f.date ? <span className="text-muted"> · {resolveTokensSafe(`{${k}.date}`, ctx)}</span> : null}
              {f.format === 'text' ? <span className="text-muted"> · source {f.sourceRefs?.join(',')}</span> : null}
              {copied === k ? <span className="ml-1 text-ev-documented">copied</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AttentionEditor({ attention, onChange, disabled }: { attention: { required: boolean; reasons: string[] }; onChange: (a: { required: boolean; reasons: string[] }) => void; disabled?: boolean }) {
  if (!attention.required)
    return (
      <p className="flex items-center justify-between rounded-lg bg-[#e3f1ec] px-3 py-2 text-xs text-ev-documented">
        No editorial attention flagged.
        <button type="button" className="studio-btn-quiet" disabled={disabled} onClick={() => onChange({ required: true, reasons: ['Flagged by editor'] })}>
          Flag
        </button>
      </p>
    );
  return (
    <div className="rounded-lg border border-[#c2410c]/40 bg-[#fff4ec] px-3 py-2 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-[#9a3412]">Needs editorial attention</p>
        <button type="button" className="studio-btn" disabled={disabled} onClick={() => onChange({ required: false, reasons: [] })}>
          Mark resolved
        </button>
      </div>
      <ul className="mt-1 list-disc pl-5 text-xs text-ink-soft">
        {attention.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}
