'use client';

import { useActionState, useState, useTransition } from 'react';
import { createStory, developBrief, type FormState } from '@/app/admin/actions';
import { SUGGESTED_FIELDS, mergeSuggestion, type BriefSuggestion, type SuggestedField } from '@/lib/studio/brief';

type Origin = 'empty' | 'suggested' | 'edited';
type Field = { name: string; label: string; hint: string; rows?: number; placeholder?: string };

// Suggested by "Develop Editorial Brief" (all editable, all optional).
const SUGGESTED: Record<SuggestedField, Field> = {
  angle: { name: 'angle', label: 'Editorial angle', hint: 'The central tension or question the piece should investigate.', rows: 3 },
  questions: { name: 'questions', label: 'Questions to investigate', hint: 'One per line.', rows: 5 },
  indicators: { name: 'indicators', label: 'Markets and indicators', hint: 'One per line. Research suggestions — the engine finds and verifies the actual data.', rows: 4 },
  outlook: { name: 'outlook', label: 'Outlook focus', hint: 'What could happen next, and what could reverse the story.', rows: 3 },
  premise: { name: 'premise', label: 'Premise to verify', hint: 'Assumptions in your prompt that the research must establish first — a hypothesis, not a finding.', rows: 3 },
};
// Written by the editor only.
const OTHER: Field[] = [
  { name: 'argument', label: 'Your argument', hint: 'Optional. What you think is going on and want the piece to argue — in your own words. Seshat keeps it as the spine of the article and tells you plainly if the evidence contradicts it.', rows: 3 },
  { name: 'voice', label: 'Tone and voice', hint: 'Optional. e.g. “dry and sceptical, short sentences, no jargon”. You can paste a short sample of your own writing; Seshat matches its register, never copies it.', rows: 3 },
  { name: 'headline', label: 'Proposed headline', hint: 'A working headline, if you have one in mind.' },
  { name: 'audience', label: 'Intended audience', hint: 'e.g. “US retail investors with some market knowledge”.' },
  { name: 'assets', label: 'Asset classes or securities', hint: 'e.g. “Japanese equities, US Treasuries, EWJ”. Tickers are looked up automatically.' },
  { name: 'instructions', label: 'Additional instructions', hint: 'Anything else the research should consider.', rows: 3 },
];

const EMPTY: BriefSuggestion = { angle: '', questions: '', indicators: '', outlook: '', premise: '' };
const EMPTY_ORIGIN: Record<SuggestedField, Origin> = { angle: 'empty', questions: 'empty', indicators: 'empty', outlook: 'empty', premise: 'empty' };

export function NewStoryForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createStory, undefined);
  const [prompt, setPrompt] = useState('');
  const [brief, setBrief] = useState<BriefSuggestion>(EMPTY);
  const [origin, setOrigin] = useState(EMPTY_ORIGIN);
  const [other, setOther] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [briefPrompt, setBriefPrompt] = useState<string | null>(null);
  const [working, setWorking] = useState<'all' | SuggestedField | null>(null);
  const [briefError, setBriefError] = useState('');
  const [, startTransition] = useTransition();

  const developing = working !== null;
  const busy = pending || disabled;
  const developed = briefPrompt !== null;
  const edited = SUGGESTED_FIELDS.filter((k) => origin[k] === 'edited');
  const promptReady = prompt.trim().length >= 20;
  const guidanceErrors = Object.keys(state?.fieldErrors ?? {}).some((k) => k !== 'prompt');

  /** `only` = one field the editor explicitly asked to regenerate; otherwise every field the editor has not edited. */
  function run(only?: SuggestedField) {
    const replace = only ? [only] : SUGGESTED_FIELDS.filter((k) => origin[k] !== 'edited');
    if (!replace.length) {
      setBriefError('You have edited every suggestion, so there is nothing to regenerate. Use “Suggest again” on a field to replace it.');
      return;
    }
    setBriefError('');
    setWorking(only ?? 'all');
    const context: Record<string, string> = { ...other };
    for (const k of SUGGESTED_FIELDS) if (!replace.includes(k) && brief[k]) context[k] = brief[k];
    startTransition(async () => {
      const r = await developBrief({ prompt, context });
      setWorking(null);
      if (!r.ok) return setBriefError(r.error);
      setBrief((b) => mergeSuggestion(b, r.fields, replace));
      setOrigin((o) => {
        const n = { ...o };
        for (const k of replace) n[k] = r.fields[k] ? 'suggested' : 'empty';
        return n;
      });
      setBriefPrompt(prompt.trim());
      setOpen(true);
    });
  }

  const setField = (k: SuggestedField, v: string) => {
    setBrief((b) => ({ ...b, [k]: v }));
    setOrigin((o) => ({ ...o, [k]: v || o[k] !== 'empty' ? 'edited' : 'empty' }));
  };

  return (
    <form action={action} className="mt-8 space-y-6">
      <label className="block">
        <span className="font-display text-xl font-semibold text-navy-900">Story prompt</span>
        <span className="mt-1 block text-sm text-muted">The only required field. No URLs, data series or chart instructions needed.</span>
        <textarea
          name="prompt"
          required
          minLength={20}
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="studio-input mt-3"
          placeholder="Why are Japanese stocks performing so well despite Japan's economic problems?"
        />
        {state?.fieldErrors?.prompt ? <span className="mt-1 block text-sm text-[#9a3412]">{state.fieldErrors.prompt}</span> : null}
      </label>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" className="studio-btn" disabled={busy || developing || !promptReady} onClick={() => run()}>
          {working === 'all' ? 'Developing brief…' : developed ? 'Regenerate suggestions' : 'Develop Editorial Brief'}
        </button>
        <span className="text-xs text-muted">
          {working === 'all'
            ? 'Interpreting your idea — usually under a minute. No research runs yet.'
            : developed
              ? edited.length
                ? `Fields you edited (${edited.length}) are kept.`
                : 'Replaces the suggestions; anything you edit is kept.'
              : 'Optional. Seshat suggests an angle, questions, indicators, an outlook focus and the premise to verify — you review them before any research runs.'}
        </span>
      </div>
      {developed && briefPrompt !== prompt.trim() && !developing ? (
        <p className="text-xs text-ink-soft">The prompt has changed since these suggestions were made — regenerate to refresh them.</p>
      ) : null}
      {briefError ? (
        <p role="alert" className="text-sm text-[#9a3412]">
          {briefError}
        </p>
      ) : null}

      <details className="studio-card group p-5" open={open || guidanceErrors} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="flex items-center justify-between gap-3 text-sm font-semibold text-navy-800">
          <span>
            {developed ? 'Editorial brief' : 'Optional guidance'}
            {developed ? <span className="ml-2 text-xs font-normal text-muted">Suggestions — edit, clear or keep any of them</span> : null}
          </span>
          <svg viewBox="0 0 12 12" className="chev h-3 w-3 shrink-0 transition-transform" aria-hidden="true">
            <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </summary>
        <div className="mt-5 space-y-5">
          {SUGGESTED_FIELDS.map((k) => {
            const f = SUGGESTED[k];
            const premise = k === 'premise';
            const regenerating = working === k || (working === 'all' && origin[k] !== 'edited');
            return (
              <div key={k} className={premise && brief.premise ? 'rounded-lg border border-dashed border-gold-500/60 bg-cream-50 p-3' : undefined}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <label htmlFor={`brief-${k}`} className="text-sm font-semibold text-ink">
                    {f.label}
                  </label>
                  <OriginTag origin={origin[k]} working={regenerating} />
                  <span className="ml-auto flex gap-1 text-xs">
                    {developed ? (
                      <button type="button" className="studio-btn-quiet" disabled={busy || developing || !promptReady} onClick={() => run(k)} title="Replace this field with a new suggestion">
                        Suggest again
                      </button>
                    ) : null}
                    {brief[k] ? (
                      <button type="button" className="studio-btn-quiet" disabled={developing} onClick={() => setField(k, '')}>
                        Clear
                      </button>
                    ) : null}
                  </span>
                </div>
                <span className="block text-xs text-muted">{f.hint}</span>
                <textarea id={`brief-${k}`} name={f.name} rows={f.rows} value={brief[k]} readOnly={regenerating} onChange={(e) => setField(k, e.target.value)} className="studio-input mt-1.5" />
                {state?.fieldErrors?.[k] ? <span className="mt-1 block text-sm text-[#9a3412]">{state.fieldErrors[k]}</span> : null}
              </div>
            );
          })}

          <div className="border-t border-cream-300 pt-5">
            <p className="studio-label">Your own guidance</p>
            <div className="mt-3 space-y-5">
              {OTHER.map((f) => (
                <label key={f.name} className="block">
                  <span className="text-sm font-semibold text-ink">{f.label}</span>
                  <span className="block text-xs text-muted">{f.hint}</span>
                  {f.rows ? (
                    <textarea name={f.name} rows={f.rows} value={other[f.name] ?? ''} onChange={(e) => setOther((o) => ({ ...o, [f.name]: e.target.value }))} className="studio-input mt-1.5" />
                  ) : (
                    <input name={f.name} value={other[f.name] ?? ''} onChange={(e) => setOther((o) => ({ ...o, [f.name]: e.target.value }))} className="studio-input mt-1.5" />
                  )}
                  {state?.fieldErrors?.[f.name] ? <span className="mt-1 block text-sm text-[#9a3412]">{state.fieldErrors[f.name]}</span> : null}
                </label>
              ))}
            </div>
          </div>
        </div>
      </details>

      {state?.error ? (
        <p role="alert" className="text-sm text-[#9a3412]">
          {state.error}
        </p>
      ) : null}
      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy || developing} className="studio-btn-primary px-5 py-2.5 text-base">
          {pending ? 'Starting…' : 'Research & Generate'}
        </button>
        <span className="text-xs text-muted">Typically 5–10 minutes. You can leave this page; progress resumes when you return.</span>
      </div>
    </form>
  );
}

function OriginTag({ origin, working }: { origin: Origin; working: boolean }) {
  if (working) return <span className="text-xs text-muted">suggesting…</span>;
  if (origin === 'suggested') return <span className="rounded-full bg-cream-200 px-2 py-0.5 text-[0.7rem] font-semibold text-ink-soft">Suggested</span>;
  if (origin === 'edited') return <span className="rounded-full bg-[#e3f1ec] px-2 py-0.5 text-[0.7rem] font-semibold text-ev-documented">Edited — kept</span>;
  return null;
}
