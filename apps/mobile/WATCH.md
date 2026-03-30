# Watch companion (phase 2)

GymBros uses the same Postgres rows as the phone app. A watch app should be a thin client that talks to **Supabase** (or your API) with the user session.

## Deep links (already in the mobile app)

- `gymbros://workout/start` — opens the Workout tab (start flow).
- `gymbros://workout/active` — opens the Workout tab while training.

You can trigger these from **Apple Shortcuts** on Apple Watch until a native watch UI exists.

## Suggested native scope

| Platform   | Suggested MVP                                     |
|-----------|-----------------------------------------------------|
| Apple Watch | Session timer, mark set done, quick reps/weight |
| Wear OS   | Same, via Jetpack Compose + Health Connect later |

## Implementation notes

1. **Prebuild / dev client** — Watch connectivity libraries usually require a **custom dev client** (`expo prebuild`), not Expo Go alone.
2. **Auth** — Prefer refreshing the session on the phone and passing a short-lived token, or OAuth device flow; do not embed service keys on the watch.
3. **Data** — Map watch actions to `workout_sessions` + `set_logs` with the same `client_local_id` pattern the app uses for sync.

`WatchBridge` in `src/watch/WatchBridge.ts` centralizes deep-link helpers so native code can be wired in later without changing tab routes.
