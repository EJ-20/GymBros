import type { HealthWatchPayload } from '@gymbros/shared';
import { getDb } from '@/src/db/database';
import type { DbSync } from '@/src/db/schema';

export type HealthDailySnapshot = {
  day: string;
  steps: number | null;
  activeEnergyKcal: number | null;
  restingHeartRateBpm: number | null;
  avgHeartRateBpm: number | null;
  sleepMinutes: number | null;
  exerciseMinutes: number | null;
  distanceMeters: number | null;
  vo2Max: number | null;
  bloodOxygenPercent: number | null;
  respiratoryRate: number | null;
  hrvSdnnMs: number | null;
  bodyMassKg: number | null;
  source: 'watch' | 'phone' | 'import';
  updatedAt: string;
  extra: Record<string, unknown> | null;
};

type HealthRow = {
  day: string;
  steps: number | null;
  active_energy_kcal: number | null;
  resting_hr: number | null;
  avg_hr: number | null;
  sleep_minutes: number | null;
  exercise_minutes: number | null;
  distance_m: number | null;
  vo2_max: number | null;
  spo2: number | null;
  respiratory_rate: number | null;
  hrv_ms: number | null;
  body_mass_kg: number | null;
  source: string;
  updated_at: string;
  extra_json: string | null;
};

function parseExtra(json: string | null): Record<string, unknown> | null {
  if (json == null || json === '') return null;
  try {
    const v = JSON.parse(json) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function rowToSnapshot(r: HealthRow): HealthDailySnapshot {
  const src = r.source === 'phone' || r.source === 'import' ? r.source : 'watch';
  return {
    day: r.day,
    steps: r.steps,
    activeEnergyKcal: r.active_energy_kcal,
    restingHeartRateBpm: r.resting_hr,
    avgHeartRateBpm: r.avg_hr,
    sleepMinutes: r.sleep_minutes,
    exerciseMinutes: r.exercise_minutes,
    distanceMeters: r.distance_m,
    vo2Max: r.vo2_max,
    bloodOxygenPercent: r.spo2,
    respiratoryRate: r.respiratory_rate,
    hrvSdnnMs: r.hrv_ms,
    bodyMassKg: r.body_mass_kg,
    source: src,
    updatedAt: r.updated_at,
    extra: parseExtra(r.extra_json),
  };
}

function pick<T extends keyof HealthWatchPayload>(
  payload: HealthWatchPayload,
  key: T
): HealthWatchPayload[T] | undefined {
  return payload[key];
}

function mergeRow(
  existing: HealthRow | null,
  payload: HealthWatchPayload,
  nowIso: string
): HealthRow {
  const base: HealthRow = existing ?? {
    day: payload.day,
    steps: null,
    active_energy_kcal: null,
    resting_hr: null,
    avg_hr: null,
    sleep_minutes: null,
    exercise_minutes: null,
    distance_m: null,
    vo2_max: null,
    spo2: null,
    respiratory_rate: null,
    hrv_ms: null,
    body_mass_kg: null,
    source: 'watch',
    updated_at: nowIso,
    extra_json: null,
  };

  const out: HealthRow = { ...base, day: payload.day, updated_at: nowIso };

  if (pick(payload, 'steps') !== undefined) out.steps = payload.steps ?? null;
  if (pick(payload, 'activeEnergyKcal') !== undefined)
    out.active_energy_kcal = payload.activeEnergyKcal ?? null;
  if (pick(payload, 'restingHeartRateBpm') !== undefined)
    out.resting_hr = payload.restingHeartRateBpm ?? null;
  if (pick(payload, 'avgHeartRateBpm') !== undefined) out.avg_hr = payload.avgHeartRateBpm ?? null;
  if (pick(payload, 'sleepMinutes') !== undefined)
    out.sleep_minutes = payload.sleepMinutes ?? null;
  if (pick(payload, 'exerciseMinutes') !== undefined)
    out.exercise_minutes = payload.exerciseMinutes ?? null;
  if (pick(payload, 'distanceMeters') !== undefined)
    out.distance_m = payload.distanceMeters ?? null;
  if (pick(payload, 'vo2Max') !== undefined) out.vo2_max = payload.vo2Max ?? null;
  if (pick(payload, 'bloodOxygenPercent') !== undefined)
    out.spo2 = payload.bloodOxygenPercent ?? null;
  if (pick(payload, 'respiratoryRate') !== undefined)
    out.respiratory_rate = payload.respiratoryRate ?? null;
  if (pick(payload, 'hrvSdnnMs') !== undefined) out.hrv_ms = payload.hrvSdnnMs ?? null;
  if (pick(payload, 'bodyMassKg') !== undefined) out.body_mass_kg = payload.bodyMassKg ?? null;
  if (pick(payload, 'source') !== undefined) out.source = payload.source ?? 'watch';

  if (pick(payload, 'extra') !== undefined) {
    const prev = parseExtra(base.extra_json) ?? {};
    const next = payload.extra ?? {};
    const merged = { ...prev, ...next };
    out.extra_json = Object.keys(merged).length ? JSON.stringify(merged) : null;
  }

  return out;
}

function persistRow(db: DbSync, row: HealthRow): void {
  db.runSync(
    `INSERT OR REPLACE INTO health_daily (
      day, steps, active_energy_kcal, resting_hr, avg_hr, sleep_minutes, exercise_minutes,
      distance_m, vo2_max, spo2, respiratory_rate, hrv_ms, body_mass_kg, source, updated_at, extra_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.day,
      row.steps,
      row.active_energy_kcal,
      row.resting_hr,
      row.avg_hr,
      row.sleep_minutes,
      row.exercise_minutes,
      row.distance_m,
      row.vo2_max,
      row.spo2,
      row.respiratory_rate,
      row.hrv_ms,
      row.body_mass_kg,
      row.source,
      row.updated_at,
      row.extra_json,
    ]
  );
}

export function mergeHealthDaily(payload: HealthWatchPayload): void {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const existing = db.getFirstSync<HealthRow>(
    'SELECT * FROM health_daily WHERE day = ?',
    [payload.day]
  );
  persistRow(db, mergeRow(existing, payload, nowIso));
}

export function listRecentHealthDaily(limit: number): HealthDailySnapshot[] {
  const db = getDb();
  const rows = db.getAllSync<HealthRow>(
    'SELECT * FROM health_daily ORDER BY day DESC LIMIT ?',
    [limit]
  );
  return rows.map(rowToSnapshot);
}

export function localCalendarDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
