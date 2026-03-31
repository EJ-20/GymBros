import { randomUUID } from '@/src/lib/randomUUID';

/**
 * Shared DDL + seed (native uses expo-sqlite; web uses sql.js — avoids missing expo-sqlite wasm on web).
 */
export const TABLE_SCHEMA = `
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      muscle_group TEXT NOT NULL,
      equipment TEXT,
      is_custom INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      remote_id TEXT,
      dirty INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS workout_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      notes TEXT,
      perceived_exertion INTEGER,
      source TEXT NOT NULL DEFAULT 'phone',
      remote_id TEXT,
      dirty INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS set_logs (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      reps INTEGER,
      weight_kg REAL,
      duration_sec INTEGER,
      rpe INTEGER,
      remote_id TEXT,
      dirty INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES workout_sessions (id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises (id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS workout_templates (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      exercise_ids TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sets_session ON set_logs (session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_started ON workout_sessions (started_at);
`;

export type DbSync = {
  execSync: (sql: string) => void;
  runSync: (sql: string, params?: unknown[]) => unknown;
  getFirstSync: <T extends Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ) => T | null;
  getAllSync: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T[];
};

export function runInitialSetup(db: DbSync): void {
  db.execSync('PRAGMA foreign_keys = ON;');
  db.execSync(TABLE_SCHEMA);

  const seeded = db.getFirstSync<{ value: string }>(
    "SELECT value FROM sync_meta WHERE key = 'seeded_exercises'"
  );
  if (!seeded) {
    seedDefaultExercises(db);
    db.runSync("INSERT INTO sync_meta (key, value) VALUES ('seeded_exercises', '1')");
  }
}

function seedDefaultExercises(d: DbSync): void {
  const now = new Date().toISOString();
  const defaults: [string, string, string][] = [
    ['Bench press', 'chest', 'barbell'],
    ['Squat', 'legs', 'barbell'],
    ['Deadlift', 'back', 'barbell'],
    ['Overhead press', 'shoulders', 'barbell'],
    ['Pull-up', 'back', 'bodyweight'],
    ['Row', 'back', 'cable'],
    ['Leg press', 'legs', 'machine'],
    ['Romanian deadlift', 'legs', 'barbell'],
    ['Lat pulldown', 'back', 'cable'],
    ['Plank', 'core', 'bodyweight'],
  ];
  for (const [name, mg, eq] of defaults) {
    const id = randomUUID();
    d.runSync(
      `INSERT INTO exercises (id, name, muscle_group, equipment, is_custom, created_at, dirty)
       VALUES (?, ?, ?, ?, 0, ?, 0)`,
      [id, name, mg, eq, now]
    );
  }
}
