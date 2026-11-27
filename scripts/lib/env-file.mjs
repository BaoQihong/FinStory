// Minimal .env.local reader/writer. Never logs values.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const ENV_PATH = new URL('../../.env.local', import.meta.url);

export function readEnv() {
  if (!existsSync(ENV_PATH)) return {};
  const out = {};
  for (const line of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/** Set or replace KEY=value lines in .env.local, preserving everything else. */
export function setEnv(updates) {
  const text = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  const lines = text.split(/\r?\n/);
  for (const [key, value] of Object.entries(updates)) {
    const idx = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
    const entry = `${key}=${value}`;
    if (idx >= 0) lines[idx] = entry;
    else lines.splice(lines.at(-1) === '' ? lines.length - 1 : lines.length, 0, entry);
  }
  writeFileSync(ENV_PATH, lines.join('\n'));
}

/** True when a value looks filled in rather than empty/placeholder. */
export const isSet = (v) => !!v && !/^(<|your|changeme|xxx|placeholder)/i.test(v);
