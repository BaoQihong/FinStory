// Test F (existing Seshat compatibility). Replays the production stage
// requests captured by fixtures/capture-seshat.ts exactly as lib/studio/llm.ts
// sends them (non-streaming, response_format json_schema strict, thinking off,
// same temperature and max_tokens, json_object fallback on HTTP 400), then
// validates the reply with the SAME zod schemas and number-discipline checks
// the application applies. One repair round uses llm.ts's own feedback text.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import { parseJsonObject } from '../../../lib/studio/llm.ts';
import { MacroAnalyticsOut, OutlookOut, PlanOut, ReviewOut, SelectOut, SynthOut, RepairOut } from '../../../lib/studio/pipeline/stages.ts';
import { StorySection } from '../../../lib/studio/schema.ts';
import { BriefSuggestionSchema } from '../../../lib/studio/brief.ts';
import { PolishOut } from '../../../lib/editorial/polish.ts';
import { checkTokens, findBareNumbers, stringLeaves } from '../../../lib/studio/numbers.ts';
import type { CallResult, Message } from '../lib/arli.ts';
import { extractJson } from '../lib/json.ts';
import type { Case, Check } from '../lib/types.ts';

export const SESHAT_VERSION = 'seshat-v1';
const SCHEMAS: Record<string, z.ZodType> = { plan: PlanOut, select: SelectOut, synthesize: SynthOut, story: StorySection, macro_analytics: MacroAnalyticsOut, outlook: OutlookOut, review: ReviewOut, repair: RepairOut, brief: BriefSuggestionSchema, polish: PolishOut };
/** Stages whose prose must follow the fact-token rule (D-017/D-028). */
const PROSE_STAGES = new Set(['story', 'macro_analytics', 'outlook', 'repair', 'polish']);
/** Leaves that legitimately hold non-prose strings (keys, ids, refs, enum values). */
const SKIP_LEAF = /(\.|^)(key|chartId|seriesKey|icon|evidence|role|kind|type|ref|sourceRefs\[\d+\]|showsEvidence|path)$/;

type Captured = { stage: string; system: string; user: string; maxTokens: number; temperature: number; jsonSchema: unknown };
type Ctx = { facts: Record<string, { date: string | null }>; dateKeys: string[]; promptSha256: Record<string, string> };

const issuesText = (err: z.ZodError) =>
  err.issues
    .slice(0, 15)
    .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');

function parseLikeProduction(r: CallResult): { ok: true; value: unknown } | { ok: false; problem: string } {
  try {
    return { ok: true, value: parseJsonObject(r.content) };
  } catch (e) {
    return { ok: false, problem: r.finishReason === 'length' ? 'output was cut off at max_tokens' : (e as Error).message };
  }
}

function grade(stage: string, ctx: Ctx) {
  return (r: CallResult): Check[] => {
    const out: Check[] = [];
    const strict = extractJson(r.content);
    out.push({ id: 'finish_stop', pass: r.finishReason === 'stop', detail: `finish=${r.finishReason}`, weight: 0 });
    out.push({ id: 'json_bare', pass: strict.ok && strict.mode === 'direct', detail: strict.ok ? strict.mode : strict.error });
    const p = parseLikeProduction(r);
    out.push({ id: 'json_parses_production', pass: p.ok, detail: p.ok ? 'ok' : p.problem });
    if (!p.ok) return out;
    const v = SCHEMAS[stage].safeParse(p.value);
    out.push({ id: 'schema_valid', pass: v.success, detail: v.success ? 'ok' : issuesText(v.error).slice(0, 600) });
    if (PROSE_STAGES.has(stage)) {
      const dates = Object.fromEntries(ctx.dateKeys.map((k) => [k, {}]));
      const leaves = [...stringLeaves(p.value)].filter(([path]) => !SKIP_LEAF.test(path));
      const text = leaves.map(([, t]) => t).join('\n');
      const unknown = checkTokens(text, ctx.facts, dates);
      const bare = findBareNumbers(text);
      const tokensUsed = new Set([...text.matchAll(/\{([a-zA-Z0-9]+)/g)].map((m) => m[1])).size;
      out.push({ id: 'no_unknown_tokens', pass: unknown.length === 0, detail: unknown.slice(0, 8).map((u) => `${u.token} (${u.reason})`).join(', ') || 'none' });
      out.push({ id: 'no_bare_numbers', pass: bare.length === 0, detail: bare.slice(0, 8).map((b) => b.match).join(', ') || 'none' });
      out.push({ id: 'uses_fact_tokens', pass: tokensUsed > 0 || stage === 'repair' || stage === 'polish', detail: `${tokensUsed} distinct tokens` });
    }
    return out;
  };
}

/** The production repair round (lib/studio/llm.ts): same wording, assistant reply truncated as there. */
function repairTurn(stage: string) {
  return (r: CallResult): Message[] | null => {
    const p = parseLikeProduction(r);
    if (!p.ok)
      return [
        { role: 'assistant', content: r.content.slice(0, 4000) },
        { role: 'user', content: `Your reply was not valid JSON (${p.problem}). Reply again with ONE complete JSON object that follows the schema. Be more concise if needed.` },
      ];
    const v = SCHEMAS[stage].safeParse(p.value);
    if (v.success) return null;
    return [
      { role: 'assistant', content: r.content.slice(0, 12000) },
      { role: 'user', content: `Your JSON did not validate:\n${issuesText(v.error)}\nReturn the corrected, complete JSON object only.` },
    ];
  };
}

export function seshatCases(subject = 'households-feel-poorer', only?: string[]): Case[] {
  const dir = join(import.meta.dirname, '..', 'fixtures', 'v1', 'seshat', subject);
  if (!existsSync(dir)) throw new Error(`no captured Seshat requests for ${subject}; run fixtures/capture-seshat.ts`);
  const ctx = JSON.parse(readFileSync(join(dir, 'context.json'), 'utf8')) as Ctx;
  const order = ['brief', 'plan', 'select', 'synthesize', 'story', 'macro_analytics', 'outlook', 'review', 'repair', 'polish'];
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'context.json');
  const stages = order.filter((s) => files.includes(`${s}.json`) && (!only || only.includes(s)));
  return stages.map((stage) => {
    const c = JSON.parse(readFileSync(join(dir, `${stage}.json`), 'utf8')) as Captured;
    return {
      id: `F-${stage}`,
      suite: 'F',
      category: `seshat:${stage}`,
      subject,
      fixtureVersion: `${SESHAT_VERSION}+prompt@${ctx.promptSha256[stage]}`,
      messages: [
        { role: 'system', content: c.system },
        { role: 'user', content: c.user },
      ],
      params: { max_tokens: c.maxTokens, temperature: c.temperature, response_format: { type: 'json_schema', json_schema: { name: stage, schema: c.jsonSchema, strict: true } } },
      onHttp400Params: { response_format: { type: 'json_object' } },
      stream: false,
      timeoutMs: 300_000,
      evaluate: grade(stage, ctx),
      repair: repairTurn(stage),
    } as Case;
  });
}
