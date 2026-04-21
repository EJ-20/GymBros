# GymBros

GymBros is a mobile-first workout tracker with:

- **Offline-first logging** (SQLite on device)
- **Cloud sync** (Supabase)
- **Social comparison** in the Leadership tab (friends + benchmark stats)
- **AI coaching** powered by OpenAI through a Supabase Edge Function

This repository is a monorepo containing the mobile app, marketing website, shared TypeScript packages, and backend database/function code.

## Table of contents

- [Project overview](#project-overview)
- [Technology stack](#technology-stack)
- [Repository structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Running the apps](#running-the-apps)
- [Supabase setup](#supabase-setup)
- [AI coach setup (optional)](#ai-coach-setup-optional)
- [Data model and sync behavior](#data-model-and-sync-behavior)
- [Utility scripts](#utility-scripts)
- [Deployment](#deployment)
- [Watch companion notes](#watch-companion-notes)
- [Troubleshooting](#troubleshooting)
- [Security notes](#security-notes)
- [License](#license)

## Project overview

### What GymBros solves

GymBros is designed for people who want to track training consistently even with spotty internet. Workouts are logged locally first, then synced to Supabase when the user chooses to sync.

### Core product areas

- **Workout logging:** sessions, sets, exercises, routines/templates
- **History:** local and synced session history
- **Leadership:** friend comparison and benchmark-focused statistics
- **Coach:** conversational AI training guidance
- **Health tab:** daily health snapshot surfaces (with watch/bridge-oriented support in progress)

## Technology stack

### Frontend / apps

- **Mobile app:** Expo + React Native + TypeScript + Expo Router  
  (`apps/mobile`, Expo SDK `~54.0.0`, React Native `0.81.5`, React `19.1.0`)
- **Marketing site:** Vite static site (`apps/web`, Vite `^6.3.5`)

### Data / backend

- **Database + Auth + API:** Supabase (Postgres + Auth + PostgREST)
- **Row-level security:** managed via SQL migrations in `supabase/migrations`
- **AI coach service:** Supabase Edge Function (Deno runtime) calling OpenAI Chat Completions

### Shared package

- **`@gymbros/shared`**: shared types/schemas/helpers used across app code (`packages/shared`)
- **Validation:** Zod (`zod`)

### Storage details

- **Native (iOS/Android):** `expo-sqlite`
- **Web runtime:** `sql.js` (WASM) fallback path for workout storage behavior

## Repository structure

```text
.
|-- apps
|   |-- mobile                # Expo React Native app
|   `-- web                   # Vite marketing site
|-- packages
|   `-- shared                # Shared TypeScript + Zod schemas/helpers
|-- scripts
|   |-- check-supabase.mjs    # Validate Supabase URL/key health
|   `-- create-test-user.mjs  # Create confirmed test user via Admin API
|-- supabase
|   |-- migrations            # Postgres schema + RLS + RPCs
|   `-- functions/ai-coach    # Edge function for AI coach
`-- .github/workflows
    `-- deploy-web.yml        # GitHub Pages deployment for apps/web
```

## Prerequisites

- **Node.js 20.19+** (Expo SDK 54 requirement)
- **npm** (workspaces are used from repo root)
- **Expo Go** matching SDK 54 (for local device testing)
- **Supabase CLI** (recommended for migrations and function deployment)

## Quick start

From the repository root:

```bash
npm install
cp .env.example apps/mobile/.env
```

Populate the copied env file with your Supabase project URL and anon key, then:

```bash
npm run check-supabase
npm run mobile
```

If you only need the marketing site:

```bash
npm run web
```

## Environment variables

Reference file: [`.env.example`](.env.example)

### Mobile app variables (required)

| Variable | Required | Purpose |
|----------|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL used by the client app |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anon key used by the client app |
| `EXPO_PUBLIC_SUPABASE_KEY` | No (alias) | Alternate env name accepted by app code |

### Local tooling variables (optional)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Direct Postgres connection for SQL tools (not used by mobile app) |
| `SUPABASE_URL` | Used by `scripts/create-test-user.mjs` |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for Admin API test user creation |
| `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` | Optional defaults for test user script |

## Running the apps

### Mobile app (`apps/mobile`)

Start options:

```bash
npm run mobile                 # alias for workspace start (LAN mode)
npm run start --workspace=apps/mobile
npm run start:tunnel --workspace=apps/mobile
npm run android --workspace=apps/mobile
npm run ios --workspace=apps/mobile
npm run web --workspace=apps/mobile
```

Lint:

```bash
npm run lint
```

### Marketing site (`apps/web`)

```bash
npm run web        # vite dev server, default http://localhost:5174
npm run web:build  # outputs static site at apps/web/dist
```

## Supabase setup

### 1) Get API values from dashboard

In Supabase dashboard:

- **Project Settings -> API -> Project URL** -> `EXPO_PUBLIC_SUPABASE_URL`
- **Project Settings -> API -> anon public key** -> `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Use only the **anon** key in the mobile app. Never use `service_role` in client code.

### 2) Link and apply schema migrations

From repository root:

```bash
supabase link
supabase db push
```

If you are applying manually in SQL Editor, run migration files in filename order from [`supabase/migrations`](supabase/migrations):

1. `20250330000000_initial.sql`
2. `20250330100000_workout_templates.sql`
3. `20250330200000_global_benchmarks.sql`
4. `20250330300000_benchmark_demographics.sql`
5. `20250330400000_weight_unit.sql`
6. `20260330120000_compare_search_and_stats.sql`
7. `20260410120000_exercise_tracking_and_set_distance.sql`

### 3) Configure email auth for app sign-up

In Supabase:

1. **Authentication -> Providers -> Email**: enable Email provider.
2. Decide confirmation behavior:
   - For fast local iteration: disable email confirmation.
   - For production-like flow: keep confirmation enabled and verify via email.

## AI coach setup (optional)

The AI coach is a Supabase Edge Function in `supabase/functions/ai-coach`.

Set secrets and deploy:

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set OPENAI_MODEL=gpt-4o-mini
supabase functions deploy ai-coach
```

Notes:

- The function expects authenticated requests (JWT).
- Edge runtime provides `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- If `OPENAI_API_KEY` is missing, the function returns `503` with `AI not configured on server`.

## Data model and sync behavior

### Main entities

- `profiles`
- `exercises`
- `workout_sessions`
- `set_logs`
- `workout_templates` (routines)
- friend/social comparison tables and RPC-backed stats

### Sync model (mobile)

- App writes to local SQLite first.
- **Account -> Sync (push + pull)**:
  1. Pushes local dirty rows
  2. Pulls latest remote rows
  3. Merges into local store
- Dirty local rows are protected from being overwritten during pull until push succeeds.

### Web storage caveat

On web, workout storage uses `sql.js` (WASM loaded from `sql.js.org`) due to `expo-sqlite` web-worker/WASM limitations. Native iOS/Android still use `expo-sqlite`.

## Utility scripts

### `npm run check-supabase`

Runs `scripts/check-supabase.mjs`:

- Reads `apps/mobile/.env`
- Validates URL/key presence
- Calls `GET <project>/auth/v1/health`
- Does not print secrets

### `npm run create-test-user`

Runs `scripts/create-test-user.mjs`:

- Uses Supabase Admin API to create a confirmed email/password user
- Requires:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Optional:
  - `TEST_USER_EMAIL`
  - `TEST_USER_PASSWORD`

## Deployment

### Marketing site (GitHub Pages)

Deployment workflow: [`.github/workflows/deploy-web.yml`](.github/workflows/deploy-web.yml)

- Trigger: push to `main` (plus manual dispatch)
- Build command: `npm run build --workspace=apps/web`
- Artifact: `apps/web/dist`
- Base path is injected with `VITE_BASE_PATH=/<repo-name>/` for project pages hosting

### Backend deployment

- **Schema:** `supabase db push`
- **Edge function:** `supabase functions deploy ai-coach`

## Watch companion notes

Watch/health integration planning and bridge usage live in [apps/mobile/WATCH.md](apps/mobile/WATCH.md), including:

- health snapshot payload shape
- deep links (`gymbros://workout/start`, `gymbros://workout/active`)
- platform implementation notes for Apple Watch / Wear OS

## Troubleshooting

- **Missing schema errors** (for example table not found in API cache): run `supabase db push` and retry sync after a short delay.
- **Expo app cannot connect to Supabase:** verify `.env` values and run `npm run check-supabase`.
- **Web first load fails for workout storage:** ensure internet access to load sql.js WASM.
- **Sign-up blocked in dev:** check Email provider/rate limits in Supabase Auth settings.

## Security notes

- Never commit real `.env` files or secrets.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client/mobile code.
- Use anon key only in public/mobile runtime.

## License

Private / your choice.
