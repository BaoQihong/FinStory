// The subset of a job sent to the studio UI (no lease tokens).
import type { Job } from './pipeline/types';
import { summarizeMetrics } from './pipeline/runner';

export type JobView = {
  id: string;
  articleId: string;
  status: Job['status'];
  stage: Job['stage'];
  attempts: Job['attempts'];
  error: Job['error'];
  warnings: Job['warnings'];
  createdAt: string;
  metrics: ReturnType<typeof summarizeMetrics> & { startedAt?: string; finishedAt?: string };
};

export function publicJob(j: Job): JobView {
  return {
    id: j.id,
    articleId: j.article_id,
    status: j.status,
    stage: j.stage,
    attempts: j.attempts,
    error: j.error,
    warnings: j.warnings,
    createdAt: j.created_at,
    metrics: { ...summarizeMetrics(j), startedAt: j.metrics.startedAt, finishedAt: j.metrics.finishedAt },
  };
}
