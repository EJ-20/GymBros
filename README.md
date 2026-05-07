# GymBros

Mobile-first gym tracker: **local SQLite** workout logging, **Supabase** sync, **Leadership** (friends + cohort benchmarks), and an **AI coach** (OpenAI via Supabase Edge Function). Includes a small **Vite** marketing site under `apps/web`.

## Documentation map

| Doc | Contents |
|-----|----------|
| **[README.md](README.md)** (this file) | Monorepo overview, Supabase setup, migrations order, scripts |
| **[apps/mobile/README.md](apps/mobile/README.md)** | Expo app layout, routes, env, navigation |
| **[apps/mobile/WATCH.md](apps/mobile/WATCH.md)** | Watch / health metrics bridge, deep links |
| **[.env.example](.env.example)** | Environment variables (copy for local dev) |

## Structure

- [apps/web](apps/web) — Marketing / landing site (Vite static HTML + CSS)
- [apps/mobile](apps/mobile) — Expo (React Native) app — **see [apps/mobile/README.md](apps/mobile/README.md)**
- [packages/shared](packages/shared) — Shared TypeScript types, Zod schemas, PR helpers
- [supabase/migrations](supabase/migrations) — Postgres schema, RLS, RPCs (friends, benchmarks, profile search)
- [supabase/functions/ai-coach](supabase/functions/ai-coach) — Deno edge function calling OpenAI

## Marketing site

Landing page for the project (features, use cases, stack). From the repo root after `npm install`:

```bash
npm run web        # dev server (default http://localhost:5174)
npm run web:build  # static output in apps/web/dist — deploy to any static host
```

## Prerequisites

- **Node.js 20.19+** (required by Expo SDK 54)
- **Expo Go** on your phone must match **SDK 54** (update from the store if the app complains)
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
npm run mobile
# or: npm run start --workspace=apps/mobile
```

**Web (Expo web):** Workouts use [sql.js](https://sql.js.org/) (WASM loaded from `sql.js.org`) because the `expo-sqlite` npm package does not ship `wa-sqlite.wasm`, so the browser never loads `expo-sqlite`’s broken web worker. **iOS/Android** still use `expo-sqlite` on device. The first web load needs network access to fetch the WASM file.

**Routines:** Saved in `workout_templates` (exercise order). Create/edit under **Routines** (stack route), **Manage routines** from the Workout tab, or **Save as routine** during an active session. They sync with **Account → Sync** once the `workout_templates` table exists in Supabase.

**History:** Completed sessions list lives under the **History** tab; tapping a session opens **Workout details** (`session-detail`).

**Sync:** Account → **Sync (push + pull)** uploads dirty local rows, then downloads `exercises`, `workout_sessions`, `set_logs`, and `workout_templates` from Supabase and merges them into SQLite. Local rows still marked dirty (unsent changes) are not overwritten on pull until you sync again after a successful push.

## Supabase setup

### What you need from the dashboard

Copy into `apps/mobile/.env`:

| Variable | Where in Supabase |
|----------|-------------------|
| `EXPO_PUBLIC_SUPABASE_URL` | **Project Settings** → **API** → **Project URL** |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | **Project Settings** → **API** → **anon public** key |

Use the **anon** key in the app only — never the **service_role** key.

### Postgres connection string (SQL clients, not the Expo app)

The mobile app does **not** use this URI; it uses the HTTP URL and anon key above. Use the connection string for **psql**, GUI clients, or other direct Postgres tools.

| Field | Value |
|-------|--------|
| Host | `db.<project-ref>.supabase.co` (from **Project Settings** → **Database**) |
| Port | `5432` |
| Database | `postgres` |
| User | `postgres` |
| Password | **Database password** from the same screen (set or reset if you do not have it) |

URI form (replace `[YOUR-PASSWORD]` and the host with your project):

```text
postgresql://postgres:[YOUR-PASSWORD]@db.<project-ref>.supabase.co:5432/postgres
```

Optional: set `DATABASE_URL` in a **local** `.env` (never commit the real password) — see [`.env.example`](.env.example).

### Cursor: Supabase Agent Skills (optional)

For Postgres-focused help in the editor, install [Supabase agent skills](https://github.com/supabase/agent-skills) from the repo root:

```bash
npx skills add supabase/agent-skills --yes
```

This adds skills under `.agents/skills/` (listed in `.gitignore` so passwords and vendored copies stay out of git; reinstall on a new machine with the same command).

### Email sign-up (so you can test “Create account” in the app)

1. **Authentication** → **Providers** → **Email** → enable it (toggle on).
2. **Authentication** → **Providers** → **Email**:
   - For the quickest local loop: turn **off** “Confirm email” (users are signed in immediately after sign-up).
   - For production-like behavior: leave **Confirm email** **on**; after **Create account**, open the link in the email Supabase sends, then use **Sign in** in the app.

Optional: **Authentication** → **Rate limits** — relax or disable for dev if sign-up is throttled.

### Database and project link

**Sync and social features only work after this schema exists on your project.** If you skip it, the app may show PostgREST errors like *could not find the table `public.workout_sessions` in the schema cache*.

1. Create a project (if you have not already) and link the repo: `supabase link` (needs [Supabase CLI](https://supabase.com/docs/guides/cli) login).
2. Apply migrations from the repo root (**filename order** preserves dependencies):

   ```bash
   supabase db push
   ```

   **Or without the CLI:** **SQL Editor** → run each file in [supabase/migrations](supabase/migrations) in **lexicographic filename order**:

   | Migration file | Purpose |
   |----------------|---------|
   | `20250330000000_initial.sql` | Profiles, exercises (cloud sync shape), sessions, sets, friendships, `friend_compare_stats` RPC |
   | `20250330100000_workout_templates.sql` | Routine templates table |
   | `20250330200000_global_benchmarks.sql` | Benchmark columns + `global_benchmark_percentiles` RPC |
   | `20250330300000_benchmark_demographics.sql` | Sex, height, training years for cohorts |
   | `20250330400000_weight_unit.sql` | Profile weight unit preference |
   | `20260330120000_compare_search_and_stats.sql` | `my_training_stats`, `search_profiles_for_contacts` (Leadership tab) |
   | `20260410120000_exercise_tracking_and_set_distance.sql` | Exercise tracking modes, set `distance_m` |

3. If tables already exist but the API still complains, wait a minute or in **Project Settings** → **API** use options to refresh/restart if your plan shows them; usually a fresh `db push` is enough.

### AI coach (optional)

Deploy the Edge function and secrets:

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set OPENAI_MODEL=gpt-4o-mini
supabase functions deploy ai-coach
```

Keep JWT verification enabled (default). The Edge runtime provides `SUPABASE_URL` and `SUPABASE_ANON_KEY` automatically.

### Optional: script-created test user

If you prefer not to use the in-app sign-up flow, you can create a user with the Admin API using `npm run create-test-user` and `SUPABASE_SERVICE_ROLE_KEY` — see [scripts/create-test-user.mjs](scripts/create-test-user.mjs). Do not put the service role key in the mobile app.

## Repo scripts (root `package.json`)

| Script | Command |
|--------|---------|
| `npm run mobile` | Start Expo (`apps/mobile`) |
| `npm run web` | Vite dev server for marketing site |
| `npm run web:build` | Static web build |
| `npm run lint` | Lint mobile app |
| `npm run create-test-user` | Create test user (needs service role in env) |
| `npm run check-supabase` | Check Supabase connectivity (see script) |

## Watch

See [apps/mobile/WATCH.md](apps/mobile/WATCH.md).

## License

Private / your choice.
