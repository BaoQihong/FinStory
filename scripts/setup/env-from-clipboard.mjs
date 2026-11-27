// Write a credential from the Windows clipboard into .env.local, then
// clear the clipboard. Never prints the value — keeps secrets out of chat
// transcripts and shell history.
//
// Usage (from repo root):
//   node scripts/setup/env-from-clipboard.mjs --supabase-token   # SUPABASE_ACCESS_TOKEN + `supabase login`
//   node scripts/setup/env-from-clipboard.mjs --db-password      # rebuilds DATABASE_URL
import { execSync } from 'node:child_process';
import { readEnv, setEnv } from '../lib/env-file.mjs';

const PROJECT_REF = 'gmcllutljmotushrsqka';
const POOLER_HOST = 'aws-2-us-east-1.pooler.supabase.com';
const POOLER_PORT = 6543; // transaction pooler, see D-007

const mode = process.argv[2];
if (!['--supabase-token', '--db-password'].includes(mode)) {
  console.error('Usage: node scripts/setup/env-from-clipboard.mjs --supabase-token | --db-password');
  process.exit(2);
}

const value = execSync('powershell -NoProfile -Command Get-Clipboard -Raw', { encoding: 'utf8' }).trim();
const clearClipboard = () => execSync('cmd /c "echo off | clip"');
const env = readEnv();

if (!value || /\s/.test(value)) {
  console.error('Clipboard is empty or contains whitespace — copy the value again and retry.');
  process.exit(1);
}

if (mode === '--supabase-token') {
  if (!/^sbp_[0-9a-f]{40}$/.test(value)) {
    console.error('Clipboard does not look like a Supabase access token (expected sbp_ + 40 hex chars).');
    process.exit(1);
  }
  if (value === env.SUPABASE_ACCESS_TOKEN) {
    console.error('Clipboard token is identical to the current one — generate a NEW token first.');
    process.exit(1);
  }
  setEnv({ SUPABASE_ACCESS_TOKEN: value });
  try {
    execSync(`supabase login --token ${value}`, { stdio: ['ignore', 'ignore', 'pipe'] });
    console.log('SUPABASE_ACCESS_TOKEN written to .env.local; Supabase CLI re-authenticated with it.');
  } catch (e) {
    console.log('SUPABASE_ACCESS_TOKEN written to .env.local, but `supabase login` failed:');
    console.log(String(e.stderr || '').split(value).join('***').split('\n').slice(0, 3).join('\n'));
  }
} else {
  const current = env.DATABASE_URL ?? '';
  if (current.includes(`:${encodeURIComponent(value)}@`)) {
    console.error('Clipboard password matches the current DATABASE_URL — reset the password first.');
    process.exit(1);
  }
  const url = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(value)}@${POOLER_HOST}:${POOLER_PORT}/postgres`;
  setEnv({ DATABASE_URL: url });
  console.log(`DATABASE_URL rebuilt in .env.local (password: ${value.length} chars).`);
}

clearClipboard();
console.log('Clipboard cleared.');
