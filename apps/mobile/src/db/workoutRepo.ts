import type { Exercise, SetLog, WorkoutSession, WorkoutTemplate } from '@gymbros/shared';
import { randomUUID } from '@/src/lib/randomUUID';
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
  const id = randomUUID();
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

export function countCompletedSessions(): number {
  const d = getDb();
  const r = d.getFirstSync<{ n: number }>(
    'SELECT COUNT(*) as n FROM workout_sessions WHERE ended_at IS NOT NULL'
  );
  return Number(r?.n ?? 0);
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
  const id = randomUUID();
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

/** Removes a finished session and its sets from the local DB. Ignores active (unended) sessions. */
export function deleteCompletedSession(sessionId: string): void {
  const d = getDb();
  const row = d.getFirstSync<{ ended_at: string | null }>(
    'SELECT ended_at FROM workout_sessions WHERE id = ?',
    [sessionId]
  );
  if (!row?.ended_at) return;
  d.runSync('DELETE FROM set_logs WHERE session_id = ?', [sessionId]);
  d.runSync('DELETE FROM workout_sessions WHERE id = ?', [sessionId]);
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
  const id = randomUUID();
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

/**
 * Removes one set from the in-progress session only. Renumbers order_index for that exercise.
 */
export function deleteSetFromActiveSession(setId: string): boolean {
  const d = getDb();
  const row = d.getFirstSync<{
    session_id: string;
    exercise_id: string;
  }>(
    `SELECT sl.session_id, sl.exercise_id
     FROM set_logs sl
     INNER JOIN workout_sessions ws ON ws.id = sl.session_id
     WHERE sl.id = ? AND ws.ended_at IS NULL`,
    [setId]
  );
  if (!row) return false;

  d.runSync('DELETE FROM set_logs WHERE id = ?', [setId]);

  const remaining = d.getAllSync<{ id: string }>(
    'SELECT id FROM set_logs WHERE session_id = ? AND exercise_id = ? ORDER BY order_index ASC',
    [row.session_id, row.exercise_id]
  );
  for (let i = 0; i < remaining.length; i++) {
    d.runSync('UPDATE set_logs SET order_index = ?, dirty = 1 WHERE id = ?', [
      i,
      remaining[i]!.id,
    ]);
  }

  d.runSync('UPDATE workout_sessions SET dirty = 1 WHERE id = ?', [row.session_id]);
  return true;
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
  return rows.map((r: Record<string, unknown>) => ({
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

export function sessionSetCount(sessionId: string): number {
  const d = getDb();
  const row = d.getFirstSync<{ c: number }>(
    'SELECT COUNT(*) as c FROM set_logs WHERE session_id = ?',
    [sessionId]
  );
  return Number(row?.c ?? 0);
}

export function sessionDistinctExerciseCount(sessionId: string): number {
  const d = getDb();
  const row = d.getFirstSync<{ c: number }>(
    'SELECT COUNT(DISTINCT exercise_id) as c FROM set_logs WHERE session_id = ?',
    [sessionId]
  );
  return Number(row?.c ?? 0);
}

export function listDirtyRows(): {
  exercises: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  sets: Record<string, unknown>[];
  templates: Record<string, unknown>[];
} {
  const d = getDb();
  return {
    exercises: d.getAllSync<Record<string, unknown>>('SELECT * FROM exercises WHERE dirty = 1'),
    sessions: d.getAllSync<Record<string, unknown>>('SELECT * FROM workout_sessions WHERE dirty = 1'),
    sets: d.getAllSync<Record<string, unknown>>('SELECT * FROM set_logs WHERE dirty = 1'),
    templates: d.getAllSync<Record<string, unknown>>(
      'SELECT * FROM workout_templates WHERE dirty = 1'
    ),
  };
}

export function markSynced(
  table: 'exercises' | 'workout_sessions' | 'set_logs' | 'workout_templates',
  localId: string,
  remoteId: string
): void {
  const d = getDb();
  d.runSync(`UPDATE ${table} SET remote_id = ?, dirty = 0 WHERE id = ?`, [remoteId, localId]);
}

/**
 * Apply a row from Supabase. Primary key on device stays `client_local_id`.
 * Rows with dirty=1 are not overwritten (local changes win until you push).
 */
export function mergeExerciseFromRemote(
  serverId: string,
  clientLocalId: string,
  name: string,
  muscleGroup: string,
  equipment: string | null,
  createdAt: string
): void {
  const d = getDb();
  d.runSync(
    `INSERT INTO exercises (id, name, muscle_group, equipment, is_custom, created_at, remote_id, dirty)
     VALUES (?, ?, ?, ?, 1, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       muscle_group = excluded.muscle_group,
       equipment = excluded.equipment,
       created_at = excluded.created_at,
       remote_id = excluded.remote_id,
       dirty = 0
     WHERE exercises.dirty = 0`,
    [clientLocalId, name, muscleGroup, equipment, createdAt, serverId]
  );
}

export function mergeSessionFromRemote(
  serverId: string,
  clientLocalId: string,
  startedAt: string,
  endedAt: string | null,
  notes: string | null,
  perceivedExertion: number | null,
  source: string
): void {
  const d = getDb();
  d.runSync(
    `INSERT INTO workout_sessions (id, started_at, ended_at, notes, perceived_exertion, source, remote_id, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET
       started_at = excluded.started_at,
       ended_at = excluded.ended_at,
       notes = excluded.notes,
       perceived_exertion = excluded.perceived_exertion,
       source = excluded.source,
       remote_id = excluded.remote_id,
       dirty = 0
     WHERE workout_sessions.dirty = 0`,
    [
      clientLocalId,
      startedAt,
      endedAt,
      notes,
      perceivedExertion,
      source || 'phone',
      serverId,
    ]
  );
}

export function mergeSetFromRemote(
  serverId: string,
  clientLocalId: string,
  sessionClientId: string,
  exerciseClientId: string,
  orderIndex: number,
  reps: number | null,
  weightKg: number | null,
  durationSec: number | null,
  rpe: number | null
): void {
  const d = getDb();
  d.runSync(
    `INSERT INTO set_logs (id, session_id, exercise_id, order_index, reps, weight_kg, duration_sec, rpe, remote_id, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET
       session_id = excluded.session_id,
       exercise_id = excluded.exercise_id,
       order_index = excluded.order_index,
       reps = excluded.reps,
       weight_kg = excluded.weight_kg,
       duration_sec = excluded.duration_sec,
       rpe = excluded.rpe,
       remote_id = excluded.remote_id,
       dirty = 0
     WHERE set_logs.dirty = 0`,
    [
      clientLocalId,
      sessionClientId,
      exerciseClientId,
      orderIndex,
      reps,
      weightKg,
      durationSec,
      rpe,
      serverId,
    ]
  );
}

export function mergeTemplateFromRemote(
  serverId: string,
  clientLocalId: string,
  name: string,
  exerciseIdsJson: string,
  createdAt: string,
  deletedAt: string | null
): void {
  const d = getDb();
  d.runSync(
    `INSERT INTO workout_templates (id, name, exercise_ids, created_at, remote_id, dirty, deleted_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       exercise_ids = excluded.exercise_ids,
       created_at = excluded.created_at,
       remote_id = excluded.remote_id,
       deleted_at = excluded.deleted_at,
       dirty = 0
     WHERE workout_templates.dirty = 0`,
    [clientLocalId, name, exerciseIdsJson, createdAt, serverId, deletedAt]
  );
}

/** Recent completed sessions for AI / summary (last N). */
function rowToTemplate(r: Record<string, unknown>): WorkoutTemplate {
  let exerciseIds: string[] = [];
  try {
    const raw = r.exercise_ids as string;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      exerciseIds = parsed.filter((x): x is string => typeof x === 'string');
    }
  } catch {
    exerciseIds = [];
  }
  return {
    id: r.id as string,
    name: r.name as string,
    exerciseIds,
    createdAt: r.created_at as string,
  };
}

export function listTemplates(): WorkoutTemplate[] {
  const d = getDb();
  const rows = d.getAllSync<Record<string, unknown>>(
    'SELECT * FROM workout_templates WHERE deleted_at IS NULL ORDER BY created_at DESC'
  );
  return rows.map(rowToTemplate);
}

export function getTemplate(id: string): WorkoutTemplate | null {
  const d = getDb();
  const r = d.getFirstSync<Record<string, unknown>>(
    'SELECT * FROM workout_templates WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  return r ? rowToTemplate(r) : null;
}

export function createTemplate(name: string, exerciseIds: string[]): WorkoutTemplate {
  const d = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  d.runSync(
    `INSERT INTO workout_templates (id, name, exercise_ids, created_at, dirty)
     VALUES (?, ?, ?, ?, 1)`,
    [id, name.trim(), JSON.stringify(exerciseIds), now]
  );
  return { id, name: name.trim(), exerciseIds, createdAt: now };
}

export function updateTemplate(
  id: string,
  name: string,
  exerciseIds: string[]
): void {
  const d = getDb();
  d.runSync(
    `UPDATE workout_templates SET name = ?, exercise_ids = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL`,
    [name.trim(), JSON.stringify(exerciseIds), id]
  );
}

/** Soft delete so the removal can sync to Supabase. */
export function deleteTemplate(id: string): void {
  const d = getDb();
  const now = new Date().toISOString();
  d.runSync(
    'UPDATE workout_templates SET deleted_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL',
    [now, id]
  );
}

/** Exercises in the order the user first logged a set (SQLite rowid). */
export function orderedExerciseIdsFromSession(sessionId: string): string[] {
  const d = getDb();
  const rows = d.getAllSync<Record<string, unknown>>(
    `SELECT exercise_id FROM set_logs WHERE session_id = ?
     GROUP BY exercise_id
     ORDER BY MIN(rowid)`,
    [sessionId]
  );
  return rows.map((r) => r.exercise_id as string);
}

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
  return sessions.map((row: Record<string, unknown>) => {
    const session = rowToSession(row);
    const sets = listSetsForSession(session.id);
    return { session, sets, exerciseNames: nameById };
  });
}
