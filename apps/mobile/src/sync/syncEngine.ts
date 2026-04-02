import type { WeightUnit } from '@/src/lib/weightUnits';
import { getSupabase, supabaseConfigured } from '@/src/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as repo from '@/src/db/workoutRepo';

const PAGE = 500;

async function fetchAll<T extends Record<string, unknown>>(
  sb: SupabaseClient,
  table: 'exercises' | 'workout_sessions' | 'set_logs' | 'workout_templates',
  columns: string
): Promise<{ rows: T[]; error: string | null }> {
  let start = 0;
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await sb.from(table).select(columns).range(start, start + PAGE - 1);
    if (error) return { rows: [], error: error.message };
    const chunk = (data ?? []) as unknown as T[];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
    start += PAGE;
  }
  return { rows, error: null };
}

/**
 * Push dirty local rows to Supabase. Uses client_local_id for idempotent upserts.
 */
export async function syncToCloud(userId: string): Promise<{ error: string | null }> {
  if (!supabaseConfigured) return { error: 'Backend not configured' };
  const sb = getSupabase();
  if (!sb) return { error: 'No client' };

  const { exercises, sessions, sets, templates } = repo.listDirtyRows();

  for (const ex of exercises) {
    const { error } = await sb.from('exercises').upsert(
      {
        user_id: userId,
        client_local_id: ex.id,
        name: ex.name,
        muscle_group: ex.muscle_group,
        equipment: ex.equipment,
        created_at: ex.created_at,
      },
      { onConflict: 'user_id,client_local_id' }
    );
    if (error) return { error: error.message };
    repo.markSynced('exercises', ex.id as string, ex.id as string);
  }

  for (const s of sessions) {
    const { error } = await sb.from('workout_sessions').upsert(
      {
        user_id: userId,
        client_local_id: s.id,
        started_at: s.started_at,
        ended_at: s.ended_at,
        notes: s.notes,
        perceived_exertion: s.perceived_exertion,
        source: s.source ?? 'phone',
      },
      { onConflict: 'user_id,client_local_id' }
    );
    if (error) return { error: error.message };
    repo.markSynced('workout_sessions', s.id as string, s.id as string);
  }

  for (const st of sets) {
    const { error } = await sb.from('set_logs').upsert(
      {
        user_id: userId,
        client_local_id: st.id,
        session_client_id: st.session_id,
        exercise_client_id: st.exercise_id,
        order_index: st.order_index,
        reps: st.reps,
        weight_kg: st.weight_kg,
        duration_sec: st.duration_sec,
        rpe: st.rpe,
      },
      { onConflict: 'user_id,client_local_id' }
    );
    if (error) return { error: error.message };
    repo.markSynced('set_logs', st.id as string, st.id as string);
  }

  for (const t of templates) {
    const { error } = await sb.from('workout_templates').upsert(
      {
        user_id: userId,
        client_local_id: t.id as string,
        name: t.name as string,
        exercise_ids: t.exercise_ids as string,
        created_at: t.created_at as string,
        deleted_at: (t.deleted_at as string | null) ?? null,
      },
      { onConflict: 'user_id,client_local_id' }
    );
    if (error) return { error: error.message };
    repo.markSynced('workout_templates', t.id as string, t.id as string);
  }

  return { error: null };
}

type RemoteExercise = {
  id: string;
  client_local_id: string;
  name: string;
  muscle_group: string;
  equipment: string | null;
  created_at: string;
};

type RemoteSession = {
  id: string;
  client_local_id: string;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  perceived_exertion: number | null;
  source: string | null;
};

type RemoteSet = {
  id: string;
  client_local_id: string;
  session_client_id: string;
  exercise_client_id: string;
  order_index: number;
  reps: number | null;
  weight_kg: number | string | null;
  duration_sec: number | null;
  rpe: number | null;
};

type RemoteTemplate = {
  id: string;
  client_local_id: string;
  name: string;
  exercise_ids: string;
  created_at: string;
  deleted_at: string | null;
};

/**
 * Download remote rows and merge into SQLite.
 * Order: exercises → sessions → sets (FKs use client ids).
 * Local rows with dirty=1 are left unchanged until the next successful push.
 */
export async function pullFromCloud(): Promise<{
  error: string | null;
  pulled?: { exercises: number; sessions: number; sets: number; routines: number };
}> {
  if (!supabaseConfigured) return { error: 'Backend not configured' };
  const sb = getSupabase();
  if (!sb) return { error: 'No client' };
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { error: 'Not signed in' };

  const ex = await fetchAll<RemoteExercise>(
    sb,
    'exercises',
    'id, client_local_id, name, muscle_group, equipment, created_at'
  );
  if (ex.error) return { error: ex.error };

  const ws = await fetchAll<RemoteSession>(
    sb,
    'workout_sessions',
    'id, client_local_id, started_at, ended_at, notes, perceived_exertion, source'
  );
  if (ws.error) return { error: ws.error };

  const st = await fetchAll<RemoteSet>(
    sb,
    'set_logs',
    'id, client_local_id, session_client_id, exercise_client_id, order_index, reps, weight_kg, duration_sec, rpe'
  );
  if (st.error) return { error: st.error };

  const tpl = await fetchAll<RemoteTemplate>(
    sb,
    'workout_templates',
    'id, client_local_id, name, exercise_ids, created_at, deleted_at'
  );
  if (tpl.error) return { error: tpl.error };

  for (const row of ex.rows) {
    repo.mergeExerciseFromRemote(
      row.id,
      row.client_local_id,
      row.name,
      row.muscle_group,
      row.equipment ?? null,
      row.created_at
    );
  }

  for (const row of ws.rows) {
    repo.mergeSessionFromRemote(
      row.id,
      row.client_local_id,
      row.started_at,
      row.ended_at ?? null,
      row.notes ?? null,
      row.perceived_exertion != null ? Number(row.perceived_exertion) : null,
      row.source ?? 'phone'
    );
  }

  for (const row of st.rows) {
    const w =
      row.weight_kg === null || row.weight_kg === undefined
        ? null
        : typeof row.weight_kg === 'string'
          ? parseFloat(row.weight_kg)
          : row.weight_kg;
    repo.mergeSetFromRemote(
      row.id,
      row.client_local_id,
      row.session_client_id,
      row.exercise_client_id,
      Number(row.order_index),
      row.reps != null ? Number(row.reps) : null,
      w != null && !Number.isNaN(w) ? w : null,
      row.duration_sec != null ? Number(row.duration_sec) : null,
      row.rpe != null ? Number(row.rpe) : null
    );
  }

  for (const row of tpl.rows) {
    repo.mergeTemplateFromRemote(
      row.id,
      row.client_local_id,
      row.name,
      row.exercise_ids,
      row.created_at,
      row.deleted_at ?? null
    );
  }

  return {
    error: null,
    pulled: {
      exercises: ex.rows.length,
      sessions: ws.rows.length,
      sets: st.rows.length,
      routines: tpl.rows.length,
    },
  };
}

/** Push local changes, then pull from Supabase. */
export async function syncAll(userId: string): Promise<{
  error: string | null;
  pulled?: { exercises: number; sessions: number; sets: number; routines: number };
}> {
  const push = await syncToCloud(userId);
  if (push.error) return push;
  return pullFromCloud();
}

/**
 * Deletes a completed workout from Supabase (set_logs for that session, then workout_sessions).
 * Returns attempted: true only when a signed-in user was used for the API calls.
 */
export async function deleteSessionFromCloud(
  sessionClientLocalId: string
): Promise<{ error: string | null; attempted: boolean }> {
  if (!supabaseConfigured) return { error: null, attempted: false };
  const sb = getSupabase();
  if (!sb) return { error: null, attempted: false };
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { error: null, attempted: false };
  const uid = auth.user.id;

  const { error: e1 } = await sb
    .from('set_logs')
    .delete()
    .eq('user_id', uid)
    .eq('session_client_id', sessionClientLocalId);
  if (e1) return { error: e1.message, attempted: true };

  const { error: e2 } = await sb
    .from('workout_sessions')
    .delete()
    .eq('user_id', uid)
    .eq('client_local_id', sessionClientLocalId);
  if (e2) return { error: e2.message, attempted: true };

  return { error: null, attempted: true };
}

/** Deletes a single set row from Supabase (matches mobile `set_logs.id` / `client_local_id`). */
export async function deleteSetLogFromCloud(
  clientLocalSetId: string
): Promise<{ error: string | null; attempted: boolean }> {
  if (!supabaseConfigured) return { error: null, attempted: false };
  const sb = getSupabase();
  if (!sb) return { error: null, attempted: false };
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { error: null, attempted: false };

  const { error } = await sb
    .from('set_logs')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('client_local_id', clientLocalSetId);

  if (error) return { error: error.message, attempted: true };
  return { error: null, attempted: true };
}

export type BenchmarkSex = 'male' | 'female' | 'non_binary' | 'prefer_not';

function parseBenchmarkSex(v: unknown): BenchmarkSex | null {
  if (v !== 'male' && v !== 'female' && v !== 'non_binary' && v !== 'prefer_not') return null;
  return v;
}

export async function pullProfile(): Promise<{
  displayName: string | null;
  shareWeeklyVolume: boolean;
  shareSessionCount: boolean;
  shareBestLifts: boolean;
  bodyweightKg: number | null;
  birthYear: number | null;
  countryCode: string | null;
  shareGlobalBenchmarks: boolean;
  sex: BenchmarkSex | null;
  heightCm: number | null;
  yearsTraining: number | null;
  weightUnit: WeightUnit;
} | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('profiles').select('*').single();
  if (error || !data) return null;
  return {
    displayName: data.display_name,
    shareWeeklyVolume: Boolean(data.share_weekly_volume),
    shareSessionCount: Boolean(data.share_session_count),
    shareBestLifts: Boolean(data.share_best_lifts),
    bodyweightKg: data.bodyweight_kg != null ? Number(data.bodyweight_kg) : null,
    birthYear: data.birth_year != null ? parseInt(String(data.birth_year), 10) : null,
    countryCode:
      typeof data.country_code === 'string' && data.country_code.length
        ? data.country_code.trim().toUpperCase()
        : null,
    shareGlobalBenchmarks: Boolean(data.share_global_benchmarks),
    sex: parseBenchmarkSex(data.sex),
    heightCm: data.height_cm != null ? Number(data.height_cm) : null,
    yearsTraining: data.years_training != null ? parseInt(String(data.years_training), 10) : null,
    weightUnit: data.weight_unit === 'lbs' ? 'lbs' : 'kg',
  };
}

export async function updateProfilePrivacy(input: {
  displayName?: string;
  shareWeeklyVolume: boolean;
  shareSessionCount: boolean;
  shareBestLifts: boolean;
  bodyweightKg?: number | null;
  birthYear?: number | null;
  countryCode?: string | null;
  shareGlobalBenchmarks?: boolean;
  sex?: BenchmarkSex | null;
  heightCm?: number | null;
  yearsTraining?: number | null;
  weightUnit?: WeightUnit;
}): Promise<{ error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { error: 'Not configured' };
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return { error: 'Not signed in' };
  const ccRaw = input.countryCode?.trim().toUpperCase() ?? null;
  const country_code = ccRaw && ccRaw.length === 2 ? ccRaw : null;
  const { error } = await sb.from('profiles').upsert({
    id: u.user.id,
    display_name: input.displayName ?? null,
    share_weekly_volume: input.shareWeeklyVolume,
    share_session_count: input.shareSessionCount,
    share_best_lifts: input.shareBestLifts,
    bodyweight_kg: input.bodyweightKg ?? null,
    birth_year: input.birthYear ?? null,
    country_code,
    share_global_benchmarks: input.shareGlobalBenchmarks ?? false,
    sex: input.sex ?? null,
    height_cm: input.heightCm ?? null,
    years_training: input.yearsTraining ?? null,
    weight_unit: input.weightUnit ?? 'kg',
    updated_at: new Date().toISOString(),
  });
  return { error: error?.message ?? null };
}

export async function patchProfileWeightUnit(unit: WeightUnit): Promise<{ error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { error: 'Not configured' };
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return { error: 'Not signed in' };
  const { error } = await sb
    .from('profiles')
    .update({
      weight_unit: unit,
      updated_at: new Date().toISOString(),
    })
    .eq('id', u.user.id);
  return { error: error?.message ?? null };
}
