// Phase 3D.1a — interim model roles (D-058). Deliberately small and pure so
// the Phase 3D.2 model gateway can replace it wholesale.
//
// - Two roles: "analytical" (structured research/analysis stages and
//   utilities) and "editorial" (prose: story, polish).
// - Precedence per role: ARLI_<ROLE>_MODEL (non-empty) → ARLI_MODEL.
//   With neither role variable set, every stage uses ARLI_MODEL exactly as
//   before. Stages not listed below always use ARLI_MODEL.
// - Thinking is switched off per model family. The switch differs by family
//   (Phase 3D.1 report § 2): DeepSeek ignores enable_thinking:false and needs
//   chat_template_kwargs.thinking:false; Qwen ignores thinking:false. MiMo
//   honours enable_thinking:false.

export type ModelRole = 'analytical' | 'editorial';

/** Pipeline stages and studio actions → role. Anything unlisted uses ARLI_MODEL. */
export const STAGE_ROLES: Readonly<Record<string, ModelRole>> = {
  plan: 'analytical',
  select: 'analytical',
  synthesize: 'analytical',
  macro_analytics: 'analytical',
  outlook: 'analytical',
  review: 'analytical',
  repair: 'analytical',
  brief: 'analytical',
  // Fix It for Me reuses the repair stage's prompt and schema (D-055), so it follows repair.
  fix: 'analytical',
  story: 'editorial',
  polish: 'editorial',
};

/** Reads ARLI_MODEL, ARLI_ANALYTICAL_MODEL and ARLI_EDITORIAL_MODEL (process.env fits). */
export type ModelEnv = { readonly [name: string]: string | undefined };
export type ModelSelection = { base: string; analytical: string; editorial: string };

const set = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

/** Resolve the model for each role from the environment (see precedence above). */
export function resolveModels(env: ModelEnv): ModelSelection {
  const base = set(env.ARLI_MODEL);
  if (!base) throw new Error('ARLI_MODEL is not configured');
  return { base, analytical: set(env.ARLI_ANALYTICAL_MODEL) ?? base, editorial: set(env.ARLI_EDITORIAL_MODEL) ?? base };
}

/** The model variables that are set (non-empty) in `env` — lets local scripts apply process-env overrides over .env.local. */
export function modelOverrides(env: Record<string, string | undefined>): ModelEnv {
  const out: Record<string, string | undefined> = {};
  for (const k of ['ARLI_MODEL', 'ARLI_ANALYTICAL_MODEL', 'ARLI_EDITORIAL_MODEL'] as const) if (set(env[k])) out[k] = env[k];
  return out;
}

export function modelForStage(sel: ModelSelection, stage: string): string {
  const role = STAGE_ROLES[stage];
  return role ? sel[role] : sel.base;
}

/** One label for a selection: the single model, or both roles when they differ. */
export function selectionLabel(sel: ModelSelection): string {
  return sel.analytical === sel.editorial
    ? sel.analytical
    : `${sel.analytical} (analytical) + ${sel.editorial} (editorial)`;
}

/**
 * Request fields that disable thinking for a model. Families verified live in
 * Phase 3D.1 (prompt-token drop and reasoning_tokens = 0). Unknown models get
 * the original production switch, so behaviour is unchanged for them.
 */
export function thinkingOffParams(model: string): Record<string, unknown> {
  if (/^deepseek/i.test(model)) return { chat_template_kwargs: { enable_thinking: false, thinking: false } };
  return { chat_template_kwargs: { enable_thinking: false } };
}
