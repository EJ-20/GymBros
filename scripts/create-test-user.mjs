#!/usr/bin/env node
/**
 * Creates a confirmed email/password user via Supabase Auth Admin API.
 * Requires the service role key (Dashboard → Project Settings → API → service_role secret).
 *
 * Usage:
 *   export SUPABASE_URL="https://xxx.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
 *   node scripts/create-test-user.mjs
 *
 * Optional: TEST_USER_EMAIL, TEST_USER_PASSWORD (defaults below).
 */

const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.TEST_USER_EMAIL || 'test@gymbros.local';
const password = process.env.TEST_USER_PASSWORD || 'testtest12';

if (!url || !serviceKey) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Get the service role key from Supabase Dashboard → Project Settings → API (keep it secret; never put it in the mobile app).'
  );
  process.exit(1);
}

const endpoint = `${url}/auth/v1/admin/users`;

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email,
    password,
    email_confirm: true,
  }),
});

const body = await res.json().catch(() => ({}));

if (res.ok) {
  console.log('User created and email confirmed.');
  console.log('  Email:', email);
  console.log('  Password:', password);
  console.log('  Sign in with these in the GymBros Account screen.');
  process.exit(0);
}

const errText = JSON.stringify(body);
if (
  (res.status === 422 || res.status === 409) &&
  /already|registered|exists|duplicate/i.test(errText)
) {
  console.log('User already exists — sign in with:');
  console.log('  Email:', email);
  console.log('  Password:', password);
  process.exit(0);
}

console.error('Failed:', res.status, body);
process.exit(1);
