'use client';

import { useActionState } from 'react';
import { createStory, type FormState } from '@/app/admin/actions';

const OPTIONAL: { name: string; label: string; hint: string; rows?: number }[] = [
  { name: 'headline', label: 'Proposed headline', hint: 'A working headline, if you have one in mind.' },
  { name: 'audience', label: 'Intended audience', hint: 'e.g. “US retail investors with some market knowledge”.' },
  { name: 'angle', label: 'Editorial angle', hint: 'The argument or perspective you want the piece to take.', rows: 2 },
  { name: 'questions', label: 'Questions to investigate', hint: 'One per line.', rows: 3 },
  { name: 'assets', label: 'Relevant asset classes or securities', hint: 'e.g. “Japanese equities, US Treasuries, EWJ”. Tickers are looked up automatically.' },
  { name: 'instructions', label: 'Additional research instructions', hint: 'Anything else the research should consider.', rows: 3 },
];

export function NewStoryForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createStory, undefined);
  const busy = pending || disabled;
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
          className="studio-input mt-3"
          placeholder="Why is the Japanese yen weakening, and how could that affect American investors? Explore monetary policy, interest-rate differentials and potential implications for equities."
        />
        {state?.fieldErrors?.prompt ? <span className="mt-1 block text-sm text-[#9a3412]">{state.fieldErrors.prompt}</span> : null}
      </label>

      <details className="studio-card group p-5">
        <summary className="flex items-center justify-between text-sm font-semibold text-navy-800">
          Optional guidance
          <svg viewBox="0 0 12 12" className="chev h-3 w-3 transition-transform" aria-hidden="true">
            <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </summary>
        <div className="mt-5 space-y-5">
          {OPTIONAL.map((f) => (
            <label key={f.name} className="block">
              <span className="text-sm font-semibold text-ink">{f.label}</span>
              <span className="block text-xs text-muted">{f.hint}</span>
              {f.rows ? <textarea name={f.name} rows={f.rows} className="studio-input mt-1.5" /> : <input name={f.name} className="studio-input mt-1.5" />}
              {state?.fieldErrors?.[f.name] ? <span className="mt-1 block text-sm text-[#9a3412]">{state.fieldErrors[f.name]}</span> : null}
            </label>
          ))}
        </div>
      </details>

      {state?.error ? (
        <p role="alert" className="text-sm text-[#9a3412]">
          {state.error}
        </p>
      ) : null}
      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy} className="studio-btn-primary px-5 py-2.5 text-base">
          {pending ? 'Starting…' : 'Research & Generate'}
        </button>
        <span className="text-xs text-muted">Typically 5–10 minutes. You can leave this page; progress resumes when you return.</span>
      </div>
    </form>
  );
}
