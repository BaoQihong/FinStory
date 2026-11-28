// Phase 3D.1 shortlist. Exact Arli identifiers verified against the live
// catalog (results/catalog-*.json). thinkingParams are the controls that
// qualification showed to work for each model (see the report § 2).
import type { ModelConfig } from './lib/types.ts';

const OFF = { chat_template_kwargs: { enable_thinking: false } };
const ON = { chat_template_kwargs: { enable_thinking: true } };

const ALL = ['qual', 'A', 'B', 'C', 'D', 'E', 'F'];
const ANALYSIS = ['A', 'B', 'C', 'D'];

/** Every model qualification probes (thinking controls are set per probe). */
export const QUAL_MODELS: { model: string; family: string; why: string }[] = [
  { model: 'Qwen3.8-27B', family: 'Qwen3.8 27B (base instruct)', why: 'Current production model (ARLI_MODEL, D-008); the baseline.' },
  { model: 'Qwen3.8-27B-antislop', family: 'Qwen3.8 27B fine-tune', why: 'Preliminary candidate; "antislop" fine-tunes target formulaic AI phrasing — directly relevant to the Reuters feedback.' },
  { model: 'Qwen3.8-27B-Novelist1.0', family: 'Qwen3.8 27B fine-tune', why: 'Preliminary candidate; creative/novel-writing fine-tune — tests whether a fiction voice improves narrative pacing.' },
  { model: 'Qwen3.8-27B-Moxie', family: 'Qwen3.8 27B fine-tune', why: 'Preliminary candidate; personality/prose fine-tune of the same base — isolates fine-tuning effects from base-model effects.' },
  { model: 'GLM-4.7', family: 'GLM-4.7 (Zhipu)', why: 'Preliminary candidate; a different, larger model family with a strong reasoning reputation; non-VLM text model.' },
  { model: 'DeepSeek-V4.1-Flash-1017', family: 'DeepSeek V4.1 Flash', why: 'Preliminary candidate; reasoning-oriented family served on a different Arli engine ("flare").' },
  { model: 'Gemma-4-31B-Claude-4.6-Opus-Reasoning-Distilled', family: 'Gemma 4 31B fine-tune (reasoning distillation)', why: 'Preliminary candidate; reasoning-distilled Gemma — tests whether distilled reasoning traces add analytical depth.' },
  { model: 'Gemma-4-31B-it', family: 'Gemma 4 31B (base instruct)', why: 'Replacement/control: the un-fine-tuned Gemma base, so the distilled variant can be judged against its own base.' },
  { model: 'Qwen3.8-Flash-Next', family: 'Qwen3.8 Flash (small/fast)', why: 'Fast-model candidate for routine structured operations (brief builder, review, repair).' },
  { model: 'MiMo-V2.6-Flash-MOPD', family: 'Xiaomi MiMo V2.6 Flash', why: 'Fast-model candidate from a third family; text-only.' },
  { model: 'Gemma-4-31B-Writers-V2', family: 'Gemma 4 31B fine-tune (writing)', why: 'Replacement: a dedicated writing fine-tune on a non-Qwen base, so writing-model effects are not tested on one base only.' },
];

/** Benchmark configurations (model × thinking mode). Filled from qualification results. */
export const CONFIGS: ModelConfig[] = [
  { id: 'qwen27b', model: 'Qwen3.8-27B', family: 'qwen3.8-27b', mode: 'off', thinkingParams: OFF, suites: ALL, why: 'Production baseline exactly as the pipeline calls it (thinking off).' },
  { id: 'qwen27b-think', model: 'Qwen3.8-27B', family: 'qwen3.8-27b', mode: 'on', thinkingParams: ON, suites: [...ANALYSIS, 'E'], why: 'Same weights with thinking on: isolates the effect of reasoning.' },
  { id: 'qwen-antislop', model: 'Qwen3.8-27B-antislop', family: 'qwen3.8-27b-ft', mode: 'off', thinkingParams: OFF, suites: [], why: 'EXCLUDED after qualification: emits token garbage ("ODAODA量大…") at every sampling setting incl. temperature 0, with and without thinking (results/diag-antislop-2026-11-28.json) — a serving/weights fault, not a prompt issue.' },
  { id: 'qwen-novelist', model: 'Qwen3.8-27B-Novelist1.0', family: 'qwen3.8-27b-ft', mode: 'off', thinkingParams: OFF, suites: ALL, why: 'Creative fine-tune.' },
  { id: 'qwen-moxie', model: 'Qwen3.8-27B-Moxie', family: 'qwen3.8-27b-ft', mode: 'off', thinkingParams: OFF, suites: ALL, why: 'Personality fine-tune.' },
  { id: 'glm47', model: 'GLM-4.7', family: 'glm-4.7', mode: 'off', thinkingParams: OFF, suites: ALL, why: 'Different family, thinking off.' },
  { id: 'glm47-think', model: 'GLM-4.7', family: 'glm-4.7', mode: 'on', thinkingParams: ON, suites: [...ANALYSIS, 'E'], why: 'GLM with thinking on.' },
  { id: 'deepseek-flash', model: 'DeepSeek-V4.1-Flash-1017', family: 'deepseek-v4.1-flash', mode: 'off', thinkingParams: { chat_template_kwargs: { enable_thinking: false, thinking: false } }, suites: ALL, why: 'DeepSeek, thinking off. Its template ignores enable_thinking; it needs chat_template_kwargs.thinking=false (diag-deepseek-thinking-2026-11-28.json).' },
  { id: 'deepseek-flash-think', model: 'DeepSeek-V4.1-Flash-1017', family: 'deepseek-v4.1-flash', mode: 'on', thinkingParams: ON, suites: ANALYSIS, why: 'DeepSeek, thinking on.' },
  { id: 'gemma-distill', model: 'Gemma-4-31B-Claude-4.6-Opus-Reasoning-Distilled', family: 'gemma-4-31b-ft', mode: 'off', thinkingParams: OFF, suites: ALL, why: 'Distilled Gemma, thinking off.' },
  { id: 'gemma-distill-think', model: 'Gemma-4-31B-Claude-4.6-Opus-Reasoning-Distilled', family: 'gemma-4-31b-ft', mode: 'on', thinkingParams: ON, suites: [], why: 'EXCLUDED after qualification: enable_thinking:true yields no separated reasoning and leaks chat-template tokens (<|turn>model) into content.' },
  { id: 'gemma-it', model: 'Gemma-4-31B-it', family: 'gemma-4-31b', mode: 'off', thinkingParams: OFF, suites: ALL, why: 'Gemma base control.' },
  { id: 'qwen-flash', model: 'Qwen3.8-Flash-Next', family: 'qwen3.8-flash', mode: 'off', thinkingParams: OFF, suites: ALL, why: 'Fast model.' },
  { id: 'mimo-flash', model: 'MiMo-V2.6-Flash-MOPD', family: 'mimo-v2.6-flash', mode: 'off', thinkingParams: OFF, suites: ALL, why: 'Fast model, third family.' },
  { id: 'gemma-writers', model: 'Gemma-4-31B-Writers-V2', family: 'gemma-4-31b-ft', mode: 'off', thinkingParams: OFF, suites: ['E', 'F'], why: 'Writing fine-tune: writing tests only.' },
];

/** Qualification configs: one per model, no thinking params (each probe sets its own). */
export const qualConfigs = (): ModelConfig[] =>
  QUAL_MODELS.map((m) => ({ id: m.model, model: m.model, family: m.family, mode: 'default', thinkingParams: {}, suites: ['qual'], why: m.why }));
