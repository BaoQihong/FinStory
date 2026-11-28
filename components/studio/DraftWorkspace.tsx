'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { saveDraft } from '@/app/admin/actions';
import type { JobView } from '@/lib/studio/job-view';
import { SECTION_LABELS, SECTION_ORDER, type SeshatArticle, type StoryBrief, type ValidationIssue } from '@/lib/studio/schema';
import type { TokenContext } from '@/lib/content/tokens';
import type { ChartData, IndicatorCard as Card } from '@/lib/data/display';
import { ChartFigure } from '@/components/charts/ChartFigure';
import { GenerationPanel } from './GenerationPanel';
import { AnalyticsEditor, MacroEditor, OutlookEditor, StoryEditor } from './SectionEditors';
import { FactPalette } from './fields';
import { StatusBadge } from './StatusBadge';
import { PublicationBadge, PublishPanel, type PublicationView } from './PublishPanel';
import { PolishPanel } from './PolishPanel';
import { DeleteDraftPanel } from './DeleteDraftPanel';

export type SourceView = { ref: string; url: string; title: string; publisher: string; source_type: string; published_at: string | null; stale: boolean; query: string; snippet: string | null };
export type FindingView = { ref: string; claim: string; evidence_kind: string; source_refs: string[]; quote: string | null; quote_verified: boolean };
export type PublicationEntry = { revision: number; source_revision: number; slug: string; note: string | null; published_by_name: string; published_at: string };
export type DatasetMeta = { key: string; provider: string; series_id: string; name: string; units: string; frequency: string; seasonal_adjustment: string | null; definition: string | null; source_url: string; retrieved_at: string; observation_start: string | null; observation_end: string | null; transformations: string[] };

type Tab = (typeof SECTION_ORDER)[number] | 'research' | 'data' | 'checks' | 'history';

export function DraftWorkspace(props: {
  articleId: string;
  title: string;
  temporary?: boolean;
  status: string;
  revision: number;
  brief: StoryBrief;
  content: SeshatArticle | null;
  job: JobView | null;
  sources: SourceView[];
  findings: FindingView[];
  datasets: DatasetMeta[];
  revisions: { revision: number; origin: string; note: string | null; created_at: string }[];
  publication: PublicationView;
  publications: PublicationEntry[];
}) {
  const [draft, setDraft] = useState(props.content);
  const [revision, setRevision] = useState(props.revision);
  const [status, setStatus] = useState(props.status);
  const [issues, setIssues] = useState<ValidationIssue[]>(props.content?.validation.issues ?? []);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [tab, setTab] = useState<Tab>('story');
  const [saving, startSave] = useTransition();
  const generating = !!props.job && (props.job.status === 'queued' || props.job.status === 'running');

  // Fresh server data (e.g. generation finished) remounts this component via its key.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const ctx: TokenContext | null = useMemo(() => (draft ? { facts: draft.data.facts as TokenContext['facts'], dates: draft.data.dates as TokenContext['dates'] } : null), [draft]);
  const charts = useMemo(() => (draft ? Object.values(draft.data.charts as Record<string, ChartData>).map((c) => ({ id: c.id, label: `${c.id} — ${c.series.map((s) => s.label).join(' vs ')}` })) : []), [draft]);
  const indicators = useMemo(() => (draft ? (draft.data.indicators as Card[]).map((c) => ({ key: c.key, label: c.label })) : []), [draft]);

  const update = <K extends keyof SeshatArticle>(k: K, v: SeshatArticle[K]) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
    setDirty(true);
    setMessage(null);
  };
  const save = () =>
    startSave(async () => {
      if (!draft) return;
      const r = await saveDraft(props.articleId, revision, draft);
      if (r.ok) {
        setRevision(r.revision);
        setStatus(r.status);
        setIssues(r.issues);
        setDirty(false);
        const errs = r.issues.filter((i) => i.level === 'error').length;
        const warns = r.issues.filter((i) => i.level === 'warning').length;
        setMessage({ kind: 'ok', text: `Saved as revision ${r.revision}.${errs || warns ? ` ${errs} error(s), ${warns} warning(s) — see Checks.` : ' All checks pass.'}` });
      } else {
        setMessage({ kind: 'error', text: r.error });
        if (r.issues) setIssues(r.issues);
      }
    });

  const sectionAttention = (s: (typeof SECTION_ORDER)[number]) => draft?.[s].attention.required;
  const tabs: [Tab, string, boolean?][] = [
    ...SECTION_ORDER.map((s, i) => [s, `${i + 1}. ${SECTION_LABELS[s]}`, sectionAttention(s)] as [Tab, string, boolean?]),
    ['research', `Research (${props.sources.length})`],
    ['data', `Data (${props.datasets.length})`],
    ['checks', `Checks (${issues.filter((i) => i.level !== 'info').length})`],
    ['history', 'History'],
  ];

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <Link href="/admin" className="text-sm text-muted hover:text-ink">
            ← All drafts
          </Link>
          <h1 className="mt-1 font-display text-3xl font-semibold leading-tight text-navy-900 sm:text-4xl">{draft?.story.headline ?? props.title}</h1>
          <p className="mt-2 text-sm text-ink-soft">
            <span className="font-semibold">Prompt:</span> {props.brief.prompt}
          </p>
          <BriefDetails brief={props.brief} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {props.temporary ? <span className="rounded-full bg-cream-200 px-2.5 py-1 text-xs font-semibold text-ink-soft">Temporary</span> : null}
          <StatusBadge status={status} job={props.job ?? undefined} />
          <PublicationBadge state={props.publication.state} />
          <span className="text-xs text-muted">rev {revision}</span>
          {draft ? (
            <Link href={`/admin/drafts/${props.articleId}/preview`} className="studio-btn" aria-disabled={dirty} onClick={(e) => dirty && (e.preventDefault(), setMessage({ kind: 'error', text: 'Save your changes first — the preview shows the latest saved draft.' }))}>
              Preview
            </Link>
          ) : null}
          {draft ? (
            <button type="button" className="studio-btn-primary" disabled={!dirty || saving || generating} onClick={save}>
              {saving ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}
            </button>
          ) : null}
        </div>
      </div>
      {message ? (
        <p role="status" className={`mt-3 text-sm ${message.kind === 'ok' ? 'text-ev-documented' : 'text-[#9a3412]'}`}>
          {message.text}
        </p>
      ) : null}

      {draft ? (
        <PublishPanel
          articleId={props.articleId}
          revision={revision}
          dirty={dirty}
          generating={generating}
          pub={props.publication}
          onRepaired={(r) => {
            setDraft(r.content);
            setRevision(r.revision);
            setStatus(r.status);
            setIssues(r.issues);
            setDirty(false);
            setMessage({ kind: 'ok', text: `Fix It for Me saved revision ${r.revision}. Not published — readers see the live publication until you publish or republish.` });
          }}
        />
      ) : null}

      {props.job && (generating || props.job.status !== 'succeeded' || !draft) ? (
        <div className="mt-6">
          <GenerationPanel initial={props.job} />
        </div>
      ) : null}

      {draft && ctx ? (
        <>
          <div role="tablist" aria-label="Draft sections" className="mt-8 flex flex-wrap gap-1 border-b border-cream-300">
            {tabs.map(([k, label, flag]) => (
              <button
                key={k}
                role="tab"
                type="button"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`-mb-px rounded-t-lg border px-3.5 py-2 text-sm font-semibold ${tab === k ? 'border-cream-300 border-b-cream-100 bg-cream-100 text-navy-900' : 'border-transparent text-muted hover:text-ink'}`}
              >
                {label}
                {flag ? <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-[#c2410c]" aria-label="needs attention" /> : null}
              </button>
            ))}
          </div>
          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div role="tabpanel" className="min-w-0">
              {(SECTION_ORDER as readonly string[]).includes(tab) ? (
                <PolishPanel
                  key={tab}
                  articleId={props.articleId}
                  revision={revision}
                  section={tab as (typeof SECTION_ORDER)[number]}
                  dirty={dirty}
                  generating={generating}
                  ctx={ctx}
                  onApplied={(r) => {
                    setDraft(r.content);
                    setRevision(r.revision);
                    setStatus(r.status);
                    setIssues(r.issues);
                    setDirty(false);
                    setMessage({ kind: 'ok', text: r.message });
                  }}
                />
              ) : null}
              {tab === 'story' ? (
                <fieldset className="studio-card mb-6 grid gap-3 p-4 sm:grid-cols-2" disabled={generating}>
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">Byline (shown to readers)</legend>
                  <label className="block text-sm">
                    <span className="font-semibold text-ink">Author</span>
                    <input className="studio-input mt-1" maxLength={80} value={draft.meta.author.name} onChange={(e) => update('meta', { ...draft.meta, author: { ...draft.meta.author, name: e.target.value } })} />
                  </label>
                  <label className="block text-sm">
                    <span className="font-semibold text-ink">Role</span>
                    <input className="studio-input mt-1" maxLength={80} value={draft.meta.author.role} onChange={(e) => update('meta', { ...draft.meta, author: { ...draft.meta.author, role: e.target.value } })} />
                  </label>
                </fieldset>
              ) : null}
              {tab === 'story' ? <StoryEditor value={draft.story} onChange={(v) => update('story', v)} ctx={ctx} charts={charts} indicators={indicators} disabled={generating} /> : null}
              {tab === 'macro' ? <MacroEditor value={draft.macro} onChange={(v) => update('macro', v)} ctx={ctx} charts={charts} indicators={indicators} disabled={generating} /> : null}
              {tab === 'analytics' ? <AnalyticsEditor value={draft.analytics} onChange={(v) => update('analytics', v)} ctx={ctx} charts={charts} indicators={indicators} disabled={generating} /> : null}
              {tab === 'outlook' ? <OutlookEditor value={draft.outlook} onChange={(v) => update('outlook', v)} ctx={ctx} charts={charts} indicators={indicators} disabled={generating} /> : null}
              {tab === 'research' ? <ResearchPanel sources={props.sources} findings={props.findings} warnings={props.job?.warnings ?? []} gaps={draft.evidence.gaps ?? []} /> : null}
              {tab === 'data' ? <DataPanel datasets={props.datasets} draft={draft} /> : null}
              {tab === 'checks' ? <ChecksPanel issues={issues} claims={draft.validation.claims ?? []} /> : null}
              {tab === 'history' ? <HistoryPanel revisions={props.revisions} job={props.job} publications={props.publications} /> : null}
            </div>
            <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              <FactPalette ctx={ctx} />
            </aside>
          </div>
        </>
      ) : null}

      <DeleteDraftPanel
        articleId={props.articleId}
        title={draft?.story.headline ?? props.title}
        temporary={props.temporary}
        firstPublishedAt={props.publication.firstPublishedAt}
        isLive={props.publication.state === 'live' || props.publication.state === 'live_changed'}
        generating={generating}
        dirty={dirty}
        revisions={revision}
        hasResearch={!!props.job}
      />
    </div>
  );
}

type GapView = { need: string; reason: string; provider?: string; detail?: string };
function ResearchPanel({ sources, findings, warnings, gaps }: { sources: SourceView[]; findings: FindingView[]; warnings: { stage: string; message: string }[]; gaps: GapView[] }) {
  return (
    <div className="space-y-8">
      {gaps.length ? (
        <section>
          <h2 className="font-display text-2xl font-semibold text-navy-900">Missing evidence</h2>
          <p className="mt-1 text-sm text-muted">Evidence the research needed but could not obtain. Nothing was substituted for it.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {gaps.map((g, i) => (
              <li key={i} className="rounded-lg border border-[#c2410c]/30 bg-[#fff4ec] px-3 py-2">
                <span className="font-semibold text-ink">{g.need}</span>
                <span className="block text-xs text-ink-soft">
                  {g.reason === 'provider-unavailable' ? `Provider unavailable${g.provider ? ` (${g.provider})` : ''} — re-run later to fill` : g.reason === 'stale-data' ? 'Only stale data available' : 'No suitable public dataset found'}
                  {g.detail ? ` · ${g.detail}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h2 className="font-display text-2xl font-semibold text-navy-900">Findings</h2>
        <p className="mt-1 text-sm text-muted">The evidence package the draft was written from. “Quote verified” means the quoted text was found verbatim in the retrieved source.</p>
        <ul className="mt-4 space-y-3">
          {findings.map((f) => (
            <li key={f.ref} className="studio-card p-4 text-sm">
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-semibold">{f.ref}</span> · {f.evidence_kind} · {f.source_refs.join(', ') || 'data only'}
                {f.quote ? (f.quote_verified ? <span className="text-ev-documented">· quote verified</span> : <span className="text-[#9a3412]">· quote NOT found in source</span>) : null}
              </p>
              <p className="mt-1 text-ink">{f.claim}</p>
              {f.quote ? <p className="mt-1 border-l-2 border-cream-300 pl-3 text-xs italic text-ink-soft">“{f.quote}”</p> : null}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-display text-2xl font-semibold text-navy-900">Sources</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="py-2 pr-3">Ref</th>
                <th className="py-2 pr-3">Source</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Published</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-300">
              {sources.map((s) => (
                <tr key={s.ref} className="align-top">
                  <td className="py-2 pr-3 font-semibold">{s.ref}</td>
                  <td className="py-2 pr-3">
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-navy-800 underline decoration-gold-500 underline-offset-2">
                      {s.title}
                    </a>
                    <span className="block text-xs text-muted">
                      {s.publisher} · found by “{s.query}”
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs">{s.source_type}</td>
                  <td className="py-2 pr-3 text-xs">
                    {s.published_at ?? 'undated'}
                    {s.stale ? <span className="block text-[#9a3412]">stale</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {warnings.length ? (
        <section>
          <h2 className="font-display text-2xl font-semibold text-navy-900">Warnings & limitations</h2>
          <ul className="mt-3 space-y-1 text-sm text-ink-soft">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="text-xs font-semibold text-muted">[{w.stage}]</span> {w.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function DataPanel({ datasets, draft }: { datasets: DatasetMeta[]; draft: SeshatArticle }) {
  const charts = Object.values(draft.data.charts as Record<string, ChartData>);
  const used = new Set([...draft.story.blocks.flatMap((b) => (b.type === 'chart' ? [b.chartId] : [])), ...draft.macro.charts.map((c) => c.chartId), ...draft.analytics.charts.map((c) => c.chartId)]);
  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-2xl font-semibold text-navy-900">Datasets</h2>
        <p className="mt-1 text-sm text-muted">Retrieved by application code from the providers below. Observations are stored exactly as published; gaps are never filled.</p>
        <ul className="mt-4 space-y-3">
          {datasets.map((d) => (
            <li key={d.key} className="studio-card p-4 text-sm">
              <p className="font-semibold text-navy-900">
                {d.name} <code className="ml-1 text-xs font-normal text-muted">{`{${d.key}…}`}</code>
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                <a href={d.source_url} target="_blank" rel="noopener noreferrer" className="underline decoration-gold-500 underline-offset-2">
                  {d.provider.toUpperCase()} {d.series_id}
                </a>{' '}
                · {d.units} · {d.frequency}
                {d.seasonal_adjustment ? ` · ${d.seasonal_adjustment}` : ''} · {d.observation_start} → {d.observation_end} · retrieved {d.retrieved_at.slice(0, 16).replace('T', ' ')} UTC
              </p>
              {d.definition ? <p className="mt-1 text-xs text-muted">{d.definition}</p> : null}
              {d.transformations.length ? <p className="mt-1 text-xs text-muted">Transformations: {d.transformations.join(' ')}</p> : null}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-display text-2xl font-semibold text-navy-900">Proposed charts</h2>
        <p className="mt-1 text-sm text-muted">Add or remove charts from a section in its tab. Unused charts stay available here.</p>
        <div className="mt-4 space-y-6">
          {charts.map((c) => (
            <div key={c.id}>
              <p className="mb-2 text-xs font-semibold text-muted">
                {c.id} · {used.has(c.id) ? 'used in the draft' : 'not used'}
              </p>
              <ChartFigure data={c} question={c.series.map((s) => s.label).join(' vs ')} takeaway={c.notes.join(' ')} label="Chart data" />
            </div>
          ))}
          {!charts.length ? <p className="text-sm text-muted">No charts could be built from the retrieved data.</p> : null}
        </div>
      </section>
    </div>
  );
}

type ClaimView = { path: string; sentence: string; tokens: string[]; status: string; issues: { code: string; message: string; severity: string }[] };
function ClaimsLedger({ claims }: { claims: ClaimView[] }) {
  const flagged = claims.filter((c) => c.status === 'flagged');
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-semibold text-navy-900">Numerical claims</h2>
      <p className="mt-1 text-sm text-muted">
        {claims.length} sentence{claims.length === 1 ? '' : 's'} stating figures were checked against each figure&apos;s metadata (level vs change, period, unit and denominator, stock vs flow, forecast vs historical); {flagged.length} flagged.
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {flagged.map((c, i) => (
          <li key={i} className="rounded-lg border border-[#9f1239]/30 bg-[#fbe9e7] px-3 py-2">
            <span className="text-xs text-muted">{c.path}</span>
            <span className="block text-ink">“{c.sentence}”</span>
            <ul className="mt-1 list-disc pl-5 text-xs text-ink-soft">
              {c.issues.map((x, j) => (
                <li key={j}>{x.message}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <details className="group mt-3 text-sm">
        <summary className="inline-flex items-center gap-1 text-xs font-medium text-navy-700">Show all checked claims</summary>
        <ul className="mt-2 space-y-1 text-xs text-ink-soft">
          {claims.map((c, i) => (
            <li key={i}>
              <span className={c.status === 'ok' ? 'text-ev-documented' : 'text-[#9f1239]'}>{c.status === 'ok' ? '✓' : '!'}</span> {c.sentence}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function ChecksPanel({ issues, claims }: { issues: ValidationIssue[]; claims: ClaimView[] }) {
  const order = { error: 0, warning: 1, info: 2 };
  const sorted = [...issues].sort((a, b) => order[a.level] - order[b.level]);
  return (
    <>
    <section>
      <h2 className="font-display text-2xl font-semibold text-navy-900">Validation checks</h2>
      <p className="mt-1 text-sm text-muted">Run on generation and on every save: schema, the four-section storyboard, fact tokens, untokenized numbers, chart references and captions, evidence labels, data freshness.</p>
      {!sorted.length ? <p className="mt-4 rounded-lg bg-[#e3f1ec] px-3 py-2 text-sm text-ev-documented">All checks pass.</p> : null}
      <ul className="mt-4 space-y-2 text-sm">
        {sorted.map((i, n) => (
          <li key={n} className="flex gap-3 rounded-lg border border-cream-300 bg-cream-50 px-3 py-2">
            <span className={`w-16 shrink-0 text-xs font-semibold uppercase ${i.level === 'error' ? 'text-[#9f1239]' : i.level === 'warning' ? 'text-[#9a3412]' : 'text-muted'}`}>{i.level}</span>
            <span className="min-w-0">
              <span className="text-xs text-muted">
                {i.section}
                {i.path ? ` · ${i.path}` : ''}
              </span>
              <span className="block text-ink">{i.message}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
    <ClaimsLedger claims={claims} />
    </>
  );
}

function HistoryPanel({ revisions, job, publications }: { revisions: { revision: number; origin: string; note: string | null; created_at: string }[]; job: JobView | null; publications: PublicationEntry[] }) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold text-navy-900">Publications</h2>
        {publications.length ? (
          <ul className="mt-3 space-y-1 text-sm">
            {publications.map((p) => (
              <li key={p.revision} className="text-ink-soft">
                <span className="font-semibold text-ink">publication {p.revision}</span> · from draft rev {p.source_revision} · {p.published_at.slice(0, 16).replace('T', ' ')} UTC · {p.published_by_name}
                {p.note ? ` — ${p.note}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">Not published yet.</p>
        )}
        <p className="mt-2 text-xs text-muted">Every publication is kept as an immutable snapshot for traceability.</p>
      </div>
      <div>
        <h2 className="font-display text-2xl font-semibold text-navy-900">Revisions</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {revisions.map((r) => (
            <li key={r.revision} className="text-ink-soft">
              <span className="font-semibold text-ink">rev {r.revision}</span> · {r.origin === 'editor' ? 'editor' : 'generated'} · {r.created_at.slice(0, 16).replace('T', ' ')} UTC{r.note ? ` — ${r.note}` : ''}
            </li>
          ))}
        </ul>
      </div>
      {job ? (
        <div>
          <h2 className="font-display text-2xl font-semibold text-navy-900">Generation run</h2>
          <table className="mt-3 text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="py-1 pr-6">Stage</th>
                <th className="py-1 pr-6">Time</th>
                <th className="py-1 pr-6">Runs</th>
                <th className="py-1">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(job.metrics.perStage).map(([s, m]) => (
                <tr key={s}>
                  <td className="py-0.5 pr-6">{s}</td>
                  <td className="py-0.5 pr-6 tabular-nums">{(m.ms / 1000).toFixed(1)} s</td>
                  <td className="py-0.5 pr-6 tabular-nums">{m.runs}</td>
                  <td className="py-0.5 tabular-nums">{m.tokens.toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            Total {(job.metrics.ms / 1000).toFixed(0)} s of stage time · {job.metrics.promptTokens.toLocaleString('en-US')} prompt + {job.metrics.completionTokens.toLocaleString('en-US')} completion tokens · {job.metrics.searchCredits} search credits.
          </p>
        </div>
      ) : null}
    </section>
  );
}

const BRIEF_LABELS: [keyof StoryBrief, string][] = [
  ['argument', 'Your argument'],
  ['voice', 'Tone and voice'],
  ['headline', 'Proposed headline'],
  ['audience', 'Intended audience'],
  ['angle', 'Editorial angle'],
  ['questions', 'Questions to investigate'],
  ['indicators', 'Markets and indicators'],
  ['outlook', 'Outlook focus'],
  ['premise', 'Premise to verify'],
  ['assets', 'Asset classes or securities'],
  ['instructions', 'Additional instructions'],
];

function BriefDetails({ brief }: { brief: StoryBrief }) {
  const rows = BRIEF_LABELS.filter(([k]) => brief[k]);
  if (!rows.length) return null;
  return (
    <details className="mt-2 max-w-3xl text-sm text-ink-soft">
      <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-ink">Editorial brief ({rows.length} {rows.length === 1 ? 'field' : 'fields'})</summary>
      <dl className="mt-2 space-y-2 rounded-lg border border-cream-300 bg-white/60 p-3">
        {rows.map(([k, label]) => (
          <div key={k}>
            <dt className="text-xs font-semibold text-ink">{label}</dt>
            <dd className="whitespace-pre-line">{brief[k]}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
