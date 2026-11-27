import Link from 'next/link';
import { Suspense } from 'react';
import { requireEditor } from '@/lib/studio/auth';
import { StatusBadge } from '@/components/studio/StatusBadge';
import { fmtDayShort } from '@/lib/format';

export const metadata = { title: 'Drafts' };

export default function StudioHome() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker text-gold-700">Seshat studio</p>
          <h1 className="mt-1 font-display text-4xl font-semibold text-navy-900">Drafts</h1>
        </div>
        <Link href="/admin/new" className="studio-btn-primary">
          New story
        </Link>
      </div>
      <Suspense fallback={<p className="mt-10 text-muted">Loading drafts…</p>}>
        <DraftList />
      </Suspense>
    </div>
  );
}

async function DraftList() {
  const { db } = await requireEditor();
  const { data: rows, error } = await db
    .from('articles')
    .select('id, working_title, status, revision, updated_at, as_of, is_temporary, generation_jobs(status, stage, created_at)')
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) return <p className="mt-10 text-[#9a3412]">Could not load drafts: {error.message}</p>;
  if (!rows?.length)
    return (
      <div className="studio-card mt-10 p-8 text-center">
        <p className="font-display text-2xl text-navy-900">No drafts yet</p>
        <p className="mt-2 text-ink-soft">Commission a story with a natural-language prompt and Seshat will research and draft it for your review.</p>
      </div>
    );
  return (
    <ul className="studio-card mt-8 divide-y divide-cream-300">
      {rows.map((r) => {
        const jobs = (r.generation_jobs ?? []) as { status: string; stage: string; created_at: string }[];
        const job = jobs.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        return (
          <li key={r.id}>
            <Link href={`/admin/drafts/${r.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 hover:bg-cream-100 sm:px-6">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-lg font-semibold text-navy-900">
                  {r.is_temporary ? <span className="mr-2 rounded-full bg-cream-200 px-2 py-0.5 align-middle font-sans text-xs font-semibold text-ink-soft">Temporary</span> : null}
                  {r.working_title}
                </span>
                <span className="text-xs text-muted">
                  Updated {fmtDayShort(r.updated_at.slice(0, 10))} · revision {r.revision}
                  {r.as_of ? ` · data to ${fmtDayShort(r.as_of)}` : ''}
                </span>
              </span>
              <StatusBadge status={r.status} job={job} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
