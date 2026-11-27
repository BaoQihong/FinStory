import { Suspense } from 'react';
import Link from 'next/link';
import { requireEditor } from '@/lib/studio/auth';
import { missingConfig } from '@/lib/studio/deps';
import { NewStoryForm } from '@/components/studio/NewStoryForm';

export const metadata = { title: 'New story' };

export default function NewStoryPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <p className="kicker text-gold-700">Commission a story</p>
      <h1 className="mt-1 font-display text-4xl font-semibold text-navy-900">What story should Seshat tell?</h1>
      <p className="mt-3 max-w-2xl text-ink-soft">
        Describe the story in plain language. Seshat plans the research, searches the web, finds and retrieves the right economic and market data, and drafts all
        four sections — The Story, Macro, Analytics and Outlook — for your review. Nothing is published.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">Loading…</p>}>
        <Gate />
      </Suspense>
    </div>
  );
}

async function Gate() {
  const { db } = await requireEditor();
  const { data: active } = await db.from('generation_jobs').select('article_id').in('status', ['queued', 'running']).limit(1);
  const missing = missingConfig();
  return (
    <>
      {missing.length ? (
        <p role="alert" className="mt-6 rounded-lg border border-[#c2410c]/40 bg-[#fff4ec] px-4 py-3 text-sm">
          The generation engine is not configured on this server (missing {missing.join(', ')}).
        </p>
      ) : null}
      {active?.length ? (
        <p role="status" className="mt-6 rounded-lg border border-cream-300 bg-cream-50 px-4 py-3 text-sm text-ink">
          A story is being generated right now — only one runs at a time.{' '}
          <Link className="font-semibold underline decoration-gold-500 underline-offset-2" href={`/admin/drafts/${active[0].article_id}`}>
            Follow its progress
          </Link>
          .
        </p>
      ) : null}
      <NewStoryForm disabled={!!active?.length || !!missing.length} />
    </>
  );
}
