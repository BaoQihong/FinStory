// Production dependency wiring (server only). Provider credentials are read
// from server environment variables and never reach the browser.
import 'server-only';
import type { ServerSupabase } from '@/lib/supabase/server';
import { arliLlm } from './llm';
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
    llm: arliLlm({ baseUrl: env.ARLI_BASE_URL!, apiKey: env.ARLI_API_KEY!, model: env.ARLI_MODEL! }),
    search: tavilyProvider(env.TAVILY_API_KEY),
    data: [fredProvider(env.FRED_API_KEY), tiingoProvider(env.TIINGO_API_KEY), eiaProvider(env.EIA_API_KEY)],
    today: () => new Date().toISOString().slice(0, 10),
    now: () => new Date(),
  };
}

export const DAILY_JOB_LIMIT = 12;
