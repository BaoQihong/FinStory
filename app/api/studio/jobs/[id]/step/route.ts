// Runs ONE generation stage for a job and returns its new state. The studio
// calls this repeatedly; each call fits within a single function invocation.
// Concurrency: the job lease (claim_generation_job) + one-active-job index.
import { NextResponse } from 'next/server';
import { getEditor } from '@/lib/studio/auth';
import { missingConfig, productionDeps } from '@/lib/studio/deps';
import { runStep } from '@/lib/studio/pipeline/runner';
import { publicJob } from '@/lib/studio/job-view';

export const maxDuration = 300;

export async function POST(_req: Request, ctx: RouteContext<'/api/studio/jobs/[id]/step'>) {
  const ed = await getEditor();
  if (!ed) return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  const missing = missingConfig();
  if (missing.length) return NextResponse.json({ error: `Server is missing configuration: ${missing.join(', ')}` }, { status: 503 });
  const { id } = await ctx.params;
  try {
    const r = await runStep(productionDeps(ed.db), id);
    return NextResponse.json({ kind: r.kind, stage: 'stage' in r ? r.stage : null, ok: 'ok' in r ? r.ok : null, job: r.job ? publicJob(r.job) : null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
