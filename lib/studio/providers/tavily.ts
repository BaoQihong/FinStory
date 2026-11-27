// Tavily web search (D-024). Basic depth = 1 credit per search; extract =
// 1 credit per 5 successful URLs. Tavily performs the crawling, so robots
// and access restrictions are handled provider-side; we store only short
// excerpts for internal verification and never republish page text.
import { fetchJson, type FetchLike } from './http.ts';
import type { SearchProvider } from './types.ts';

type TResult = { url: string; title: string; content: string; score?: number; published_date?: string | null };

export function tavilyProvider(apiKey: string | undefined, fetchImpl?: FetchLike): SearchProvider & { enabled: boolean } {
  const H = { Authorization: `Bearer ${apiKey ?? ''}`, 'Content-Type': 'application/json' };
  return {
    name: 'Tavily',
    enabled: !!apiKey,
    async search(query, { recent, maxResults }) {
      const body = {
        query,
        search_depth: 'basic',
        topic: recent ? 'news' : 'general',
        ...(recent ? { time_range: 'month' } : {}),
        max_results: maxResults,
        chunks_per_source: 3,
        include_published_date: true,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_usage: true,
      };
      const { data, ms } = await fetchJson<{ results?: TResult[]; usage?: { credits?: number } }>('https://api.tavily.com/search', {
        method: 'POST',
        headers: H,
        body: JSON.stringify(body),
        label: 'Tavily search',
        fetchImpl,
      });
      return {
        results: (data.results ?? []).map((r) => ({ url: r.url, title: r.title ?? r.url, content: r.content ?? '', score: r.score ?? null, publishedDate: r.published_date ?? null })),
        credits: data.usage?.credits ?? 1,
        ms,
      };
    },
    async extract(urls, query) {
      if (!urls.length) return { results: [], credits: 0, ms: 0 };
      const { data, ms } = await fetchJson<{ results?: { url: string; raw_content: string }[]; usage?: { credits?: number } }>('https://api.tavily.com/extract', {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ urls: urls.slice(0, 20), query, chunks_per_source: 3, extract_depth: 'basic', format: 'text', include_usage: true }),
        label: 'Tavily extract',
        fetchImpl,
        timeoutMs: 45000,
        retries: 1,
      });
      return { results: (data.results ?? []).map((r) => ({ url: r.url, content: r.raw_content ?? '' })), credits: data.usage?.credits ?? Math.ceil(urls.length / 5), ms };
    },
  };
}
