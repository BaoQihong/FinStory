import type { Evidence } from '@/lib/content/types';

const META: Record<Evidence, { label: string; title: string; cls: string; glyph: string }> = {
  documented: {
    label: 'In the data',
    title: 'Directly visible in the data used in this article',
    cls: 'border-ev-documented/30 bg-[#e3f1ec] text-ev-documented',
    glyph: '●',
  },
  context: {
    label: 'Established link',
    title: 'A widely documented relationship, not measured in this article',
    cls: 'border-ev-context/30 bg-[#e5ebf6] text-ev-context',
    glyph: '◆',
  },
  interpretation: {
    label: 'Our view',
    title: 'Seshat’s editorial interpretation',
    cls: 'border-ev-interpretation/30 bg-[#f6eadb] text-ev-interpretation',
    glyph: '◇',
  },
};

export function EvidenceTag({ evidence }: { evidence: Evidence }) {
  const m = META[evidence];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider ${m.cls}`}
      title={m.title}
    >
      <span aria-hidden="true">{m.glyph}</span>
      {m.label}
    </span>
  );
}

export function EvidenceKey() {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-soft">
      {(Object.keys(META) as Evidence[]).map((k) => (
        <div key={k} className="flex items-center gap-2">
          <dt>
            <EvidenceTag evidence={k} />
          </dt>
          <dd>{META[k].title}</dd>
        </div>
      ))}
    </dl>
  );
}
