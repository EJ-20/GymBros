# GymBros

Mobile-first gym tracker: local workout logging, Supabase sync, friends-only stat comparison, and an AI coach (OpenAI via Supabase Edge Function).

## Structure

- [apps/mobile](apps/mobile) — Expo (React Native) app
- [packages/shared](packages/shared) — Shared TypeScript types, Zod schemas, PR helpers
- [supabase/migrations](supabase/migrations) — Postgres schema, RLS, `friend_compare_stats` RPC
- [supabase/functions/ai-coach](supabase/functions/ai-coach) — Deno edge function calling OpenAI

## Prerequisites

- Node 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for migrations and functions)

## Mobile setup

```bash
cd /path/to/GymBros
npm install
cd apps/mobile
cp .env.example .env 2>/dev/null || cp ../../.env.example .env  # optional
```

Set environment variables (or `apps/mobile/.env` with Expo):

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Start the app:

```bash
npm run start --workspace=apps/mobile
```

## Supabase setup

1. Create a project and link the repo: `supabase link`.
2. Apply migrations: `supabase db push` (or run SQL from `supabase/migrations` in the SQL editor).
3. Enable **Email** auth (or add other providers) in the Supabase dashboard.
4. Deploy the AI function and secrets:

   ```bash
   supabase secrets set OPENAI_API_KEY=sk-...
   supabase secrets set OPENAI_MODEL=gpt-4o-mini
   supabase functions deploy ai-coach
   ```

   Keep JWT verification enabled (default) so only signed-in clients can call the function. The Edge runtime provides `SUPABASE_URL` and `SUPABASE_ANON_KEY` automatically.

## Watch

See [apps/mobile/WATCH.md](apps/mobile/WATCH.md).

## License

Private / your choice.
