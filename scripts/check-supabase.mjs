/**
 * Verifies EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY from apps/mobile/.env.
 * Does not print secrets.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '../apps/mobile/.env');

function loadEnv(path) {
  const out = {};
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const env = loadEnv(envPath);
const url = (env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const anonKey =
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

if (!url || !anonKey) {
  console.error(
    'Missing EXPO_PUBLIC_SUPABASE_URL and anon key in apps/mobile/.env (use EXPO_PUBLIC_SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_KEY)'
  );
  process.exit(1);
}

const healthUrl = `${url}/auth/v1/health`;
const res = await fetch(healthUrl, {
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  },
});

const body = await res.text();
if (!res.ok) {
  console.error(`Supabase health check failed: HTTP ${res.status}`);
  console.error(body.slice(0, 200));
  process.exit(1);
}

console.log('Supabase OK:', res.status, healthUrl.replace(/https?:\/\/[^/]+/, '<project>'));
console.log('Next: npm run mobile → Account → Create account or Sign in, then Sync.');
