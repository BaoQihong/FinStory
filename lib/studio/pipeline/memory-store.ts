// In-memory Store for deterministic tests. Mirrors the Supabase semantics
// that matter: lease exclusivity, one active job, latest-successful-output.
import { randomUUID } from 'node:crypto';
import type { ArticleRow, DatasetRow, FindingRow, Job, SourceRow, Stage, StageMetrics, Store } from './types.ts';

type Run = { id: number; job: string; stage: Stage; attempt: number; status: string; output: unknown; error: string | null; metrics: StageMetrics };

export class MemoryStore implements Store {
  jobs = new Map<string, Job & { lease_expires: number }>();
  articles = new Map<string, ArticleRow & { schema_version?: number; as_of?: string }>();
  runs: Run[] = [];
  revisions: { article: string; revision: number; origin: string; content: unknown; note: string | null }[] = [];
  sources = new Map<string, SourceRow[]>();
  findings = new Map<string, FindingRow[]>();
  datasets = new Map<string, DatasetRow[]>();
  clock = () => Date.now();

  createArticleAndJob(article: Omit<ArticleRow, 'id' | 'revision' | 'content' | 'status'>): { articleId: string; jobId: string } {
    if ([...this.jobs.values()].some((j) => j.status === 'queued' || j.status === 'running')) throw new Error('duplicate key value violates unique constraint "generation_jobs_one_active"');
    const articleId = randomUUID();
    const jobId = randomUUID();
    this.articles.set(articleId, { ...article, id: articleId, revision: 0, content: null, status: 'generating' });
    this.jobs.set(jobId, { id: jobId, article_id: articleId, status: 'queued', stage: 'plan', lease_token: null, lease_expires: 0, attempts: {}, error: null, warnings: [], metrics: {}, created_at: new Date(this.clock()).toISOString() });
    return { articleId, jobId };
  }

  async getJob(id: string) {
    const j = this.jobs.get(id);
    return j ? structuredClone(j) : null;
  }
  async claimJob(id: string, seconds: number) {
    const j = this.jobs.get(id);
    if (!j || !['queued', 'running'].includes(j.status) || j.lease_expires > this.clock()) return null;
    j.lease_token = randomUUID();
    j.lease_expires = this.clock() + seconds * 1000;
    if (j.status === 'queued') j.status = 'running';
    return structuredClone(j);
  }
  async releaseJob(id: string, token: string, patch: Parameters<Store['releaseJob']>[2]) {
    const j = this.jobs.get(id);
    if (!j || j.lease_token !== token) throw new Error('lease lost');
    const rest: Record<string, unknown> = { ...patch };
    delete rest.finished;
    Object.assign(j, rest, { lease_token: null, lease_expires: 0 });
  }
  async startRun(job: string, stage: Stage, attempt: number) {
    const id = this.runs.length + 1;
    this.runs.push({ id, job, stage, attempt, status: 'running', output: null, error: null, metrics: { ms: 0 } });
    return id;
  }
  async finishRun(id: number, status: 'succeeded' | 'failed', output: unknown, error: string | null, metrics: StageMetrics) {
    Object.assign(this.runs[id - 1], { status, output: structuredClone(output), error, metrics });
  }
  async stageOutputs(job: string) {
    const out: Partial<Record<Stage, unknown>> = {};
    for (const r of this.runs) if (r.job === job && r.status === 'succeeded') out[r.stage] = structuredClone(r.output);
    return out;
  }
  async getArticle(id: string) {
    const a = this.articles.get(id);
    return a ? structuredClone(a) : null;
  }
  async updateArticle(id: string, patch: Parameters<Store['updateArticle']>[1]) {
    Object.assign(this.articles.get(id)!, structuredClone(patch));
  }
  async latestRevisionOrigin(article: string) {
    const r = this.revisions.filter((x) => x.article === article).sort((a, b) => b.revision - a.revision)[0];
    return (r?.origin as 'generated' | 'editor' | undefined) ?? null;
  }
  async insertRevision(article: string, revision: number, origin: 'generated' | 'editor', content: unknown, note: string | null) {
    if (this.revisions.some((r) => r.article === article && r.revision === revision)) throw new Error('duplicate revision');
    this.revisions.push({ article, revision, origin, content: structuredClone(content), note });
  }
  async replaceSources(job: string, _a: string, rows: SourceRow[]) {
    this.sources.set(job, structuredClone(rows));
  }
  async getSources(job: string) {
    return structuredClone(this.sources.get(job) ?? []);
  }
  async replaceFindings(job: string, _a: string, rows: FindingRow[]) {
    this.findings.set(job, structuredClone(rows));
  }
  async replaceDatasets(job: string, _a: string, rows: DatasetRow[]) {
    this.datasets.set(job, structuredClone(rows));
  }
  async getDatasets(job: string) {
    return structuredClone(this.datasets.get(job) ?? []);
  }
}
