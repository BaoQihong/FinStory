// Credentials for the research harness. Reuses the project's .env.local reader
// (scripts/lib/env-file.mjs). Values are never printed; reports carry only a
// key fingerprint (first 12 hex of sha256, the same convention as D-035).
import { createHash } from 'node:crypto';
import { readEnv } from '../../../scripts/lib/env-file.mjs';

export type ArliEnv = { baseUrl: string; apiKey: string; productionModel: string };

export function arliEnv(): ArliEnv {
  const env = readEnv() as Record<string, string | undefined>;
  const missing = ['ARLI_BASE_URL', 'ARLI_API_KEY', 'ARLI_MODEL'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`missing in .env.local: ${missing.join(', ')}`);
  return { baseUrl: env.ARLI_BASE_URL!.replace(/\/$/, ''), apiKey: env.ARLI_API_KEY!, productionModel: env.ARLI_MODEL! };
}

export function fredKey(): string | undefined {
  return (readEnv() as Record<string, string | undefined>).FRED_API_KEY;
}

export const fingerprint = (key: string) => createHash('sha256').update(key).digest('hex').slice(0, 12);

/** Remove any occurrence of the given secrets (and bearer tokens) from text. */
export function sanitize(text: string, secrets: string[]): string {
  let t = text;
  for (const s of secrets) if (s && s.length >= 8) t = t.split(s).join('[REDACTED]');
  return t.replace(/Bearer\s+[A-Za-z0-9._-]{12,}/g, 'Bearer [REDACTED]');
}
