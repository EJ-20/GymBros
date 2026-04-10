# Watch companion (phase 2)

GymBros uses the same Postgres rows as the phone app. A watch app should be a thin client that talks to **Supabase** (or your API) with the user session.

## Health metrics (sleep, activity, heart rate, steps, calories, …)

Daily snapshots are stored locally in SQLite (`health_daily`) and surfaced in the mobile app under the **Health** tab.

| Metric | Payload field (JS) | Notes |
|--------|-------------------|--------|
| Steps | `steps` | Integer; Apple Watch often contributes via HealthKit / CMPedometer on the phone |
| Active energy (kcal) | `activeEnergyKcal` | Activity / “calories burned” style energy |
| Sleep | `sleepMinutes` | Total sleep for that calendar night → store as minutes for the **wake-up** local day, or pick one convention and stay consistent |
| Resting / average HR | `restingHeartRateBpm`, `avgHeartRateBpm` | BPM |
| Exercise minutes | `exerciseMinutes` | Apple “exercise” ring–style minutes |
| Distance | `distanceMeters` | Walk + run distance |
| VO₂ max | `vo2Max` | Optional |
| Blood oxygen | `bloodOxygenPercent` | 0–100 |
| Respiratory rate | `respiratoryRate` | e.g. breaths/min |
| HRV | `hrvSdnnMs` | SDNN or your chosen HRV type (document in `extra`) |
| Body mass | `bodyMassKg` | Optional |
| Arbitrary | `extra` | JSON object merged into `extra_json` |

**Ingest from native watch / Health bridge:** call `reportWatchHealthSnapshot(payload)` in `src/watch/WatchBridge.ts` with a `day` string `YYYY-MM-DD` (user’s local calendar) and any subset of fields. Schema: `healthWatchPayloadSchema` in `@gymbros/shared`.

**Phone-only today:** the Health tab can **Sync today’s steps** via `expo-sensors` `Pedometer` (after `expo prebuild` + dev client where needed, especially Android activity recognition).

**Cloud sync:** not wired yet; same pattern as workouts (dirty flag + Supabase table) can be added when you want multi-device history.

## Deep links (already in the mobile app)

- `gymbros://workout/start` — opens the Workout tab (start flow).
- `gymbros://workout/active` — opens the Workout tab while training.

You can trigger these from **Apple Shortcuts** on Apple Watch until a native watch UI exists.

## Suggested native scope

| Platform   | Suggested MVP                                     |
|-----------|-----------------------------------------------------|
| Apple Watch | Session timer, mark set done, quick reps/weight; HKObserverQuery / summaries → `reportWatchHealthSnapshot` |
| Wear OS   | Same workout UX; Health Connect + background jobs → phone or direct sync later |

## Implementation notes

1. **Prebuild / dev client** — Watch connectivity libraries usually require a **custom dev client** (`expo prebuild`), not Expo Go alone.
2. **Auth** — Prefer refreshing the session on the phone and passing a short-lived token, or OAuth device flow; do not embed service keys on the watch.
3. **Data** — Map watch actions to `workout_sessions` + `set_logs` with the same `client_local_id` pattern the app uses for sync.

`WatchBridge` in `src/watch/WatchBridge.ts` centralizes deep-link helpers and **health snapshot ingestion** so native code can be wired in later without changing tab routes.
