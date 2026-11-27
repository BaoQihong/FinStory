import Link from 'next/link';
import { Suspense } from 'react';
import { requireEditor } from '@/lib/studio/auth';

export const metadata = { title: 'API usage' };

type Row = {
  article_id: string | null;
  service: string;
  key_fingerprint: string;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  credits: number;
  calls: number;
  created_at: string;
};

const SERVICE: Record<string, { name: string; unit: string; pricing: string }> = {
  arli: { name: 'Arli AI (LLM)', unit: 'tokens', pricing: 'Subscription plan — billed by plan, not per token; tokens shown for capacity tracking.' },
  tavily: { name: 'Tavily (web search)', unit: 'credits', pricing: '1,000 free credits/month; pay-as-you-go ≈ $0.008/credit beyond that.' },
  fred: { name: 'FRED API', unit: 'calls', pricing: 'Free (rate limit 120 requests/minute).' },
  tiingo: { name: 'Tiingo', unit: 'calls', pricing: 'Free tier (1,000 requests/day, internal use only).' },
  eia: { name: 'EIA Open Data', unit: 'calls', pricing: 'Free.' },
};
/** ISO timestamp N days before the request (server component renders per request). */
const daysAgoIso = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const n = (v: number) => Math.round(v).toLocaleString('en-US');

export default function UsagePage() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <p className="kicker text-gold-700">Seshat studio</p>
      <h1 className="mt-1 font-display text-4xl font-semibold text-navy-900">API usage</h1>
      <p className="mt-2 max-w-3xl text-ink-soft">
        Every generation stage records what it consumed, per service and per API key. Keys are identified by a fingerprint (the first 12 characters of their SHA-256
        hash) — the keys themselves are never stored here. History is kept when drafts are deleted.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">Loading usage…</p>}>
        <Usage />
      </Suspense>
    </div>
  );
}

async function Usage() {
  const { db } = await requireEditor();
  const [{ data: rows }, { data: arts }] = await Promise.all([
    db.from('api_usage').select('article_id, service, key_fingerprint, model, prompt_tokens, completion_tokens, credits, calls, created_at').order('created_at', { ascending: false }).limit(5000),
    db.from('articles').select('id, working_title, is_temporary'),
  ]);
  const usage = (rows ?? []) as Row[];
  if (!usage.length) return <p className="studio-card mt-8 p-6 text-ink-soft">No usage recorded yet.</p>;
  const since30 = daysAgoIso(30);

  type Agg = { service: string; fp: string; models: Set<string>; calls: number; pt: number; ct: number; credits: number; calls30: number; pt30: number; ct30: number; credits30: number; drafts: Set<string> };
  const byKey = new Map<string, Agg>();
  for (const r of usage) {
    const k = `${r.service}|${r.key_fingerprint}`;
    const a = byKey.get(k) ?? { service: r.service, fp: r.key_fingerprint, models: new Set(), calls: 0, pt: 0, ct: 0, credits: 0, calls30: 0, pt30: 0, ct30: 0, credits30: 0, drafts: new Set() };
    if (r.model) a.models.add(r.model);
    a.calls += r.calls;
    a.pt += r.prompt_tokens;
    a.ct += r.completion_tokens;
    a.credits += Number(r.credits);
    if (r.created_at >= since30) {
      a.calls30 += r.calls;
      a.pt30 += r.prompt_tokens;
      a.ct30 += r.completion_tokens;
      a.credits30 += Number(r.credits);
    }
    if (r.article_id) a.drafts.add(r.article_id);
    byKey.set(k, a);
  }
  const titles = new Map((arts ?? []).map((a) => [a.id as string, { title: a.working_title as string, temp: a.is_temporary as boolean }]));
  const perDraft = new Map<string, { arli: number; tavily: number; data: number }>();
  for (const r of usage) {
    const id = r.article_id ?? 'deleted';
    const d = perDraft.get(id) ?? { arli: 0, tavily: 0, data: 0 };
    if (r.service === 'arli') d.arli += r.prompt_tokens + r.completion_tokens;
    else if (r.service === 'tavily') d.tavily += Number(r.credits);
    else d.data += r.calls;
    perDraft.set(id, d);
  }

  return (
    <>
      <section className="mt-8">
        <h2 className="font-display text-2xl font-semibold text-navy-900">By service and key</h2>
        <div className="studio-card mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted">
              <tr className="border-b border-cream-300">
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Key fingerprint</th>
                <th className="px-4 py-3 text-right">Calls</th>
                <th className="px-4 py-3 text-right">Tokens in / out</th>
                <th className="px-4 py-3 text-right">Search credits</th>
                <th className="px-4 py-3 text-right">Last 30 days</th>
                <th className="px-4 py-3 text-right">Drafts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-300 tabular-nums">
              {[...byKey.values()].map((a) => (
                <tr key={a.service + a.fp} className="align-top">
                  <td className="px-4 py-3">
                    <span className="font-semibold text-ink">{SERVICE[a.service]?.name ?? a.service}</span>
                    {a.models.size ? <span className="block text-xs text-muted">{[...a.models].join(', ')}</span> : null}
                    <span className="block max-w-xs text-xs text-muted">{SERVICE[a.service]?.pricing}</span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs">{a.fp}</code>
                  </td>
                  <td className="px-4 py-3 text-right">{n(a.calls)}</td>
                  <td className="px-4 py-3 text-right">{a.service === 'arli' ? `${n(a.pt)} / ${n(a.ct)}` : '—'}</td>
                  <td className="px-4 py-3 text-right">{a.service === 'tavily' ? n(a.credits) : '—'}</td>
                  <td className="px-4 py-3 text-right text-xs text-ink-soft">
                    {a.service === 'arli' ? `${n(a.pt30 + a.ct30)} tokens` : a.service === 'tavily' ? `${n(a.credits30)} credits` : `${n(a.calls30)} calls`}
                  </td>
                  <td className="px-4 py-3 text-right">{a.drafts.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-semibold text-navy-900">By draft</h2>
        <div className="studio-card mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted">
              <tr className="border-b border-cream-300">
                <th className="px-4 py-3">Draft</th>
                <th className="px-4 py-3 text-right">Arli tokens</th>
                <th className="px-4 py-3 text-right">Tavily credits</th>
                <th className="px-4 py-3 text-right">Data API calls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-300 tabular-nums">
              {[...perDraft.entries()].map(([id, d]) => {
                const t = titles.get(id);
                return (
                  <tr key={id}>
                    <td className="px-4 py-3">
                      {t ? (
                        <Link href={`/admin/drafts/${id}`} className="font-semibold text-navy-800 underline decoration-gold-500 underline-offset-2">
                          {t.title}
                        </Link>
                      ) : (
                        <span className="text-muted">Deleted draft</span>
                      )}
                      {t?.temp ? <span className="ml-2 rounded-full bg-cream-200 px-2 py-0.5 text-xs font-semibold text-ink-soft">Temporary</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right">{n(d.arli)}</td>
                    <td className="px-4 py-3 text-right">{n(d.tavily)}</td>
                    <td className="px-4 py-3 text-right">{n(d.data)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
