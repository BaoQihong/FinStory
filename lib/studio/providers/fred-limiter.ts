// Conservative FRED request discipline (Phase 3D.1a). It respects the
// provider's limits; it never works around them.
// - One request in flight at a time, and request starts at least
//   MIN_INTERVAL_MS apart (≤ 60 requests per minute per server process).
// - HTTP 429: the next request waits for Retry-After, or an increasing delay,
//   capped at MAX_BACKOFF_MS. The caller's retries stay bounded (http.ts).
// - HTTP 403 (access denied): circuit breaker. Every FRED request in this
//   process fails at once, without contacting FRED, for BLOCK_MS.
// - Request counts by endpoint and outcome, read and reset per pipeline stage.
// Module-level by default so every provider instance in a process shares it.
import { ProviderError, type FetchLike } from './http.ts';

export const MIN_INTERVAL_MS = 1000;
export const BACKOFF_429_MS = [5000, 15000, 30000];
export const MAX_BACKOFF_MS = 60_000;
export const BLOCK_MS = 15 * 60_000;
/** Per-request timeout, counted from the send (the longest FRED timeout the provider used before). */
export const REQUEST_TIMEOUT_MS = 45_000;

export type FredRequestStats = Record<string, number>;

export function createFredLimiter(opts: { minIntervalMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {}) {
  const minInterval = opts.minIntervalMs ?? MIN_INTERVAL_MS;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let chain: Promise<unknown> = Promise.resolve();
  let nextStart = 0;
  let cooldownUntil = 0;
  let blockedUntil = 0;
  let consecutive429 = 0;
  let stats: FredRequestStats = {};
  const bump = (k: string, n = 1) => (stats[k] = (stats[k] ?? 0) + n);

  /** Wraps fetch for one FRED endpoint (label used for the per-endpoint counts). */
  function fetchFor(endpoint: string, inner: FetchLike): FetchLike {
    return (input, init) => {
      const run = chain.then(async () => {
        if (now() < blockedUntil) {
          bump('blocked');
          throw new ProviderError(`FRED access denied (HTTP 403) earlier in this process; requests paused until ${new Date(blockedUntil).toISOString().slice(11, 16)} UTC — not retried`, false, 403);
        }
        const wait = Math.max(nextStart, cooldownUntil) - now();
        if (wait > 0) {
          bump('waitMs', wait);
          await sleep(wait);
        }
        nextStart = now() + minInterval;
        bump(endpoint);
        // The caller's timeout (http.ts) starts before queueing; time spent waiting here must not
        // count as a request timeout, so the request gets its own timeout from the moment it is sent.
        const res = await inner(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (res.status === 429) {
          bump('http429');
          const ra = Number(res.headers.get('retry-after'));
          const backoff = Number.isFinite(ra) && ra > 0 ? ra * 1000 : BACKOFF_429_MS[Math.min(consecutive429, BACKOFF_429_MS.length - 1)];
          consecutive429++;
          cooldownUntil = now() + Math.min(backoff, MAX_BACKOFF_MS);
        } else if (res.status === 403) {
          bump('http403');
          blockedUntil = now() + BLOCK_MS;
        } else {
          consecutive429 = 0;
          if (!res.ok) bump(`http${res.status}`);
        }
        return res;
      });
      chain = run.catch(() => undefined);
      return run;
    };
  }

  return {
    fetchFor,
    /** Counts since the last call (then reset). Empty when no FRED request was made. */
    takeStats(): FredRequestStats {
      const s = stats;
      stats = {};
      return s;
    },
    isBlocked: () => now() < blockedUntil,
    /** Count a request that was avoided (metadata reused); never touches the throttle. */
    note: (key: string) => void bump(key),
  };
}

export type FredLimiter = ReturnType<typeof createFredLimiter>;

/** Shared by every FRED provider instance in this server process. */
export const sharedFredLimiter = createFredLimiter();
