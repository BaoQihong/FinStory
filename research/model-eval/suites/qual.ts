// Technical qualification probes (§ 7 of the brief). Cheap requests that
// establish what each model/API combination actually does. Each probe sets
// its own thinking controls (ownThinking) so default behaviour and every
// candidate control can be observed separately.
import type { CallResult } from '../lib/arli.ts';
import type { Case, Check } from '../lib/types.ts';
import { extractJson } from '../lib/json.ts';

const V = 'qual-v1';
const ck = (id: string, pass: boolean | null, detail?: string): Check => ({ id, pass, detail });
const finished = (r: CallResult) => ck('finish_stop', r.finishReason === 'stop', `finish_reason=${r.finishReason}`);
const reasoningInfo = (r: CallResult) => `reasoning chars=${r.reasoning?.length ?? 0} tokens=${r.usage.reasoning} field=${r.reasoningField}`;
const has391 = (r: CallResult) => ck('answer_391', /\b391\b/.test(r.content), r.content.slice(0, 80));

const q = (c: Omit<Case, 'suite' | 'fixtureVersion' | 'ownThinking' | 'category'> & { category?: string }): Case => ({ suite: 'qual', fixtureVersion: V, ownThinking: true, category: c.category ?? 'qualification', ...c });

const MULT = [{ role: 'user' as const, content: 'What is 17 multiplied by 23? Reply with the number only.' }];

// ~24k-token needle-in-haystack context (practical context check; far below the advertised 131k).
const FILLER_SENTENCES = [
  'The committee reviewed the quarterly bulletin and noted no change to the reporting calendar.',
  'Regional offices submitted their survey returns on schedule, and the archive was updated overnight.',
  'Staff confirmed that the revised tables follow the same seasonal adjustment as the previous release.',
  'A footnote explains that figures for the most recent month remain provisional until the annual review.',
];
function haystack(sentences: number, needleAt: number) {
  const out: string[] = [];
  for (let i = 0; i < sentences; i++) {
    if (i === needleAt) out.push('Note for the reader: the archive reference code for this document is MAGENTA-4471.');
    out.push(`(${i + 1}) ${FILLER_SENTENCES[i % FILLER_SENTENCES.length]}`);
  }
  return out.join(' ');
}

export const QUAL_CASES: Case[] = [
  q({ id: 'basic_default', messages: [{ role: 'user', content: 'Reply with exactly the word: pong' }], params: { max_tokens: 400, temperature: 0 }, stream: false, evaluate: (r) => [ck('says_pong', /pong/i.test(r.content), r.content.slice(0, 60)), finished(r), ck('default_reasoning', (r.reasoning?.length ?? 0) > 0 || (r.usage.reasoning ?? 0) > 0, reasoningInfo(r)), ck('usage_reported', r.usage.input !== null && r.usage.output !== null)] }),
  q({ id: 'think_off_kwargs', messages: MULT, params: { max_tokens: 400, temperature: 0, chat_template_kwargs: { enable_thinking: false } }, stream: false, evaluate: (r) => [has391(r), ck('no_reasoning', !(r.reasoning?.length) && !(r.usage.reasoning ?? 0), reasoningInfo(r)), finished(r)] }),
  q({ id: 'think_on_kwargs', messages: MULT, params: { max_tokens: 3000, temperature: 0, chat_template_kwargs: { enable_thinking: true } }, stream: false, evaluate: (r) => [has391(r), ck('has_reasoning', (r.reasoning?.length ?? 0) > 0 || (r.usage.reasoning ?? 0) > 0, reasoningInfo(r)), ck('reasoning_separated', r.reasoningField === 'reasoning_content' || r.reasoningField === 'reasoning', String(r.reasoningField)), finished(r)] }),
  q({ id: 'think_effort_low', messages: MULT, params: { max_tokens: 3000, temperature: 0, reasoning_effort: 'low' }, stream: false, evaluate: (r) => [has391(r), ck('has_reasoning', (r.reasoning?.length ?? 0) > 0 || (r.usage.reasoning ?? 0) > 0, reasoningInfo(r))] }),
  q({ id: 'think_effort_none', messages: MULT, params: { max_tokens: 3000, temperature: 0, reasoning_effort: 'none' }, stream: false, evaluate: (r) => [has391(r), ck('no_reasoning', !(r.reasoning?.length) && !(r.usage.reasoning ?? 0), reasoningInfo(r))] }),
  q({ id: 'think_kwarg_thinking_false', messages: MULT, params: { max_tokens: 3000, temperature: 0, chat_template_kwargs: { thinking: false } }, stream: false, evaluate: (r) => [has391(r), ck('no_reasoning', !(r.reasoning?.length) && !(r.usage.reasoning ?? 0), reasoningInfo(r))] }),
  q({ id: 'system_prompt', messages: [{ role: 'system', content: 'You are a French tutor. Always answer in French, using a single word, lower case, no punctuation.' }, { role: 'user', content: 'What colour is the sky on a clear day?' }], params: { max_tokens: 400, temperature: 0, chat_template_kwargs: { enable_thinking: false } }, stream: false, evaluate: (r) => [ck('french_bleu', /bleu/i.test(r.content), r.content.slice(0, 60)), ck('single_word', r.content.trim().split(/\s+/).length === 1, r.content.slice(0, 60))] }),
  q({
    id: 'multi_turn',
    messages: [
      { role: 'user', content: 'Remember this code word: ORCHID. Reply only "OK".' },
      { role: 'assistant', content: 'OK' },
      { role: 'user', content: 'Now also remember the number 58. Reply only "OK".' },
      { role: 'assistant', content: 'OK' },
      { role: 'user', content: 'What were the code word and the number? Reply as WORD NUMBER.' },
    ],
    params: { max_tokens: 400, temperature: 0, chat_template_kwargs: { enable_thinking: false } },
    stream: false,
    evaluate: (r) => [ck('recalls_both', /ORCHID/i.test(r.content) && /58/.test(r.content), r.content.slice(0, 60))],
  }),
  q({ id: 'temp0_repeat', reps: 2, messages: [{ role: 'user', content: 'In one sentence of about 20 words, explain what a bond yield is.' }], params: { max_tokens: 200, temperature: 0, chat_template_kwargs: { enable_thinking: false } }, stream: false, evaluate: (r) => [ck('non_empty', r.content.trim().length > 20)] }),
  q({ id: 'top_p', messages: [{ role: 'user', content: 'Name one primary colour. One word.' }], params: { max_tokens: 400, temperature: 0.7, top_p: 0.5, chat_template_kwargs: { enable_thinking: false } }, stream: false, evaluate: (r) => [ck('accepted', r.content.trim().length > 0, r.content.slice(0, 40))] }),
  q({ id: 'length_truncation', messages: [{ role: 'user', content: 'Count from 1 to 200, separated by spaces. Output only the numbers.' }], params: { max_tokens: 24, temperature: 0, chat_template_kwargs: { enable_thinking: false } }, stream: false, evaluate: (r) => [ck('finish_length', r.finishReason === 'length', `finish_reason=${r.finishReason}`), ck('output_capped', (r.usage.output ?? 999) <= 24, `out=${r.usage.output}`)] }),
  q({ id: 'stop_sequence', messages: [{ role: 'user', content: 'List the numbers 1 to 10, one per line. Output only the numbers.' }], params: { max_tokens: 200, temperature: 0, stop: ['6'], chat_template_kwargs: { enable_thinking: false } }, stream: false, evaluate: (r) => [ck('stopped_before_6', /5/.test(r.content) && !/6|7|8|9|10/.test(r.content), JSON.stringify(r.content.slice(0, 40))), ck('finish_stop', r.finishReason === 'stop', `finish_reason=${r.finishReason}`)] }),
  q({
    id: 'json_object',
    messages: [{ role: 'user', content: 'Return a JSON object with keys "city" and "country" for the capital of Japan.' }],
    params: { max_tokens: 400, temperature: 0, response_format: { type: 'json_object' }, chat_template_kwargs: { enable_thinking: false } },
    stream: false,
    evaluate: (r) => {
      const j = extractJson(r.content);
      return [ck('json_parses', j.ok, j.ok ? j.mode : j.error), ck('bare_json', j.ok && j.mode === 'direct', j.ok ? j.mode : ''), ck('shape', j.ok && /tokyo/i.test(String((j.value as Record<string, unknown>).city)))];
    },
  }),
  q({
    id: 'json_schema_strict',
    messages: [{ role: 'user', content: 'Classify these three indicators: CPI, unemployment rate, 10-year Treasury yield. Give each a category (prices, labour, rates) and one short note.' }],
    params: {
      max_tokens: 800,
      temperature: 0,
      chat_template_kwargs: { enable_thinking: false },
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'indicators',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['items'],
            properties: { items: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['name', 'category', 'note'], properties: { name: { type: 'string' }, category: { type: 'string', enum: ['prices', 'labour', 'rates'] }, note: { type: 'string', maxLength: 120 } } } } },
          },
        },
      },
    },
    stream: false,
    evaluate: (r) => {
      const j = extractJson(r.content);
      const items = j.ok ? ((j.value as { items?: { category?: string; name?: string; note?: string }[] }).items ?? []) : [];
      const cats = items.map((i) => i.category).join(',');
      return [
        ck('json_parses', j.ok, j.ok ? j.mode : j.error),
        ck('bare_json', j.ok && j.mode === 'direct', j.ok ? j.mode : ''),
        ck('schema_shape', items.length === 3 && items.every((i) => ['prices', 'labour', 'rates'].includes(String(i.category)) && typeof i.note === 'string' && Object.keys(i).length === 3), cats),
        ck('correct_categories', cats === 'prices,labour,rates', cats),
        finished(r),
      ];
    },
  }),
  q({ id: 'stream_off', messages: [{ role: 'user', content: 'Write two sentences on why central banks raise interest rates.' }], params: { max_tokens: 300, temperature: 0.3, chat_template_kwargs: { enable_thinking: false } }, stream: true, evaluate: (r) => [ck('non_empty', r.content.trim().length > 30), ck('ttft_measured', r.ttftMs !== null, `ttft=${r.ttftMs}`), ck('stream_usage', r.usage.output !== null, `out=${r.usage.output}`), finished(r)] }),
  q({ id: 'stream_think_on', messages: MULT, params: { max_tokens: 3000, temperature: 0, chat_template_kwargs: { enable_thinking: true } }, stream: true, evaluate: (r) => [has391(r), ck('reasoning_deltas_separate', r.reasoningField === 'reasoning_content' || r.reasoningField === 'reasoning', String(r.reasoningField)), ck('stream_usage', r.usage.output !== null), ck('reasoning_tokens_reported', r.usage.reasoning !== null, `reasoning=${r.usage.reasoning}`)] }),
  q({ id: 'throughput_600', messages: [{ role: 'user', content: 'Write a plain-language explanation, about 450 words, of how a rise in bond yields affects mortgage rates, company borrowing and share prices. Prose only, no headings.' }], params: { max_tokens: 1200, temperature: 0.3, chat_template_kwargs: { enable_thinking: false } }, stream: true, timeoutMs: 240_000, evaluate: (r) => [ck('long_output', (r.usage.output ?? 0) > 350, `out=${r.usage.output}`), finished(r)] }),
  q({ id: 'context_24k', messages: [{ role: 'user', content: `${haystack(1050, 700)}\n\nQuestion: what is the archive reference code mentioned in the text above? Reply with the code only.` }], params: { max_tokens: 400, temperature: 0, chat_template_kwargs: { enable_thinking: false } }, stream: false, timeoutMs: 240_000, evaluate: (r) => [ck('needle_found', /MAGENTA-4471/.test(r.content), r.content.slice(0, 60)), ck('input_tokens', (r.usage.input ?? 0) > 20000, `in=${r.usage.input}`)] }),
  q({ id: 'bad_response_format', messages: [{ role: 'user', content: 'Say hi.' }], params: { max_tokens: 50, response_format: { type: 'not_a_format' }, chat_template_kwargs: { enable_thinking: false } }, stream: false, evaluate: () => [ck('accepted_invalid_param', true, 'request succeeded despite invalid response_format')] }),
];
