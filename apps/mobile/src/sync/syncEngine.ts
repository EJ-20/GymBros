import { getSupabase, supabaseConfigured } from '@/src/lib/supabase';
import * as repo from '@/src/db/workoutRepo';

/**
 * Push dirty local rows to Supabase. Uses client_local_id for idempotent upserts.
 */
export async function syncToCloud(userId: string): Promise<{ error: string | null }> {
  if (!supabaseConfigured) return { error: 'Backend not configured' };
  const sb = getSupabase();
  if (!sb) return { error: 'No client' };

  const { exercises, sessions, sets } = repo.listDirtyRows();

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

  return { error: null };
}

export async function pullProfile(): Promise<{
  displayName: string | null;
  shareWeeklyVolume: boolean;
  shareSessionCount: boolean;
  shareBestLifts: boolean;
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
  };
}

export async function updateProfilePrivacy(input: {
  displayName?: string;
  shareWeeklyVolume: boolean;
  shareSessionCount: boolean;
  shareBestLifts: boolean;
}): Promise<{ error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { error: 'Not configured' };
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return { error: 'Not signed in' };
  const { error } = await sb.from('profiles').upsert({
    id: u.user.id,
    display_name: input.displayName ?? null,
    share_weekly_volume: input.shareWeeklyVolume,
    share_session_count: input.shareSessionCount,
    share_best_lifts: input.shareBestLifts,
    updated_at: new Date().toISOString(),
  });
  return { error: error?.message ?? null };
}
