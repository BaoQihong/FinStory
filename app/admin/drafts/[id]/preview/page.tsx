import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireEditor } from '@/lib/studio/auth';
import { SeshatArticleV1 } from '@/lib/studio/schema';
import { fromDraft, readingMinutesOf } from '@/lib/content/render-model';
import { resolveTokensSafe } from '@/lib/content/tokens';
import { sectionName } from '@/content';
import { ArticleView } from '@/components/article/ArticleView';

// Private, per-request studio route: render on the server at request time (no static shell).
export const instant = false;

export const metadata = { title: 'Preview', robots: { index: false, follow: false } };

export default function PreviewPage({ params }: PageProps<'/admin/drafts/[id]/preview'>) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-7xl px-5 py-10 text-muted sm:px-8">Loading preview…</p>}>
      <Preview params={params} />
    </Suspense>
  );
}

async function Preview({ params }: { params: PageProps<'/admin/drafts/[id]/preview'>['params'] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { db } = await requireEditor();
  const { data } = await db.from('articles').select('content, revision').eq('id', id).maybeSingle();
  const parsed = SeshatArticleV1.safeParse(data?.content);
  if (!data || !parsed.success) notFound();
  const model = fromDraft(parsed.data);
  const minutes = readingMinutesOf(model.article, (s) => resolveTokensSafe(s, model.data));
  return (
    <>
      <div className="sticky top-0 z-30 border-b border-gold-500/40 bg-[#fbf1dc]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-5 py-2 text-sm sm:px-8">
          <strong className="font-semibold text-ink">Private draft preview</strong>
          <span className="text-ink-soft">Revision {data.revision} · not published · visible only to signed-in editors</span>
          <Link href={`/admin/drafts/${id}`} className="ml-auto font-semibold text-navy-800 underline decoration-gold-500 underline-offset-2">
            Back to editing
          </Link>
        </div>
      </div>
      <ArticleView article={model.article} data={model.data} sectionName={sectionName(model.article.section)} readingMinutes={minutes} mode="preview" />
    </>
  );
}
