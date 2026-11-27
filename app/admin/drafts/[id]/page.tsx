import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireEditor } from '@/lib/studio/auth';
import { publicJob } from '@/lib/studio/job-view';
import type { Job } from '@/lib/studio/pipeline/types';
import type { SeshatArticle, StoryBrief } from '@/lib/studio/schema';
import { DraftWorkspace, type DatasetMeta, type FindingView, type PublicationEntry, type SourceView } from '@/components/studio/DraftWorkspace';
import { publicationState, type PublicationColumns } from '@/lib/publishing/rules';

// Private, per-request studio route: render on the server at request time (no static shell).
export const instant = false;
// Editorial Polish runs one Arli call inside a server action on this page (≈30–120 s).
export const maxDuration = 300;

export const metadata = { title: 'Draft' };

export default function DraftPage({ params }: PageProps<'/admin/drafts/[id]'>) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-7xl px-5 py-10 text-muted sm:px-8">Loading draft…</p>}>
      <Workspace params={params} />
    </Suspense>
  );
}

async function Workspace({ params }: { params: PageProps<'/admin/drafts/[id]'>['params'] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { db } = await requireEditor();
  const { data: article } = await db.from('articles').select('id, working_title, status, revision, content, brief, created_at, updated_at, is_temporary, slug, is_live, first_published_at, last_published_at, unpublished_at, published_revision, published_source_revision').eq('id', id).maybeSingle();
  if (!article) notFound();
  const { data: jobs } = await db.from('generation_jobs').select('*').eq('article_id', id).order('created_at', { ascending: false }).limit(1);
  const job = jobs?.[0] as Job | undefined;
  const [sources, findings, datasets, revisions] = job
    ? await Promise.all([
        db.from('research_sources').select('ref, url, title, publisher, source_type, published_at, stale, query, snippet').eq('job_id', job.id),
        db.from('research_findings').select('ref, claim, evidence_kind, source_refs, quote, quote_verified').eq('job_id', job.id).order('ref'),
        db.from('datasets').select('key, provider, series_id, name, units, frequency, seasonal_adjustment, definition, source_url, retrieved_at, observation_start, observation_end, transformations').eq('job_id', job.id).order('key'),
        db.from('article_revisions').select('revision, origin, note, created_at').eq('article_id', id).order('revision', { ascending: false }).limit(20),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, await db.from('article_revisions').select('revision, origin, note, created_at').eq('article_id', id).order('revision', { ascending: false }).limit(20)];
  const { data: publications } = await db.from('publication_revisions').select('revision, source_revision, slug, note, published_by_name, published_at').eq('article_id', id).order('revision', { ascending: false });
  const p = article as unknown as PublicationColumns;
  const homepage = p.is_live ? await homepageRole(db, article.id) : 'none';
  const byRef = (a: { ref: string }, b: { ref: string }) => Number(a.ref.slice(1)) - Number(b.ref.slice(1));
  return (
    <DraftWorkspace
      key={`${article.revision}:${article.status}:${job?.status ?? ''}`}
      articleId={article.id}
      title={article.working_title}
      temporary={article.is_temporary}
      status={article.status}
      revision={article.revision}
      brief={article.brief as StoryBrief}
      content={(article.content as SeshatArticle | null) ?? null}
      job={job ? publicJob(job) : null}
      sources={((sources.data ?? []) as SourceView[]).sort(byRef)}
      findings={((findings.data ?? []) as FindingView[]).sort(byRef)}
      datasets={(datasets.data ?? []) as DatasetMeta[]}
      publication={{ state: publicationState(p), slug: p.slug, publishedRevision: p.published_revision, sourceRevision: p.published_source_revision, firstPublishedAt: p.first_published_at, lastPublishedAt: p.last_published_at, unpublishedAt: p.unpublished_at, homepage }}
      publications={(publications ?? []) as PublicationEntry[]}
      revisions={(revisions.data ?? []) as { revision: number; origin: string; note: string | null; created_at: string }[]}
    />
  );
}

/** This live article's place on the homepage (Phase 3C): explicitly featured, the default lead (newest, nothing featured), or neither. */
async function homepageRole(db: Awaited<ReturnType<typeof requireEditor>>['db'], articleId: string): Promise<'featured' | 'lead' | 'none'> {
  const [{ data: feature }, { data: newest }] = await Promise.all([
    db.from('homepage_feature').select('article_id').maybeSingle(),
    db.from('published_stories').select('article_id').order('first_published_at', { ascending: false }).order('article_id').limit(1),
  ]);
  const explicit = (feature?.article_id as string | null) ?? null;
  if (explicit) return explicit === articleId ? 'featured' : 'none';
  return newest?.[0]?.article_id === articleId ? 'lead' : 'none';
}
