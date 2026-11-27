// Per-job circuit breaker for external data providers. A provider that fails
// (timeout / 5xx / 429, after the HTTP layer's own bounded retries) twice in a
// job is treated as unavailable for the rest of that job: later calls are
// skipped instead of each waiting for a timeout. Failures are recorded so the
// draft can name the missing evidence explicitly. Nothing is substituted.
import { ProviderError } from '../providers/http.ts';

export type Gap = { need: string; reason: 'provider-unavailable' | 'no-dataset' | 'stale-data'; provider?: string; detail?: string };
export type ProviderOutage = { provider: string; failures: number; lastError: string };

const OPEN_AFTER = 2;
/** In-flight calls per provider: bounds how many calls an outage can cost before the breaker opens. */
const CONCURRENCY: Record<string, number> = { fred: 6 };
const DEFAULT_CONCURRENCY = 2;

export function createBreaker() {
  const state = new Map<string, { failures: number; lastError: string }>();
  const active = new Map<string, number>();
  const waiting = new Map<string, (() => void)[]>();
  const isOpen = (provider: string) => (state.get(provider)?.failures ?? 0) >= OPEN_AFTER;
  const acquire = async (provider: string) => {
    const limit = CONCURRENCY[provider] ?? DEFAULT_CONCURRENCY;
    while ((active.get(provider) ?? 0) >= limit) await new Promise<void>((r) => waiting.set(provider, [...(waiting.get(provider) ?? []), r]));
    active.set(provider, (active.get(provider) ?? 0) + 1);
  };
  const release = (provider: string) => {
    active.set(provider, (active.get(provider) ?? 1) - 1);
    const q = waiting.get(provider) ?? [];
    const next = q.shift();
    waiting.set(provider, q);
    next?.();
  };
  return {
    isOpen,
    /** Run a provider call. Returns `undefined` when the call failed or the provider is unavailable. */
    async run<T>(provider: string, fn: () => Promise<T>): Promise<T | undefined> {
      if (isOpen(provider)) return undefined;
      await acquire(provider);
      // Re-check after waiting: earlier calls may have opened the breaker meanwhile.
      if (isOpen(provider)) {
        release(provider);
        return undefined;
      }
      try {
        return await fn();
      } catch (e) {
        const outage = e instanceof ProviderError ? e.retryable : true;
        if (outage) {
          const s = state.get(provider) ?? { failures: 0, lastError: '' };
          s.failures += 1;
          s.lastError = (e as Error).message.slice(0, 200);
          state.set(provider, s);
        }
        return undefined;
      } finally {
        release(provider);
      }
    },
    failedFor: (provider: string) => (state.get(provider)?.failures ?? 0) > 0,
    outages: (): ProviderOutage[] => [...state.entries()].map(([provider, s]) => ({ provider, ...s })),
  };
}
