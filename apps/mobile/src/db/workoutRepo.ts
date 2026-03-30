import type { Exercise, SetLog, WorkoutSession } from '@gymbros/shared';
import { getDb } from './database';

function rowToExercise(r: Record<string, unknown>): Exercise {
  return {
    id: r.id as string,
    name: r.name as string,
    muscleGroup: r.muscle_group as Exercise['muscleGroup'],
    equipment: (r.equipment as string) ?? undefined,
    isCustom: Boolean(r.is_custom),
    createdAt: r.created_at as string,
  };
}

function rowToSession(r: Record<string, unknown>): WorkoutSession {
  return {
    id: r.id as string,
    startedAt: r.started_at as string,
    endedAt: (r.ended_at as string) ?? null,
    notes: (r.notes as string) ?? null,
    perceivedExertion:
      r.perceived_exertion != null ? Number(r.perceived_exertion) : null,
    source: (r.source as WorkoutSession['source']) ?? 'phone',
  };
}

function rowToSet(r: Record<string, unknown>): SetLog {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    exerciseId: r.exercise_id as string,
    orderIndex: Number(r.order_index),
    reps: r.reps != null ? Number(r.reps) : null,
    weightKg: r.weight_kg != null ? Number(r.weight_kg) : null,
    durationSec: r.duration_sec != null ? Number(r.duration_sec) : null,
    rpe: r.rpe != null ? Number(r.rpe) : null,
  };
}

export function listExercises(): Exercise[] {
  const d = getDb();
  const rows = d.getAllSync<Record<string, unknown>>(
    'SELECT * FROM exercises ORDER BY is_custom ASC, name ASC'
  );
  return rows.map(rowToExercise);
}

export function createExercise(
  name: string,
  muscleGroup: Exercise['muscleGroup'],
  equipment?: string
): Exercise {
  const d = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  d.runSync(
    `INSERT INTO exercises (id, name, muscle_group, equipment, is_custom, created_at, dirty)
     VALUES (?, ?, ?, ?, 1, ?, 1)`,
    [id, name, muscleGroup, equipment ?? null, now]
  );
  return {
    id,
    name,
    muscleGroup,
    equipment,
    isCustom: true,
    createdAt: now,
  };
}

export function listSessions(limit = 50): WorkoutSession[] {
  const d = getDb();
  const rows = d.getAllSync<Record<string, unknown>>(
    'SELECT * FROM workout_sessions ORDER BY started_at DESC LIMIT ?',
    [limit]
  );
  return rows.map(rowToSession);
}

export function getActiveSession(): WorkoutSession | null {
  const d = getDb();
  const r = d.getFirstSync<Record<string, unknown>>(
    'SELECT * FROM workout_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
  );
  return r ? rowToSession(r) : null;
}

export function startSession(source: WorkoutSession['source'] = 'phone'): WorkoutSession {
  const d = getDb();
  const active = getActiveSession();
  if (active) return active;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  d.runSync(
    `INSERT INTO workout_sessions (id, started_at, ended_at, notes, perceived_exertion, source, dirty)
     VALUES (?, ?, NULL, NULL, NULL, ?, 1)`,
    [id, now, source]
  );
  return {
    id,
    startedAt: now,
    endedAt: null,
    notes: null,
    perceivedExertion: null,
    source,
  };
}

export function endSession(
  sessionId: string,
  notes?: string | null,
  perceivedExertion?: number | null
): void {
  const d = getDb();
  const ended = new Date().toISOString();
  d.runSync(
    `UPDATE workout_sessions SET ended_at = ?, notes = COALESCE(?, notes),
     perceived_exertion = COALESCE(?, perceived_exertion), dirty = 1 WHERE id = ?`,
    [ended, notes ?? null, perceivedExertion ?? null, sessionId]
  );
}

export function listSetsForSession(sessionId: string): SetLog[] {
  const d = getDb();
  const rows = d.getAllSync<Record<string, unknown>>(
    'SELECT * FROM set_logs WHERE session_id = ? ORDER BY order_index ASC',
    [sessionId]
  );
  return rows.map(rowToSet);
}

export function addSet(
  sessionId: string,
  exerciseId: string,
  input: {
    reps?: number | null;
    weightKg?: number | null;
    durationSec?: number | null;
    rpe?: number | null;
  }
): SetLog {
  const d = getDb();
  const id = crypto.randomUUID();
  const maxRow = d.getFirstSync<{ m: number | null }>(
    'SELECT MAX(order_index) as m FROM set_logs WHERE session_id = ? AND exercise_id = ?',
    [sessionId, exerciseId]
  );
  const orderIndex = (maxRow?.m ?? -1) + 1;
  d.runSync(
    `INSERT INTO set_logs (id, session_id, exercise_id, order_index, reps, weight_kg, duration_sec, rpe, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      id,
      sessionId,
      exerciseId,
      orderIndex,
      input.reps ?? null,
      input.weightKg ?? null,
      input.durationSec ?? null,
      input.rpe ?? null,
    ]
  );
  return {
    id,
    sessionId,
    exerciseId,
    orderIndex,
    reps: input.reps ?? null,
    weightKg: input.weightKg ?? null,
    durationSec: input.durationSec ?? null,
    rpe: input.rpe ?? null,
  };
}

export function getExerciseById(id: string): Exercise | null {
  const d = getDb();
  const r = d.getFirstSync<Record<string, unknown>>(
    'SELECT * FROM exercises WHERE id = ?',
    [id]
  );
  return r ? rowToExercise(r) : null;
}

/** All sets for an exercise excluding a session (for PR check). */
export function listSetsForExerciseBeforeSession(
  exerciseId: string,
  excludeSessionId: string
): Pick<SetLog, 'weightKg' | 'reps'>[] {
  const d = getDb();
  const rows = d.getAllSync<Record<string, unknown>>(
    `SELECT weight_kg, reps FROM set_logs sl
     JOIN workout_sessions ws ON ws.id = sl.session_id
     WHERE sl.exercise_id = ? AND sl.session_id != ? AND ws.ended_at IS NOT NULL`,
    [exerciseId, excludeSessionId]
  );
  return rows.map((r) => ({
    weightKg: r.weight_kg != null ? Number(r.weight_kg) : null,
    reps: r.reps != null ? Number(r.reps) : null,
  }));
}

export function sessionVolumeKg(sessionId: string): number {
  const d = getDb();
  const row = d.getFirstSync<{ v: number | null }>(
    `SELECT COALESCE(SUM(COALESCE(reps,0) * COALESCE(weight_kg,0)), 0) as v
     FROM set_logs WHERE session_id = ?`,
    [sessionId]
  );
  return Number(row?.v ?? 0);
}

export function listDirtyRows(): {
  exercises: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  sets: Record<string, unknown>[];
} {
  const d = getDb();
  return {
    exercises: d.getAllSync('SELECT * FROM exercises WHERE dirty = 1'),
    sessions: d.getAllSync('SELECT * FROM workout_sessions WHERE dirty = 1'),
    sets: d.getAllSync('SELECT * FROM set_logs WHERE dirty = 1'),
  };
}

export function markSynced(
  table: 'exercises' | 'workout_sessions' | 'set_logs',
  localId: string,
  remoteId: string
): void {
  const d = getDb();
  d.runSync(`UPDATE ${table} SET remote_id = ?, dirty = 0 WHERE id = ?`, [remoteId, localId]);
}

/** Recent completed sessions for AI / summary (last N). */
export function recentSessionsForContext(limit = 8): {
  session: WorkoutSession;
  sets: SetLog[];
  exerciseNames: Record<string, string>;
}[] {
  const d = getDb();
  const sessions = d.getAllSync<Record<string, unknown>>(
    `SELECT * FROM workout_sessions WHERE ended_at IS NOT NULL
     ORDER BY ended_at DESC LIMIT ?`,
    [limit]
  );
  const exercises = listExercises();
  const nameById = Object.fromEntries(exercises.map((e) => [e.id, e.name]));
  return sessions.map((row) => {
    const session = rowToSession(row);
    const sets = listSetsForSession(session.id);
    return { session, sets, exerciseNames: nameById };
  });
}
