// Shared HTTP helper for provider calls: timeout, bounded retry on retryable
// statuses, and error messages that never contain query strings (API keys
// travel in query strings for FRED/Tiingo/EIA).

export class ProviderError extends Error {
  readonly retryable: boolean;
  readonly status?: number;
  constructor(message: string, retryable: boolean, status?: number) {
    super(message);
    this.retryable = retryable;
    this.status = status;
  }
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

/** A provider outage (missing evidence, re-run later) rather than "no such dataset": transient failures and access denied. */
export const isOutage = (e: unknown) => (e instanceof ProviderError ? e.retryable || e.status === 401 || e.status === 403 : true);
const safeUrl = (u: string) => u.split('?')[0];

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number; label: string; fetchImpl?: FetchLike },
): Promise<{ data: T; ms: number; calls: number }> {
  const { timeoutMs = 30000, retries = 2, label, fetchImpl = fetch, ...rest } = init;
  const t0 = Date.now();
  let lastErr: ProviderError | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 800 * 2 ** (attempt - 1)));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { ...rest, signal: ctrl.signal });
      if (!res.ok) {
        const body = (await res.text().catch(() => '')).slice(0, 200).replace(/[?&](api_key|token)=[^&\s"]+/gi, '');
        lastErr = new ProviderError(`${label}: HTTP ${res.status} from ${safeUrl(url)} ${body}`.trim(), RETRYABLE.has(res.status), res.status);
        if (!lastErr.retryable) throw lastErr;
        continue;
      }
      return { data: (await res.json()) as T, ms: Date.now() - t0, calls: attempt + 1 };
    } catch (e) {
      if (e instanceof ProviderError && !e.retryable) throw e;
      if (!(e instanceof ProviderError)) {
        const aborted = (e as Error).name === 'AbortError';
        lastErr = new ProviderError(`${label}: ${aborted ? `timed out after ${timeoutMs} ms` : (e as Error).message} (${safeUrl(url)})`, true);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new ProviderError(`${label}: failed`, true);
}
