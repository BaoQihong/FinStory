// Scan every git-tracked (and staged) file for credential values from
// .env.local and for common secret patterns. Also confirms sensitive
// paths are git-ignored. Prints file paths and variable NAMES only.
//
// Usage (from repo root):  node scripts/verify/secrets-scan.mjs
import { execSync } from 'node:child_process';
import { readEnv } from '../lib/env-file.mjs';

const git = (args) => execSync(`git ${args}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const env = readEnv();
let problems = 0;

// 1. Sensitive paths must be ignored.
for (const p of ['.env.local', '.env', '.vercel/project.json', 'supabase/.temp/project-ref']) {
  try {
    git(`check-ignore -q "${p}"`);
  } catch {
    problems++;
    console.log(`FAIL  ${p} is NOT git-ignored`);
  }
}

// 2. Credential values / patterns must not appear in the index.
const values = Object.entries(env).filter(([k, v]) => /KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL/.test(k) && v.length > 8);
const dbPw = (env.DATABASE_URL ?? '').match(/:\/\/[^:]+:([^@]+)@/)?.[1];
if (dbPw) values.push(['DATABASE_URL password', decodeURIComponent(dbPw)]);
const patterns = [
  ['Supabase secret/publishable key', /sb_(secret|publishable)_[A-Za-z0-9_-]{10,}/],
  ['Supabase access token', /sbp_[0-9a-f]{20,}/],
  ['JWT', /eyJhbGciOi[A-Za-z0-9_-]{10,}/],
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{10,}/],
  // Ignores template placeholders such as `:${encodeURIComponent(pw)}@` in setup scripts.
  ['Postgres URL with password', /postgres(ql)?:\/\/[^:\s/]+:(?!\$\{)[^@\s<]{6,}@/],
];

const files = git('-c core.quotepath=false ls-files --cached').trim().split('\n').filter(Boolean);
for (const f of files) {
  let content;
  try {
    content = git(`show ":${f}"`);
  } catch {
    continue;
  }
  for (const [name, v] of values) {
    if (content.includes(v)) {
      problems++;
      console.log(`FAIL  value of ${name} found in ${f}`);
    }
  }
  for (const [name, re] of patterns) {
    if (re.test(content)) {
      problems++;
      console.log(`FAIL  ${name} pattern in ${f}`);
    }
  }
}

console.log(`${problems ? 'FAIL' : 'PASS'}  secret scan — ${files.length} tracked files, ${values.length} credential values checked, ${problems} problems`);
process.exit(problems ? 1 : 0);
