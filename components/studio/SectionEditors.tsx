'use client';

import type { TokenContext } from '@/lib/content/tokens';
import type { SeshatArticle } from '@/lib/studio/schema';
import { AttentionEditor, ListEditor, SelectField, StringList, TextField } from './fields';

type A = SeshatArticle;
type Props<K extends 'story' | 'macro' | 'analytics' | 'outlook'> = {
  value: A[K];
  onChange: (v: A[K]) => void;
  ctx: TokenContext;
  charts: { id: string; label: string }[];
  indicators: { key: string; label: string }[];
  disabled?: boolean;
};

const EVIDENCE = [
  ['documented', 'In the data'],
  ['context', 'Established link'],
  ['interpretation', 'Our view'],
] as const;
const ICONS = ['bonds', 'cash', 'stocks', 'property', 'currency', 'commodities'] as const;

function ChartPicker({ value, charts, onChange, disabled }: { value: string; charts: { id: string; label: string }[]; onChange: (v: string) => void; disabled?: boolean }) {
  return <SelectField label="Chart (from retrieved data)" value={value} options={charts.map((c) => [c.id, c.label] as [string, string])} onChange={onChange} disabled={disabled} />;
}

function ChartRefs({ title, value, onChange, charts, ctx, disabled, max }: { title: string; value: A['macro']['charts']; onChange: (v: A['macro']['charts']) => void; charts: Props<'macro'>['charts']; ctx: TokenContext; disabled?: boolean; max: number }) {
  return (
    <ListEditor
      title={title}
      items={value}
      onChange={onChange}
      max={max}
      disabled={disabled || !charts.length}
      addLabel="Add chart"
      make={() => ({ chartId: charts.find((c) => !value.some((v) => v.chartId === c.id))?.id ?? charts[0]?.id ?? '', question: 'What does this chart show?', takeaway: 'Write the takeaway.' })}
      render={(c, set) => (
        <div className="space-y-2">
          <ChartPicker value={c.chartId} charts={charts} onChange={(chartId) => set({ ...c, chartId })} disabled={disabled} />
          <TextField label="Question (chart title)" value={c.question} onChange={(question) => set({ ...c, question })} ctx={ctx} disabled={disabled} />
          <TextField label="Takeaway" value={c.takeaway} onChange={(takeaway) => set({ ...c, takeaway })} rows={2} ctx={ctx} disabled={disabled} />
        </div>
      )}
    />
  );
}

function ExplainerList({ title, value, onChange, ctx, disabled, max }: { title: string; value: A['macro']['explainers']; onChange: (v: A['macro']['explainers']) => void; ctx: TokenContext; disabled?: boolean; max: number }) {
  return (
    <ListEditor
      title={title}
      items={value}
      onChange={onChange}
      max={max}
      disabled={disabled}
      make={() => ({ title: 'Title', text: 'Text', evidence: 'interpretation' as const })}
      render={(e, set) => (
        <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
          <TextField label="Title" value={e.title} onChange={(title) => set({ ...e, title })} disabled={disabled} />
          <SelectField label="Evidence" value={e.evidence} options={EVIDENCE} onChange={(evidence) => set({ ...e, evidence })} disabled={disabled} />
          <div className="sm:col-span-2">
            <TextField label="Text" value={e.text} onChange={(text) => set({ ...e, text })} rows={3} ctx={ctx} disabled={disabled} />
          </div>
        </div>
      )}
    />
  );
}

export function StoryEditor({ value: s, onChange, ctx, charts, disabled }: Props<'story'>) {
  const set = (p: Partial<A['story']>) => onChange({ ...s, ...p });
  return (
    <div className="space-y-5">
      <AttentionEditor attention={s.attention} onChange={(attention) => set({ attention })} disabled={disabled} />
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <TextField label="Kicker" value={s.kicker} onChange={(kicker) => set({ kicker })} disabled={disabled} />
        <TextField label="Headline" value={s.headline} onChange={(headline) => set({ headline })} ctx={ctx} disabled={disabled} />
      </div>
      <TextField label="Summary (dek)" value={s.dek} onChange={(dek) => set({ dek })} rows={2} ctx={ctx} disabled={disabled} />
      <StringList title="The story in 30 seconds" items={s.keyPoints} onChange={(keyPoints) => set({ keyPoints })} max={4} min={1} ctx={ctx} disabled={disabled} />
      <ListEditor
        title="Narrative"
        items={s.blocks}
        onChange={(blocks) => set({ blocks })}
        max={40}
        min={1}
        addLabel="Add paragraph"
        disabled={disabled}
        make={() => ({ type: 'p' as const, text: 'New paragraph.' })}
        render={(b, setB) => (
          <div className="space-y-2">
            <SelectField
              label="Block"
              value={b.type}
              disabled={disabled}
              options={[['p', 'Paragraph'], ['h3', 'Subhead'], ['pullquote', 'Pull quote'], ...(charts.length ? [['chart', 'Chart'] as ['chart', string]] : [])]}
              onChange={(type) =>
                setB(type === 'chart' ? { type, chartId: charts[0].id, question: 'What does this chart show?', takeaway: 'Write the takeaway.' } : { type, text: 'text' in b ? b.text : 'Text' })
              }
            />
            {b.type === 'chart' ? (
              <>
                <ChartPicker value={b.chartId} charts={charts} onChange={(chartId) => setB({ ...b, chartId })} disabled={disabled} />
                <TextField label="Question (chart title)" value={b.question} onChange={(question) => setB({ ...b, question })} ctx={ctx} disabled={disabled} />
                <TextField label="Takeaway" value={b.takeaway} onChange={(takeaway) => setB({ ...b, takeaway })} rows={2} ctx={ctx} disabled={disabled} />
              </>
            ) : (
              <TextField label="Text" value={b.text} onChange={(text) => setB({ ...b, text })} rows={b.type === 'p' ? 4 : 2} ctx={ctx} disabled={disabled} />
            )}
          </div>
        )}
      />
    </div>
  );
}

export function MacroEditor({ value: m, onChange, ctx, charts, indicators, disabled }: Props<'macro'>) {
  const set = (p: Partial<A['macro']>) => onChange({ ...m, ...p });
  return (
    <div className="space-y-5">
      <AttentionEditor attention={m.attention} onChange={(attention) => set({ attention })} disabled={disabled} />
      <TextField label="Title" value={m.title} onChange={(title) => set({ title })} disabled={disabled} />
      <TextField label="Intro" value={m.intro} onChange={(intro) => set({ intro })} rows={3} ctx={ctx} disabled={disabled} />
      <ListEditor
        title="Indicator cards"
        items={m.indicators}
        onChange={(v) => set({ indicators: v })}
        max={4}
        disabled={disabled || !indicators.length}
        addLabel="Add indicator"
        make={() => ({ key: indicators.find((i) => !m.indicators.some((x) => x.key === i.key))?.key ?? indicators[0]?.key ?? '', note: 'Why this number matters.' })}
        render={(n, setN) => (
          <div className="space-y-2">
            <SelectField label="Indicator" value={n.key} options={indicators.map((i) => [i.key, i.label] as [string, string])} onChange={(key) => setN({ ...n, key })} disabled={disabled} />
            <TextField label="Note" value={n.note} onChange={(note) => setN({ ...n, note })} rows={2} ctx={ctx} disabled={disabled} />
          </div>
        )}
      />
      <ChartRefs title="Charts" value={m.charts} onChange={(c) => set({ charts: c })} charts={charts} ctx={ctx} disabled={disabled} max={4} />
      <ExplainerList title="What changed" value={m.explainers} onChange={(explainers) => set({ explainers })} ctx={ctx} disabled={disabled} max={6} />
    </div>
  );
}

export function AnalyticsEditor({ value: a, onChange, ctx, charts, disabled }: Props<'analytics'>) {
  const set = (p: Partial<A['analytics']>) => onChange({ ...a, ...p });
  return (
    <div className="space-y-5">
      <AttentionEditor attention={a.attention} onChange={(attention) => set({ attention })} disabled={disabled} />
      <TextField label="Title" value={a.title} onChange={(title) => set({ title })} disabled={disabled} />
      <TextField label="Intro" value={a.intro} onChange={(intro) => set({ intro })} rows={3} ctx={ctx} disabled={disabled} />
      <TextField label="Mechanism title" value={a.chain.title} onChange={(title) => set({ chain: { ...a.chain, title } })} disabled={disabled} />
      <ExplainerList title="Transmission steps" value={a.chain.steps} onChange={(steps) => set({ chain: { ...a.chain, steps } })} ctx={ctx} disabled={disabled} max={6} />
      <ChartRefs title="Supporting charts" value={a.charts} onChange={(c) => set({ charts: c })} charts={charts} ctx={ctx} disabled={disabled} max={3} />
      <ExplainerList title="Historical comparisons & context" value={a.comparisons} onChange={(comparisons) => set({ comparisons })} ctx={ctx} disabled={disabled} max={4} />
      <TextField label="Implications title" value={a.implications.title} onChange={(title) => set({ implications: { ...a.implications, title } })} disabled={disabled} />
      <TextField label="Implications intro" value={a.implications.intro} onChange={(intro) => set({ implications: { ...a.implications, intro } })} rows={2} ctx={ctx} disabled={disabled} />
      <ListEditor
        title="Asset implications"
        items={a.implications.items}
        onChange={(items) => set({ implications: { ...a.implications, items } })}
        max={6}
        disabled={disabled}
        make={() => ({ asset: 'Asset', icon: 'stocks' as const, shows: 'What the evidence shows.', showsEvidence: 'context' as const, couldMean: 'What it could mean.' })}
        render={(it, setI) => (
          <div className="grid gap-2 sm:grid-cols-3">
            <TextField label="Asset" value={it.asset} onChange={(asset) => setI({ ...it, asset })} disabled={disabled} />
            <SelectField label="Icon" value={it.icon} options={ICONS} onChange={(icon) => setI({ ...it, icon })} disabled={disabled} />
            <SelectField label="Evidence for “what we see”" value={it.showsEvidence} options={EVIDENCE} onChange={(showsEvidence) => setI({ ...it, showsEvidence })} disabled={disabled} />
            <div className="sm:col-span-3 grid gap-2 sm:grid-cols-2">
              <TextField label="What we see" value={it.shows} onChange={(shows) => setI({ ...it, shows })} rows={3} ctx={ctx} disabled={disabled} />
              <TextField label="What it could mean" value={it.couldMean} onChange={(couldMean) => setI({ ...it, couldMean })} rows={3} ctx={ctx} disabled={disabled} />
            </div>
          </div>
        )}
      />
    </div>
  );
}

export function OutlookEditor({ value: o, onChange, ctx, disabled }: Props<'outlook'>) {
  const set = (p: Partial<A['outlook']>) => onChange({ ...o, ...p });
  return (
    <div className="space-y-5">
      <AttentionEditor attention={o.attention} onChange={(attention) => set({ attention })} disabled={disabled} />
      <TextField label="Title" value={o.title} onChange={(title) => set({ title })} disabled={disabled} />
      <TextField label="Intro" value={o.intro} onChange={(intro) => set({ intro })} rows={3} ctx={ctx} disabled={disabled} />
      <TextField label="Disclaimer" value={o.disclaimer} onChange={(disclaimer) => set({ disclaimer })} rows={2} disabled={disabled} />
      <ListEditor
        title="Scenarios"
        items={o.scenarios}
        onChange={(scenarios) => set({ scenarios })}
        max={4}
        disabled={disabled}
        addLabel="Add scenario"
        make={() => ({ key: `s${o.scenarios.length + 1}`, name: 'Scenario', role: 'alternative' as const, summary: 'Summary.', conditions: ['Condition'], whyItMatters: 'Why it matters.', assets: [{ asset: 'Asset', effect: 'Effect' }], watch: ['Indicator'], uncertainties: ['Uncertainty'] })}
        render={(s, setS) => (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
              <TextField label="Name" value={s.name} onChange={(name) => setS({ ...s, name })} disabled={disabled} />
              <SelectField label="Role" value={s.role} options={[['central', 'Central case'], ['alternative', 'Alternative']]} onChange={(role) => setS({ ...s, role })} disabled={disabled} />
            </div>
            <TextField label="Summary" value={s.summary} onChange={(summary) => setS({ ...s, summary })} rows={2} ctx={ctx} disabled={disabled} />
            <StringList title="What would cause it" items={s.conditions} onChange={(conditions) => setS({ ...s, conditions })} min={1} ctx={ctx} disabled={disabled} />
            <TextField label="Why it matters" value={s.whyItMatters} onChange={(whyItMatters) => setS({ ...s, whyItMatters })} rows={2} ctx={ctx} disabled={disabled} />
            <ListEditor
              title="Assets affected"
              items={s.assets}
              onChange={(assets) => setS({ ...s, assets })}
              min={1}
              max={6}
              disabled={disabled}
              make={() => ({ asset: 'Asset', effect: 'Effect' })}
              render={(x, setX) => (
                <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                  <TextField label="Asset" value={x.asset} onChange={(asset) => setX({ ...x, asset })} disabled={disabled} />
                  <TextField label="Effect" value={x.effect} onChange={(effect) => setX({ ...x, effect })} ctx={ctx} disabled={disabled} />
                </div>
              )}
            />
            <StringList title="Signposts to watch" items={s.watch} onChange={(watch) => setS({ ...s, watch })} min={1} ctx={ctx} disabled={disabled} />
            <StringList title="Key uncertainties" items={s.uncertainties} onChange={(uncertainties) => setS({ ...s, uncertainties })} min={1} max={5} ctx={ctx} disabled={disabled} />
          </div>
        )}
      />
    </div>
  );
}
