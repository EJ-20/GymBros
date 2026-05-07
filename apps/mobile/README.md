# GymBros mobile app (Expo)

React Native app using **Expo SDK 54**, **expo-router** (file-based routes), and **SQLite** on device via **expo-sqlite** (native) or **sql.js** (web).

## Requirements

- **Node.js 20.19+**
- **Expo Go** matching SDK 54, or a dev client after `expo prebuild`
- Supabase project for sync, Leadership/social, benchmarks, and AI coach (see repo root [README.md](../README.md))

## Environment

Copy [../.env.example](../.env.example) to `apps/mobile/.env` (or repo root; Expo loads env from common locations).

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (never service role) |
| `EXPO_PUBLIC_SUPABASE_KEY` | Optional alias for the anon key |

## Scripts

From repo root:

```bash
npm run mobile          # Expo dev server (apps/mobile)
cd apps/mobile && npm run start
```

From `apps/mobile`: `npm run start`, `npm run ios`, `npm run android`, `npm run web`, `npm run lint`.

## Project layout

| Path | Role |
|------|------|
| `app/` | **expo-router** screens: `(tabs)/` main shell, stack routes at `app/` root |
| `app/(tabs)/` | Tab screens: `index` (Home), `health`, `workout`, `history`, `leadership`, `coach` |
| `app/_layout.tsx` | Root stack: tabs + modals (`profile`, `sign-in`, `session-detail`, etc.) |
| `src/db/` | SQLite init, `workoutRepo`, schema |
| `src/sync/` | Supabase sync engine, benchmarks, social (Leadership) |
| `src/contexts/` | Auth, units, alerts, toast |
| `src/components/` | Shared UI (e.g. keyboard avoidance helpers) |
| `src/watch/` | Deep links + health snapshot bridge — see [WATCH.md](./WATCH.md) |
| `app.config.js` | Expo config (`scheme: gymbros`, Android `softwareKeyboardLayoutMode: 'resize'`) |

## Navigation

- **Tabs** (`app/(tabs)/_layout.tsx`): bottom navigation; header shows Account shortcut.
- **Stack** (`app/_layout.tsx`): pushes over tabs — e.g. **Routines**, **Routine builder**, **Workout details** (`session-detail`), **Account** / **Edit profile**, **Sign in** / **Sign up** (often modal presentation).
- **Deep links:** `gymbros://workout/active`, `gymbros://workout/start` — see [WATCH.md](./WATCH.md).

Root stack uses `gestureEnabled` / iOS `fullScreenGestureEnabled` so system back / edge gestures work with the native stack.

## Main tabs (user-facing)

| Tab | File | Notes |
|-----|------|--------|
| Home | `(tabs)/index.tsx` | Dashboard, stats tiles link to History / Leadership |
| Health | `(tabs)/health.tsx` | Daily health metrics (`health_daily` SQLite) |
| Workout | `(tabs)/workout.tsx` | Active session, routines grid, exercise logging |
| History | `(tabs)/history.tsx` | Past sessions; tap a row → **session-detail** |
| Leadership | `(tabs)/leadership.tsx` | Friends, search, cohort benchmarks (needs Supabase + auth) |
| Coach | `(tabs)/coach.tsx` | AI coach Edge Function; composer uses footer-only keyboard avoidance on iOS |

## Local database

- **Native:** `expo-sqlite` — see `src/db/schema.ts`, `src/db/database*.ts`.
- **Web:** `sql.js` WASM (first load may fetch WASM); same repo API via `workoutRepo`.

Sync merges local SQLite with Supabase tables — see root README **Sync** section.

## Related docs

- [README.md](../README.md) — monorepo setup, Supabase migrations order, AI coach deploy
- [WATCH.md](./WATCH.md) — watch / health bridge and deep links
