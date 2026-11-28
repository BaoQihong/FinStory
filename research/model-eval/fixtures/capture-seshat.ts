// Freeze the EXACT requests Seshat's production stages send to the LLM, for
// Test F (existing-pipeline compatibility). It loads a stored, completed job
// (read-only, editor session, RLS enforced) and runs the real stage functions
// from lib/studio with a capturing Llm that records the request and aborts
// before any model call. No database writes, no model calls, no prompt edits.
//
//   node research/model-eval/fixtures/capture-seshat.ts --article <uuid> --subject <slug>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readEnv } from '../../../scripts/lib/env-file.mjs';
import type { Llm, LlmRequest } from '../../../lib/studio/llm.ts';
import { STAGE_IMPL } from '../../../lib/studio/pipeline/stages.ts';
import { SYSTEM } from '../../../lib/studio/pipeline/prompts.ts';
import type { Stage, StageContext } from '../../../lib/studio/pipeline/types.ts';
import { SeshatArticleV1, StoryBrief, type SeshatArticle } from '../../../lib/studio/schema.ts';
import { suggestBrief } from '../../../lib/studio/brief.ts';
import { polishPrompt, PolishOut } from '../../../lib/editorial/polish.ts';
import { STYLE_GUIDE_VERSION } from '../../../lib/editorial/style-guide.ts';

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const ARTICLE = opt('article');
const SUBJECT = opt('subject');
if (!ARTICLE || !SUBJECT) throw new Error('usage: --article <uuid> --subject <slug>');

const env = readEnv() as Record<string, string>;
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
{
  const { error } = await db.auth.signInWithPassword({ email: env.EDITOR_EMAIL, password: env.EDITOR_PASSWORD });
  if (error) throw new Error(`editor sign-in failed: ${error.message}`);
}

class Captured extends Error {}
const captured: Record<string, unknown>[] = [];
const llm: Llm = {
  model: 'capture-only',
  async complete<T>(req: LlmRequest<T>): Promise<never> {
    // Same JSON-schema conversion and request shape as lib/studio/llm.ts.
    const jsonSchema = z.toJSONSchema(req.schema, { target: 'draft-7', unrepresentable: 'any' });
    captured.push({ stage: req.stage, system: req.system, user: req.user, maxTokens: req.maxTokens, temperature: req.temperature ?? 0.4, jsonSchema });
    throw new Captured(req.stage);
  },
};

const { data: art, error: artErr } = await db.from('articles').select('id, working_title, brief, content, revision').eq('id', ARTICLE).single();
if (artErr || !art) throw new Error(`article not found: ${artErr?.message}`);
const content = SeshatArticleV1.parse(art.content) as SeshatArticle;
const brief = StoryBrief.parse(art.brief);
const jobId = content.generation.jobId;
const { data: job } = await db.from('generation_jobs').select('id, created_at').eq('id', jobId).single();
const { data: runs } = await db.from('job_stage_runs').select('stage, output, id').eq('job_id', jobId).eq('status', 'succeeded').order('id');
const outputs: Partial<Record<Stage, unknown>> = {};
for (const r of runs ?? []) outputs[r.stage as Stage] = r.output;

// Read-only store: only the reads the LLM stages make before calling the model.
const store = new Proxy(
  {
    async getSources(id: string) {
      const { data, error } = await db.from('research_sources').select('*').eq('job_id', id).order('ref');
      if (error) throw new Error(error.message);
      return (data ?? []).sort((a: { ref: string }, b: { ref: string }) => Number(a.ref.slice(1)) - Number(b.ref.slice(1)));
    },
  },
  {
    get(t, p) {
      if (p in t) return (t as Record<string | symbol, unknown>)[p];
      return () => {
        throw new Error(`capture store is read-only (${String(p)})`);
      };
    },
  },
);

const ctx = (): StageContext =>
  ({
    deps: { llm, store, search: { name: content.generation.searchProvider ?? 'tavily' }, data: [], today: () => content.meta.asOf, now: () => new Date(content.meta.createdAt ?? Date.now()) },
    job: { id: jobId, created_at: job?.created_at ?? content.meta.createdAt },
    article: { id: art.id, brief, working_title: art.working_title },
    outputs: { ...outputs },
    warn: () => undefined,
    metric: () => undefined,
  }) as unknown as StageContext;

for (const stage of ['plan', 'select', 'synthesize', 'story', 'macro_analytics', 'outlook', 'review', 'repair'] as Stage[]) {
  try {
    await STAGE_IMPL[stage](ctx());
    console.log(`${stage}: completed without an LLM call (skipped)`);
  } catch (e) {
    if (e instanceof Captured) console.log(`${stage}: captured`);
    else console.log(`${stage}: not captured — ${(e as Error).message.slice(0, 160)}`);
  }
}
// Editorial guidance (brief builder, D-042) on the article's original idea.
try {
  await suggestBrief(llm, { prompt: brief.prompt, context: {} });
} catch (e) {
  console.log(e instanceof Captured ? 'brief: captured' : `brief: ${(e as Error).message}`);
}
// Editorial Polish (D-049) on the Story section, with the production budget formula.
{
  const { user, fields } = polishPrompt(content, 'story', brief);
  const budget = Math.min(6000, 600 + Math.round(fields.reduce((n, f) => n + f.text.length, 0) / 2.5));
  try {
    await llm.complete({ stage: 'polish', system: SYSTEM, user, schema: PolishOut, maxTokens: budget, temperature: 0.5 });
  } catch {
    console.log('polish: captured');
  }
}

// Context for production-equivalent checks at replay time: known fact/date tokens.
const fetchOut = outputs.fetch as { products: { facts: Record<string, unknown>; dates: Record<string, unknown> }; asOf: string };
const synthOut = outputs.synthesize as { sourceFacts?: Record<string, unknown> } | undefined;
const dir = join(import.meta.dirname, 'v1', 'seshat', SUBJECT);
mkdirSync(dir, { recursive: true });
for (const c of captured) writeFileSync(join(dir, `${c.stage}.json`), JSON.stringify(c, null, 1));
writeFileSync(
  join(dir, 'context.json'),
  JSON.stringify(
    {
      subject: SUBJECT,
      capturedAt: new Date().toISOString(),
      article: { id: art.id, revision: art.revision, workingTitle: art.working_title },
      jobId,
      asOf: fetchOut.asOf,
      styleGuideVersion: STYLE_GUIDE_VERSION,
      promptSha256: Object.fromEntries(captured.map((c) => [c.stage, createHash('sha256').update(String(c.system) + String(c.user)).digest('hex').slice(0, 16)])),
      facts: Object.fromEntries(Object.entries({ ...fetchOut.products.facts, ...(synthOut?.sourceFacts ?? {}) }).map(([k, f]) => [k, { date: (f as { date?: string }).date ?? null }])),
      dateKeys: Object.keys(fetchOut.products.dates),
      note: 'Requests captured from the production stage functions with stored outputs of earlier stages (no model call, no DB write).',
    },
    null,
    1,
  ),
);
console.log(`→ ${captured.length} stage requests in ${dir}`);
process.exit(0);
