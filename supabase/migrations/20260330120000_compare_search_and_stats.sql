-- Leadership tab: profile search (SECURITY DEFINER) + self stats for side-by-side stats.
-- Profiles are not readable across users via RLS; search goes through this RPC only.

create or replace function public.my_training_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null::jsonb
    else jsonb_build_object(
      'weekly_volume_kg', coalesce(public._weekly_volume_kg(auth.uid()), 0),
      'sessions_7d', coalesce(public._sessions_7d(auth.uid()), 0),
      'best_lift_label', public._best_lift_label(auth.uid())
    )
  end;
$$;

comment on function public.my_training_stats() is 'Caller’s own 7d training aggregates (for Leadership UI).';

create or replace function public.search_profiles_for_contacts(p_query text, p_limit int default 20)
returns table (
  profile_id uuid,
  display_name text,
  relationship text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q text := trim(coalesce(p_query, ''));
  lim int := least(greatest(coalesce(p_limit, 20), 1), 50);
  me uuid := auth.uid();
begin
  if me is null then
    return;
  end if;

  if length(q) < 2 then
    return;
  end if;

  return query
  with candidates as (
    select p.id as pid, p.display_name as dname
    from public.profiles p
    where p.id <> me
      and (
        lower(p.id::text) like lower(q) || '%'
        or (
          p.display_name is not null
          and trim(p.display_name) <> ''
          and p.display_name ilike '%' || q || '%'
        )
      )
    order by
      case when lower(p.id::text) like lower(q) || '%' then 0 else 1 end,
      length(trim(coalesce(p.display_name, ''))) nulls last
    limit lim
  )
  select
    c.pid as profile_id,
    c.dname as display_name,
    case
      when exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.requester_id = me and f.addressee_id = c.pid) or (f.addressee_id = me and f.requester_id = c.pid))
      ) then 'friend'
      when exists (
        select 1 from public.friendships f
        where f.status = 'pending' and f.requester_id = me and f.addressee_id = c.pid
      ) then 'pending_out'
      when exists (
        select 1 from public.friendships f
        where f.status = 'pending' and f.addressee_id = me and f.requester_id = c.pid
      ) then 'pending_in'
      else 'none'
    end::text as relationship
  from candidates c;
end;
$$;

comment on function public.search_profiles_for_contacts(text, int) is 'Search users by display name or user id prefix for friend requests.';

grant execute on function public.my_training_stats() to authenticated;
grant execute on function public.search_profiles_for_contacts(text, int) to authenticated;
