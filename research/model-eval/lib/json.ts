// JSON extraction used by evaluators. Reports HOW the JSON was found so code
// fences and surrounding prose are measured, not silently tolerated.
export type JsonResult = { ok: true; value: unknown; mode: 'direct' | 'fenced' | 'embedded' } | { ok: false; error: string };

export function extractJson(text: string): JsonResult {
  const t = text.trim();
  try {
    return { ok: true, value: JSON.parse(t), mode: 'direct' };
  } catch {
    /* fall through */
  }
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) {
    try {
      return { ok: true, value: JSON.parse(fence[1]), mode: 'fenced' };
    } catch {
      /* fall through */
    }
  }
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try {
      return { ok: true, value: JSON.parse(t.slice(s, e + 1)), mode: 'embedded' };
    } catch (err) {
      return { ok: false, error: `embedded object did not parse: ${(err as Error).message.slice(0, 120)}` };
    }
  }
  return { ok: false, error: 'no JSON object found' };
}

/** Text between <tag> and </tag> (last occurrence), or null. */
export function tagged(text: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi');
  let m: RegExpExecArray | null;
  let last: string | null = null;
  while ((m = re.exec(text))) last = m[1];
  return last;
}
