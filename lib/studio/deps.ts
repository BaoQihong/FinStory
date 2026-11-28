// Production dependency wiring (server only). Provider credentials are read
// from server environment variables and never reach the browser.
import 'server-only';
import { createHash } from 'node:crypto';
import type { ServerSupabase } from '@/lib/supabase/server';
import { roleLlm } from './llm';
import { eiaProvider } from './providers/eia';
import { fredProvider } from './providers/fred';
import { tavilyProvider } from './providers/tavily';
import { tiingoProvider } from './providers/tiingo';
import type { Deps } from './pipeline/types';
import { supabaseStore } from './supabase-store';

export function missingConfig(): string[] {
  const need = ['ARLI_API_KEY', 'ARLI_BASE_URL', 'ARLI_MODEL', 'TAVILY_API_KEY', 'FRED_API_KEY'];
  return need.filter((k) => !process.env[k]);
}

export function productionDeps(db: ServerSupabase): Deps {
  const env = process.env;
  return {
    store: supabaseStore(db),
    // Interim model roles (D-058): ARLI_ANALYTICAL_MODEL / ARLI_EDITORIAL_MODEL, else ARLI_MODEL.
    llm: roleLlm({ baseUrl: env.ARLI_BASE_URL!, apiKey: env.ARLI_API_KEY!, env }),
    search: tavilyProvider(env.TAVILY_API_KEY),
    data: [fredProvider(env.FRED_API_KEY), tiingoProvider(env.TIINGO_API_KEY), eiaProvider(env.EIA_API_KEY)],
    keyFingerprints: keyFingerprints(env),
    today: () => new Date().toISOString().slice(0, 10),
    now: () => new Date(),
  };
}

export const DAILY_JOB_LIMIT = 12;

/** First 12 hex chars of sha256(key): distinguishes keys without revealing them. */
export const fingerprint = (key: string | undefined) => (key ? createHash('sha256').update(key).digest('hex').slice(0, 12) : 'not-configured');
export function keyFingerprints(env: Record<string, string | undefined>) {
  return { arli: fingerprint(env.ARLI_API_KEY), tavily: fingerprint(env.TAVILY_API_KEY), fred: fingerprint(env.FRED_API_KEY), tiingo: fingerprint(env.TIINGO_API_KEY), eia: fingerprint(env.EIA_API_KEY) };
}
