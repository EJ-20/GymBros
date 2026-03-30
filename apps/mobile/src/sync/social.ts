import type { FriendSummary } from '@gymbros/shared';
import { getSupabase } from '@/src/lib/supabase';

export async function fetchFriendCompare(): Promise<{
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
