import type {
  FriendSummary,
  MyTrainingStats,
  ProfileSearchHit,
  ProfileSearchRelationship,
} from '@gymbros/shared';
import { getSupabase } from '@/src/lib/supabase';

export async function fetchFriendLeadership(): Promise<{
  data: FriendSummary[] | null;
  error: string | null;
}> {
  const sb = getSupabase();
  if (!sb) return { data: null, error: 'Not configured' };
  const { data, error } = await sb.rpc('friend_compare_stats');
  if (error) return { data: null, error: error.message };
  const rows = (data ?? []) as Array<{
    friend_id: string;
    display_name: string | null;
    weekly_volume_kg: number | null;
    sessions_7d: number | null;
    best_lift_label: string | null;
  }>;
  return {
    data: rows.map((r) => ({
      userId: r.friend_id,
      displayName: r.display_name,
      weeklyVolumeKg: r.weekly_volume_kg != null ? Number(r.weekly_volume_kg) : null,
      sessionCount7d: r.sessions_7d != null ? Number(r.sessions_7d) : null,
      bestLiftLabel: r.best_lift_label,
    })),
    error: null,
  };
}

export async function sendFriendRequest(addresseeId: string): Promise<{ error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { error: 'Not configured' };
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return { error: 'Sign in required' };
  if (addresseeId === u.user.id) return { error: 'Cannot add yourself' };
  const { error } = await sb.from('friendships').insert({
    requester_id: u.user.id,
    addressee_id: addresseeId,
    status: 'pending',
  });
  if (error?.code === '23505') return { error: 'Request already exists' };
  return { error: error?.message ?? null };
}

export async function listPendingIncoming(): Promise<
  { id: string; requesterId: string }[]
> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return [];
  const { data } = await sb
    .from('friendships')
    .select('id, requester_id')
    .eq('addressee_id', u.user.id)
    .eq('status', 'pending');
  return (data ?? []).map((r) => ({ id: r.id, requesterId: r.requester_id }));
}

export async function acceptFriendship(friendshipId: string): Promise<{ error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { error: 'Not configured' };
  const { error } = await sb
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId);
  return { error: error?.message ?? null };
}

export async function fetchMyTrainingStats(): Promise<{
  data: MyTrainingStats | null;
  error: string | null;
}> {
  const sb = getSupabase();
  if (!sb) return { data: null, error: 'Not configured' };
  const { data, error } = await sb.rpc('my_training_stats');
  if (error) return { data: null, error: error.message };
  const row = data as {
    weekly_volume_kg?: number;
    sessions_7d?: number;
    best_lift_label?: string | null;
  } | null;
  if (!row) return { data: null, error: null };
  return {
    data: {
      weeklyVolumeKg: Number(row.weekly_volume_kg ?? 0),
      sessions7d: Number(row.sessions_7d ?? 0),
      bestLiftLabel: row.best_lift_label ?? null,
    },
    error: null,
  };
}

export async function searchProfilesForContacts(
  query: string
): Promise<{ data: ProfileSearchHit[]; error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { data: [], error: 'Not configured' };
  const q = query.trim();
  if (q.length < 2) return { data: [], error: null };
  const { data, error } = await sb.rpc('search_profiles_for_contacts', {
    p_query: q,
    p_limit: 24,
  });
  if (error) return { data: [], error: error.message };
  const rows = (data ?? []) as Array<{
    profile_id: string;
    display_name: string | null;
    relationship: string;
  }>;
  const rel = (r: string): ProfileSearchRelationship => {
    if (r === 'friend' || r === 'pending_out' || r === 'pending_in') return r;
    return 'none';
  };
  return {
    data: rows.map((r) => ({
      userId: r.profile_id,
      displayName: r.display_name,
      relationship: rel(r.relationship),
    })),
    error: null,
  };
}

export async function listOutgoingPending(): Promise<{ id: string; addresseeId: string }[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return [];
  const { data } = await sb
    .from('friendships')
    .select('id, addressee_id')
    .eq('requester_id', u.user.id)
    .eq('status', 'pending');
  return (data ?? []).map((r) => ({ id: r.id, addresseeId: r.addressee_id }));
}

export async function cancelOutgoingFriendRequest(friendshipId: string): Promise<{ error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { error: 'Not configured' };
  const { error } = await sb.from('friendships').delete().eq('id', friendshipId);
  return { error: error?.message ?? null };
}
