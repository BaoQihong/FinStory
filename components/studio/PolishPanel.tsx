'use client';

// Editorial Polish review (Phase 3B.2). Proposes revised prose for one
// section; the editor compares each field, chooses what to accept, and only
// then is anything saved — as a new editor revision of the working draft.
// Never publishes. A proposal is bound to the revision it was made from.
import { useState, useTransition } from 'react';
import { applyPolish, proposePolish, type ApplyResult, type ProposeResult } from '@/app/admin/polish-actions';
import { SECTION_LABELS, type SectionId, type SeshatArticle, type ValidationIssue } from '@/lib/studio/schema';
import { resolveTokensSafe, type TokenContext } from '@/lib/content/tokens';

type Proposal = Extract<ProposeResult, { ok: true }>;

export function PolishPanel(props: {
  articleId: string;
  revision: number;
  section: SectionId;
  dirty: boolean;
  generating: boolean;
  ctx: TokenContext;
  onApplied: (r: { revision: number; status: string; issues: ValidationIssue[]; content: SeshatArticle; message: string }) => void;
}) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const label = SECTION_LABELS[props.section];
  const stale = !!proposal && (proposal.baseRevision !== props.revision || props.dirty);
  const lock = props.generating ? 'Generation is running.' : props.dirty ? 'Save your edits first — Polish works on the latest saved revision.' : null;

  const propose = () =>
    start(async () => {
      setError(null);
      setInfo(null);
      setProposal(null);
      const r = await proposePolish({ articleId: props.articleId, expectedRevision: props.revision, section: props.section });
      if (!r.ok) return setError(r.error);
      if (!r.items.length) {
        setInfo(`No changes proposed for ${label}.${r.concerns.length ? ' See the editor’s notes below.' : ''}`);
        if (r.concerns.length) setProposal(r);
        return;
      }
      setProposal(r);
      // Clean revisions start selected; anything flagged starts unselected so the editor opts in deliberately.
      setChosen(Object.fromEntries(r.items.map((i) => [i.path, i.check.status === 'ok'])));
    });

  const accept = () =>
    start(async () => {
      if (!proposal) return;
      const accepted = proposal.items.filter((i) => chosen[i.path] && i.check.status !== 'rejected').map((i) => ({ path: i.path, before: i.before, after: i.after, acknowledged: i.check.status === 'flagged' }));
      if (!accepted.length) return setError('Select at least one revision to accept, or discard the proposal.');
      const r: ApplyResult = await applyPolish({ articleId: props.articleId, baseRevision: proposal.baseRevision, section: props.section, accepted, proposed: proposal.items.length, styleGuideVersion: proposal.styleGuideVersion });
      if (!r.ok) return setError(r.error);
      setProposal(null);
      props.onApplied({ ...r, message: `Editorial Polish: accepted ${r.applied} revision(s) in ${label}; saved as revision ${r.revision}. Not published — readers see the live publication until you republish.` });
    });

  const discard = () => {
    setProposal(null);
    setError(null);
    setInfo(null);
  };
  const t = (s: string) => resolveTokensSafe(s, props.ctx);

  return (
    <section aria-label="Editorial Polish" className="studio-card mb-6 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Editorial Polish</span>
        <span className="text-xs text-ink-soft">Proposes a line edit of this section’s prose for you to review. Figures, charts, sources, scenario conditions and titles are not touched; nothing is saved until you accept.</span>
        <span className="ml-auto flex gap-2">
          {proposal?.items.length ? (
            <>
              <button type="button" className="studio-btn" onClick={discard} disabled={pending}>
                Discard
              </button>
              <button type="button" className="studio-btn-primary" onClick={accept} disabled={pending || stale || !Object.values(chosen).some(Boolean)}>
                {pending ? 'Saving…' : `Accept selected (${proposal.items.filter((i) => chosen[i.path]).length})`}
              </button>
            </>
          ) : (
            <button type="button" className="studio-btn" onClick={propose} disabled={pending || !!lock} title={lock ?? undefined}>
              {pending ? `Polishing ${label}… (up to 2 min)` : `Polish ${label}…`}
            </button>
          )}
        </span>
      </div>
      {lock && !proposal ? <p className="mt-2 text-xs text-muted">{lock}</p> : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[#9a3412]">
          {error}
        </p>
      ) : null}
      {info ? <p className="mt-2 text-sm text-ink-soft">{info}</p> : null}
      {stale ? <p className="mt-2 text-sm text-[#9a3412]">The draft has changed since this proposal was made (or has unsaved edits). It can no longer be accepted — discard it and polish again.</p> : null}

      {proposal ? (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-muted">
            Proposal for revision {proposal.baseRevision} · {proposal.items.length} field(s) changed{proposal.discarded ? ` · ${proposal.discarded} unusable suggestion(s) ignored` : ''} · {proposal.usage.promptTokens + proposal.usage.completionTokens} tokens, {proposal.usage.seconds}s · style guide {proposal.styleGuideVersion}
          </p>
          {proposal.concerns.length ? (
            <div role="note" className="rounded-lg border border-gold-500/50 bg-[#fbf1dc] px-3 py-2 text-sm">
              <p className="font-semibold text-ink">Editor’s notes (not applied — check these yourself)</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">
                {proposal.concerns.map((c, i) => (
                  <li key={i}>
                    <span className="font-semibold">{c.label}:</span> {c.concern}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {proposal.items.map((i) => {
            const tone = i.check.status === 'rejected' ? 'border-[#c2410c]/50' : i.check.status === 'flagged' ? 'border-gold-500/70' : 'border-cream-300';
            return (
              <div key={i.path} className={`rounded-lg border ${tone} bg-white/60 p-3`}>
                <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <input type="checkbox" checked={!!chosen[i.path]} disabled={i.check.status === 'rejected' || stale} onChange={(e) => setChosen((c) => ({ ...c, [i.path]: e.target.checked }))} />
                  {i.label}
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${i.check.status === 'ok' ? 'bg-[#e3f1ec] text-ev-documented' : i.check.status === 'flagged' ? 'bg-[#fbf1dc] text-gold-700' : 'bg-[#fff4ec] text-[#9a3412]'}`}>
                    {i.check.status === 'ok' ? 'Wording only' : i.check.status === 'flagged' ? 'Review: possible change of substance' : 'Cannot be accepted'}
                  </span>
                </label>
                {i.check.reasons.length ? (
                  <ul className="mt-1.5 list-disc pl-5 text-xs text-ink-soft">
                    {i.check.reasons.map((r, k) => (
                      <li key={k} className={r.severity === 'check' ? '' : 'font-semibold'}>
                        {r.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Current</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">{t(i.before)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Proposed</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-ink">{t(i.after)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
