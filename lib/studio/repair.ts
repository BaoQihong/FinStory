// Targeted repair of flagged passages — shared by the generation pipeline's
// repair stage (lib/studio/pipeline/stages.ts) and "Fix It for Me" in the
// publication dialog (lib/editorial/fix.ts, D-055).
//
// The model sees only the flagged strings (path + text + problem), the fact
// tokens and the deterministic data observations; it returns replacement text
// for those paths only. Pure module: no I/O.
import { z } from 'zod';
import type { Fact } from '../data/display.ts';
import { dateLines, factLines } from './pipeline/prompts.ts';
import { REVISION_PRINCIPLES } from '../editorial/style-guide.ts';

/** Validator codes whose problem lives in the wording of one text field (quantity:* too). */
export const REPAIRABLE_CODES = ['bare-number', 'unknown-token', 'unsupported-superlative', 'superlative-contradicted', 'style', 'duplicate-word'] as const;
export const isRepairableCode = (code: string) => (REPAIRABLE_CODES as readonly string[]).includes(code) || code.startsWith('quantity:');

export const RepairOut = z.object({ fixes: z.array(z.object({ path: z.string().max(120), text: z.string().trim().min(1).max(1600) })).max(40) });
export type RepairOut = z.infer<typeof RepairOut>;

/** max: the field's hard limit when known (Fix It); otherwise the generation allowance below. */
export type RepairItem = { path: string; text: string; problem: string; max?: number };

/** The length allowance the model is given for one rewrite. */
export const repairMaxLength = (text: string) => Math.max(120, Math.round(text.length * 1.15));

export function repairPrompt(input: { items: RepairItem[]; facts: Record<string, Fact>; dates: Record<string, { date: string; method: string }>; observations: string[]; extra?: string }): string {
  const items = input.items.map((i) => `PATH ${i.path}\nMAX LENGTH ${i.max ?? repairMaxLength(i.text)} characters\nPROBLEM ${i.problem}\nTEXT ${i.text}`).join('\n\n');
  return `Some passages in a Seshat draft were flagged by Seshat's validator or fact-checking editor: numbers that are not fact tokens, tokens that do not exist, superlatives ("highest", "five-year low", "above average"…) not backed by a data fact, clichés, repeated words, figures used as the wrong kind of quantity (a level presented as a change, a per-unit cost presented as an annual increase, a forecast stated as an outcome, the wrong period or unit), or factual/logical problems.

FACT TOKENS AVAILABLE:
${factLines(input.facts)}
${dateLines(input.dates)}

DATA OBSERVATIONS (deterministic — superlatives must agree with these):
${input.observations.join('\n')}

FLAGGED TEXT:
${items}

For each PATH, return the full corrected text (within its MAX LENGTH): use each figure only as what its description says it is (level vs change, its unit and denominator, its period, forecast vs historical); fix each factual or logical problem (correct it using the data and observations, or remove/qualify the claim); replace each flagged figure with the matching fact token if one exists, otherwise rewrite without that number; make each superlative either cite the matching high/low/since token in the same sentence or remove it if the observations do not support it; replace clichés with plain, specific words (rework the sentence; do not swap in a synonym). Keep everything else the same. ${REVISION_PRINCIPLES}${input.extra ? `\n${input.extra}` : ''} Return {"fixes": [{"path": "...", "text": "..."}]}.`;
}
