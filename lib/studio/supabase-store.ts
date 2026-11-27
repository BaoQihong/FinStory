// Supabase implementation of the pipeline Store, running under the editor's
// session (RLS-enforced). Lease semantics come from claim_generation_job().
// Used by server routes (via deps.ts) and by the editor-session generation script.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArticleRow, DatasetRow, FindingRow, Job, SourceRow, Stage, StageMetrics, Store, UsageRow } from './pipeline/types.ts';

const fail = (what: string, e: { message: string } | null) => {
  if (e) throw new Error(`${what}: ${e.message}`);
};

export function supabaseStore(db: SupabaseClient): Store {
  return {
    async getJob(id) {
      const { data, error } = await db.from('generation_jobs').select('*').eq('id', id).maybeSingle();
      fail('load job', error);
      return (data as Job) ?? null;
    },
    async claimJob(id, seconds) {
      const { data, error } = await db.rpc('claim_generation_job', { p_job: id, p_seconds: seconds });
      fail('claim job', error);
      return ((data as Job[] | null)?.[0] as Job) ?? null;
    },
    async releaseJob(id, token, patch) {
      const { finished, ...rest } = patch;
      const { error } = await db
        .from('generation_jobs')
        .update({ ...rest, lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString(), ...(finished ? { finished_at: new Date().toISOString() } : {}) })
        .eq('id', id)
        .eq('lease_token', token);
      fail('release job', error);
    },
    async startRun(jobId, stage, attempt) {
      const { data, error } = await db.from('job_stage_runs').insert({ job_id: jobId, stage, attempt, status: 'running' }).select('id').single();
      fail('start stage run', error);
      return data!.id as number;
    },
    async finishRun(id, status, output, err, metrics: StageMetrics) {
      const { error } = await db.from('job_stage_runs').update({ status, output, error: err, metrics, finished_at: new Date().toISOString() }).eq('id', id);
      fail('finish stage run', error);
    },
    async stageOutputs(jobId) {
      const { data, error } = await db.from('job_stage_runs').select('stage, output, id').eq('job_id', jobId).eq('status', 'succeeded').order('id');
      fail('load stage outputs', error);
      const out: Partial<Record<Stage, unknown>> = {};
      for (const r of data ?? []) out[r.stage as Stage] = r.output;
      return out;
    },
    async getArticle(id) {
      const { data, error } = await db.from('articles').select('id, working_title, brief, status, content, revision').eq('id', id).maybeSingle();
      fail('load article', error);
      return (data as ArticleRow) ?? null;
    },
    async updateArticle(id, patch) {
      const { error } = await db.from('articles').update(patch).eq('id', id);
      fail('update article', error);
    },
    async latestRevisionOrigin(articleId) {
      const { data, error } = await db.from('article_revisions').select('origin').eq('article_id', articleId).order('revision', { ascending: false }).limit(1);
      fail('load revisions', error);
      return (data?.[0]?.origin as 'generated' | 'editor' | undefined) ?? null;
    },
    async insertRevision(articleId, revision, origin, content, note) {
      const { error } = await db.from('article_revisions').insert({ article_id: articleId, revision, origin, content, note });
      fail('insert revision', error);
    },
    async replaceSources(jobId, articleId, rows: SourceRow[]) {
      fail('clear sources', (await db.from('research_sources').delete().eq('job_id', jobId)).error);
      if (rows.length) fail('insert sources', (await db.from('research_sources').insert(rows.map((r) => ({ ...r, job_id: jobId, article_id: articleId })))).error);
    },
    async getSources(jobId) {
      const { data, error } = await db.from('research_sources').select('*').eq('job_id', jobId).order('ref');
      fail('load sources', error);
      return ((data ?? []) as SourceRow[]).sort((a, b) => Number(a.ref.slice(1)) - Number(b.ref.slice(1)));
    },
    async replaceFindings(jobId, articleId, rows: FindingRow[]) {
      fail('clear findings', (await db.from('research_findings').delete().eq('job_id', jobId)).error);
      if (rows.length) fail('insert findings', (await db.from('research_findings').insert(rows.map((r) => ({ ...r, job_id: jobId, article_id: articleId })))).error);
    },
    async replaceDatasets(jobId, articleId, rows: DatasetRow[]) {
      fail('clear datasets', (await db.from('datasets').delete().eq('job_id', jobId)).error);
      if (rows.length) fail('insert datasets', (await db.from('datasets').insert(rows.map((r) => ({ ...r, job_id: jobId, article_id: articleId })))).error);
    },
    async recordUsage(rows: UsageRow[]) {
      if (rows.length) fail('record usage', (await db.from('api_usage').insert(rows)).error);
    },
    async getDatasets(jobId) {
      const { data, error } = await db.from('datasets').select('*').eq('job_id', jobId).order('key');
      fail('load datasets', error);
      return (data ?? []) as DatasetRow[];
    },
  };
}
