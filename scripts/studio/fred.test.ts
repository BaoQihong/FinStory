// FRED provider error classification and request discipline (D-059): a fake
// clock and scripted HTTP responses, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFredLimiter, BACKOFF_429_MS, BLOCK_MS, MAX_BACKOFF_MS } from '../../lib/studio/providers/fred-limiter.ts';
import { fredProvider, isMissingSeries } from '../../lib/studio/providers/fred.ts';
import { isOutage, ProviderError } from '../../lib/studio/providers/http.ts';
import { createBreaker } from '../../lib/studio/pipeline/breaker.ts';

const SERIES = { seriess: [{ id: 'CPIAUCSL', title: 'CPI', units: 'Index', frequency: 'Monthly', seasonal_adjustment: 'SA', observation_start: '1947-01-01', observation_end: '2026-10-01' }] };
const OBS = { observations: [{ date: '2026-09-01', value: '330.1' }, { date: '2026-10-01', value: '.' }] };

function harness(script: (url: string) => Response) {
  let clock = 1_000_000;
  const sleeps: number[] = [];
  const starts: number[] = [];
  const urls: string[] = [];
  const limiter = createFredLimiter({ now: () => clock, sleep: async (ms) => { sleeps.push(ms); clock += ms; } });
  const fetchImpl = async (url: string) => {
    starts.push(clock);
    urls.push(url);
    clock += 50; // request time
    return script(url);
  };
  return { limiter, fred: fredProvider('k3y', fetchImpl, limiter), sleeps, starts, urls, advance: (ms: number) => (clock += ms) };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const denied = () => new Response('<HTML><TITLE>Access Denied</TITLE></HTML>', { status: 403 });

test('unknown series (HTTP 400 "does not exist") is "not found"; nothing else is', async () => {
  const h = harness(() => json({ error_code: 400, error_message: 'Bad Request.  The series does not exist.' }, 400));
  assert.equal(await h.fred.meta('NOPE'), null);
  await assert.rejects(h.fred.fetch('NOPE', '2020-01-01'), /FRED series NOPE not found/);
  assert.ok(isMissingSeries(new ProviderError('FRED series: HTTP 404 from x', false, 404)));
  assert.ok(!isMissingSeries(new ProviderError('FRED series: HTTP 400 from x bad parameter', false, 400)));
});

test('HTTP 403 is access denied, not "not found": rethrown, an outage, and the circuit opens', async () => {
  const h = harness(denied);
  await assert.rejects(h.fred.meta('CPIAUCSL'), (e: unknown) => {
    assert.ok(e instanceof ProviderError);
    assert.equal(e.status, 403);
    assert.ok(isOutage(e));
    assert.doesNotMatch(e.message, /not found|k3y/);
    return true;
  });
  // fetch() now reports the denial instead of "series not found".
  await assert.rejects(h.fred.fetch('CPIAUCSL', '2020-01-01'), (e: unknown) => e instanceof ProviderError && /access denied/i.test(e.message) && !/not found/.test(e.message));
  assert.equal(h.urls.length, 1, 'after a 403 no further request reaches FRED');
  await assert.rejects(h.fred.search!('cpi', 5), /access denied/i);
  assert.equal(h.urls.length, 1);
  const s = h.limiter.takeStats();
  assert.equal(s.series, 1);
  assert.equal(s.http403, 1);
  assert.equal(s.blocked, 2);
  // The circuit closes after BLOCK_MS (no attempt to work around it before then).
  h.advance(BLOCK_MS + 1);
  assert.equal(h.limiter.isBlocked(), false);
});

test('a 403 opens the discovery breaker (outage), so the job stops calling FRED', async () => {
  const h = harness(denied);
  const breaker = createBreaker();
  for (let i = 0; i < 5; i++) await breaker.run('fred', () => h.fred.search!('cpi', 5));
  assert.equal(breaker.isOpen('fred'), true);
  assert.equal(h.urls.length, 1);
});

test('requests are serialised and spaced at least 1 s apart (≤ 60/min)', async () => {
  const h = harness((url) => json(url.includes('observations') ? OBS : SERIES));
  await Promise.all(['A', 'B', 'C', 'D', 'E'].map((id) => h.fred.fetch(id, '2020-01-01')));
  assert.equal(h.starts.length, 10); // meta + observations each
  for (let i = 1; i < h.starts.length; i++) assert.ok(h.starts[i] - h.starts[i - 1] >= 1000, `gap ${i}: ${h.starts[i] - h.starts[i - 1]}`);
  const s = h.limiter.takeStats();
  assert.equal(s.series, 5);
  assert.equal(s['series/observations'], 5);
  assert.deepEqual(h.limiter.takeStats(), {}, 'stats reset after reading');
});

test('HTTP 429: bounded backoff (Retry-After honoured, capped), then the error surfaces as retryable', async () => {
  let n = 0;
  const h = harness(() => (n++ < 10 ? json({ error_code: 429 }, 429, n === 1 ? { 'retry-after': '7' } : {}) : json(SERIES)));
  await assert.rejects(h.fred.search!('cpi', 5), (e: unknown) => e instanceof ProviderError && e.retryable && e.status === 429);
  // http.ts retries twice → three attempts in total; no unbounded loop.
  assert.equal(h.urls.length, 3);
  const gaps = h.starts.slice(1).map((t, i) => t - h.starts[i]);
  assert.ok(gaps[0] >= 7000, `Retry-After honoured (${gaps[0]})`);
  assert.ok(gaps[1] >= BACKOFF_429_MS[1], `escalating backoff (${gaps[1]})`);
  assert.ok(Math.max(...h.sleeps) <= MAX_BACKOFF_MS);
  assert.equal(h.limiter.takeStats().http429, 3);
});

test('a huge Retry-After is capped', async () => {
  let n = 0;
  const h = harness(() => (n++ === 0 ? json({}, 429, { 'retry-after': '86400' }) : json(SERIES)));
  const r = await h.fred.search!('cpi', 5);
  assert.equal(r.length, 1);
  assert.ok(Math.max(...h.sleeps) <= MAX_BACKOFF_MS);
});

test('missing values stay null; the API key never appears in errors', async () => {
  const h = harness((url) => json(url.includes('observations') ? OBS : SERIES));
  const d = await h.fred.fetch('CPIAUCSL', '2020-01-01');
  assert.deepEqual(d.observations, [{ date: '2026-09-01', value: 330.1 }, { date: '2026-10-01', value: null }]);
  const bad = harness(() => new Response('boom https://api.stlouisfed.org/fred/series/search?search_text=x&api_key=k3y', { status: 500 }));
  await assert.rejects(bad.fred.search!('x', 1), (e: unknown) => !String((e as Error).message).includes('k3y'));
});
