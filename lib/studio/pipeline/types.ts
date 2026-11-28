// Pipeline contracts: persisted job state, the persistence interface (Supabase
// in production, in-memory in tests), and injected dependencies.
import type { Observation } from '../../data/types.ts';
import type { Llm } from '../llm.ts';
import type { DataProvider, SearchProvider } from '../providers/types.ts';
import type { StoryBrief } from '../schema.ts';

/** Stages in execution order. Each persists its output; a failed stage retries alone. */
export const STAGES = ['plan', 'search', 'discover', 'select', 'fetch', 'synthesize', 'story', 'macro_analytics', 'outlook', 'review', 'repair', 'assemble'] as const;
export type Stage = (typeof STAGES)[number];
export const LLM_STAGES: Stage[] = ['plan', 'select', 'synthesize', 'story', 'macro_analytics', 'outlook', 'review', 'repair'];

/** The eight progress steps shown to the editor, mapped onto pipeline stages. */
export const PROGRESS_STEPS: { label: string; stages: (Stage | 'done')[] }[] = [
  { label: 'Planning research', stages: ['plan'] },
  { label: 'Searching sources', stages: ['search'] },
  { label: 'Retrieving financial data', stages: ['discover', 'select', 'fetch'] },
  { label: 'Developing the narrative', stages: ['synthesize', 'story'] },
  { label: 'Building macro and analytical sections', stages: ['macro_analytics'] },
  { label: 'Preparing conditional outlooks', stages: ['outlook'] },
  { label: 'Validating and saving the draft', stages: ['review', 'repair', 'assemble'] },
  { label: 'Ready for editorial review', stages: ['done'] },
];

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type JobError = { stage: Stage; message: string; retryable: boolean; at: string };
export type Warning = { stage: Stage; message: string };

export type StageMetrics = {
  ms: number;
  /** model = the model actually called (D-058); reasoningTokens only when reported (should be 0: thinking is off). */
  llm?: { promptTokens: number; completionTokens: number; attempts: number; model?: string; reasoningTokens?: number; finish?: string };
  calls?: Record<string, number>; // provider → HTTP calls
  credits?: number; // search credits
  /** Provider requests by endpoint and outcome during this stage run (e.g. fred: series/search, series, series/observations, http429, waitMs). */
  requests?: Record<string, Record<string, number>>;
};

export type Job = {
  id: string;
  article_id: string;
  status: JobStatus;
  stage: Stage | 'done';
  lease_token: string | null;
  attempts: Partial<Record<Stage, number>>;
  error: JobError | null;
  warnings: Warning[];
  metrics: { stages?: Partial<Record<Stage, StageMetrics[]>>; startedAt?: string; finishedAt?: string };
  created_at: string;
};

export type ArticleRow = {
  id: string;
  working_title: string;
  brief: StoryBrief;
  status: 'generating' | 'draft' | 'needs_attention' | 'generation_failed';
  content: unknown | null;
  revision: number;
};

export type SourceRow = {
  ref: string;
  url: string;
  title: string;
  publisher: string;
  source_type: 'primary' | 'journalism' | 'other';
  published_at: string | null;
  stale: boolean;
  query: string;
  snippet: string;
  excerpt: string;
  score: number | null;
  provider: string;
};

export type FindingRow = { ref: string; claim: string; evidence_kind: 'documented' | 'context' | 'interpretation'; source_refs: string[]; quote: string | null; quote_verified: boolean };

export type DatasetRow = {
  key: string;
  provider: string;
  series_id: string;
  name: string;
  units: string;
  frequency: string;
  seasonal_adjustment: string | null;
  definition: string;
  source_url: string;
  retrieved_at: string;
  observation_start: string | null;
  observation_end: string | null;
  transformations: string[];
  observations: Observation[];
  sha256: string;
};

export type Service = 'arli' | 'tavily' | 'fred' | 'tiingo' | 'eia';
export type UsageRow = {
  job_id: string;
  article_id: string;
  stage: Stage;
  service: Service;
  key_fingerprint: string;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  credits: number;
  calls: number;
};

export interface Store {
  getJob(jobId: string): Promise<Job | null>;
  /** Atomically take the job lease; null when another step holds it or the job is not active. */
  claimJob(jobId: string, seconds: number): Promise<Job | null>;
  /** Update fields and drop the lease (only if `leaseToken` still matches). */
  releaseJob(jobId: string, leaseToken: string, patch: Partial<Pick<Job, 'status' | 'stage' | 'attempts' | 'error' | 'warnings' | 'metrics'>> & { finished?: boolean }): Promise<void>;
  startRun(jobId: string, stage: Stage, attempt: number): Promise<number>;
  finishRun(runId: number, status: 'succeeded' | 'failed', output: unknown, error: string | null, metrics: StageMetrics): Promise<void>;
  /** Latest successful output of each stage. */
  stageOutputs(jobId: string): Promise<Partial<Record<Stage, unknown>>>;
  getArticle(articleId: string): Promise<ArticleRow | null>;
  updateArticle(articleId: string, patch: Partial<Pick<ArticleRow, 'status' | 'content' | 'revision' | 'working_title'>> & { schema_version?: number; as_of?: string }): Promise<void>;
  /** Origin of the article's latest revision (null when none). */
  latestRevisionOrigin(articleId: string): Promise<'generated' | 'editor' | null>;
  insertRevision(articleId: string, revision: number, origin: 'generated' | 'editor', content: unknown, note: string | null): Promise<void>;
  replaceSources(jobId: string, articleId: string, rows: SourceRow[]): Promise<void>;
  getSources(jobId: string): Promise<SourceRow[]>;
  replaceFindings(jobId: string, articleId: string, rows: FindingRow[]): Promise<void>;
  replaceDatasets(jobId: string, articleId: string, rows: DatasetRow[]): Promise<void>;
  getDatasets(jobId: string): Promise<DatasetRow[]>;
  /** Append to the per-service / per-key usage ledger. */
  recordUsage(rows: UsageRow[]): Promise<void>;
}

export type Deps = {
  store: Store;
  llm: Llm;
  search: SearchProvider;
  data: DataProvider[];
  /** sha256(api key) prefix per service — identifies which key was used, never the key. */
  keyFingerprints: Partial<Record<Service, string>>;
  /** ISO date used for staleness and windows (injected for deterministic tests). */
  today: () => string;
  now: () => Date;
};

export type StageContext = {
  deps: Deps;
  job: Job;
  article: ArticleRow;
  outputs: Partial<Record<Stage, unknown>>;
  warn: (message: string) => void;
  metric: (m: Partial<StageMetrics>) => void;
};
