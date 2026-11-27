// Fetch the linked Supabase project's API keys via the Supabase CLI and
// write them into .env.local. Prints key TYPES only — never values.
//
// Usage (from repo root, after `supabase login` + `supabase link`):
//   node scripts/setup/supabase-keys.mjs
import { execSync } from 'node:child_process';
import { setEnv } from '../lib/env-file.mjs';

let raw;
try {
  raw = execSync('supabase projects api-keys --reveal -o json', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) {
  console.error('Supabase CLI call failed (is the CLI logged in and the project linked?).');
  console.error(String(e.stderr || '').split('\n').slice(0, 3).join('\n'));
  process.exit(1);
}

let data = JSON.parse(raw);
if (!Array.isArray(data)) data = data.keys ?? data.api_keys ?? Object.values(data).find(Array.isArray) ?? [];

const val = (k) => k.api_key ?? k.apiKey ?? k.key ?? '';
const publishable =
  data.find((k) => val(k).startsWith('sb_publishable_')) ?? data.find((k) => k.name === 'anon');
const secret =
  data.find((k) => val(k).startsWith('sb_secret_')) ?? data.find((k) => k.name === 'service_role');

const updates = {};
const describe = (k) => (val(k).startsWith('sb_') ? val(k).split('_').slice(0, 2).join('_') + '_…' : `legacy ${k.name} JWT`);

if (publishable && val(publishable)) updates.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = val(publishable);
if (secret && val(secret) && !/[·•*]/.test(val(secret))) updates.SUPABASE_SECRET_KEY = val(secret);

if (!Object.keys(updates).length) {
  console.error(`No usable keys found (${data.length} key records returned). Check the dashboard: Project Settings → API Keys.`);
  process.exit(1);
}

setEnv(updates);
if (updates.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) console.log(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: written (${describe(publishable)})`);
else console.log('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: NOT FOUND');
if (updates.SUPABASE_SECRET_KEY) console.log(`SUPABASE_SECRET_KEY: written (${describe(secret)})`);
else console.log('SUPABASE_SECRET_KEY: NOT FOUND or masked — create one in Dashboard → Project Settings → API Keys');
