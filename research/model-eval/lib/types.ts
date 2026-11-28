// Shared shapes for cases, model configurations and result records.
// Kept free of harness/HTTP details so fixtures, evaluators and the record
// format can be reused later (e.g. by the Phase 3D.2 gateway's qualification).
import type { CallResult, Message } from './arli.ts';

export type ThinkingMode = 'off' | 'on' | 'default';

export type ModelConfig = {
  /** Stable config id used in results (model + mode). */
  id: string;
  /** Exact Arli API model identifier. */
  model: string;
  family: string;
  mode: ThinkingMode;
  /** Body fields that select the thinking mode for this model (verified in qualification). */
  thinkingParams: Record<string, unknown>;
  /** Which suites this config takes part in. */
  suites: string[];
  why: string;
};

export type Check = { id: string; pass: boolean | null; detail?: string; weight?: number };

export type Case = {
  id: string;
  suite: string;
  category: string;
  subject?: string;
  fixtureVersion: string;
  messages: Message[];
  /** Generation params (max_tokens, temperature, response_format, …). */
  params: Record<string, unknown>;
  stream: boolean;
  /** When true the case sets its own thinking controls; config.thinkingParams are NOT merged. */
  ownThinking?: boolean;
  timeoutMs?: number;
  reps?: number;
  /** Restrict to some configs (by predicate on the config). */
  appliesTo?: (c: ModelConfig) => boolean;
  evaluate?: (r: CallResult, c: ModelConfig) => Check[] | Promise<Check[]>;
  /** Production fallback (lib/studio/llm.ts): params merged in for one retry when the API answers HTTP 400. */
  onHttp400Params?: Record<string, unknown>;
  /** Production-style follow-up (Test F): given the first result, return a repair turn or null. */
  repair?: (r: CallResult) => Message[] | null;
};

export type RecordRow = {
  harness: string;
  runId: string;
  key: string;
  provider: 'arliai';
  config: string;
  model: string;
  mode: ThinkingMode;
  suite: string;
  case: string;
  category: string;
  subject: string | null;
  fixtureVersion: string;
  rep: number;
  params: Record<string, unknown>;
  stream: boolean;
  promptChars: number;
  attempt: number;
  retries: number;
  result: Omit<CallResult, 'raw'>;
  outputTokensPerSec: number | null;
  checks: Check[];
  repairRound?: { result: Omit<CallResult, 'raw'>; checks: Check[] } | null;
  /** HTTP 400 error text when the production json_object fallback was used. */
  fallbackUsed?: string | null;
  substitution: boolean | null;
};
