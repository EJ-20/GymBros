-- GymBros: profiles, workouts, sets, friendships, RLS, compare RPC

create extension if not exists "pgcrypto";

-- Profiles (1:1 auth.users)
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url text,
  share_weekly_volume boolean not null default false,
  share_session_count boolean not null default false,
  share_best_lifts boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Exercises (per user, keyed by client local id)
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  client_local_id text not null,
  name text not null,
  muscle_group text not null,
  equipment text,
  created_at timestamptz not null default now(),
  unique (user_id, client_local_id)
);

create index exercises_user_id_idx on public.exercises (user_id);

alter table public.exercises enable row level security;

create policy "exercises_own"
  on public.exercises for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Workout sessions
create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  client_local_id text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  notes text,
  perceived_exertion smallint,
  source text not null default 'phone',
  unique (user_id, client_local_id)
);

create index workout_sessions_user_started_idx
  on public.workout_sessions (user_id, started_at desc);

alter table public.workout_sessions enable row level security;

create policy "workout_sessions_own"
  on public.workout_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Set logs (references client ids from mobile; no FK to keep sync simple)
create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  client_local_id text not null,
  session_client_id text not null,
  exercise_client_id text not null,
  order_index int not null,
  reps int,
  weight_kg numeric,
  duration_sec int,
  rpe smallint,
  unique (user_id, client_local_id)
);

create index set_logs_user_session_idx on public.set_logs (user_id, session_client_id);

alter table public.set_logs enable row level security;

create policy "set_logs_own"
  on public.set_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Friendships
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users on delete cascade,
  addressee_id uuid not null references auth.users on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index friendships_addressee_idx on public.friendships (addressee_id);
create index friendships_requester_idx on public.friendships (requester_id);

alter table public.friendships enable row level security;

create policy "friendships_select_participant"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "friendships_insert_requester"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

-- Only the addressee can accept or decline; requester can cancel via delete
create policy "friendships_update_addressee"
  on public.friendships for update
  using (auth.uid() = addressee_id and status = 'pending')
  with check (status in ('accepted', 'blocked'));

create policy "friendships_delete_requester_pending"
  on public.friendships for delete
  using (auth.uid() = requester_id and status = 'pending');

-- New user -> profile row
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Aggregates for compare (helper view: last 7 days sessions count, weekly volume)
create or replace function public._weekly_volume_kg(p_user uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(sl.reps * sl.weight_kg), 0)::numeric
  from public.set_logs sl
  join public.workout_sessions ws
    on ws.user_id = sl.user_id and ws.client_local_id = sl.session_client_id
  where sl.user_id = p_user
    and ws.ended_at is not null
    and ws.ended_at >= now() - interval '7 days';
$$;

create or replace function public._sessions_7d(p_user uuid)
returns bigint
language sql
stable
as $$
  select count(*)::bigint
  from public.workout_sessions ws
  where ws.user_id = p_user
    and ws.ended_at is not null
    and ws.ended_at >= now() - interval '7 days';
$$;

create or replace function public._best_lift_label(p_user uuid)
returns text
language sql
stable
as $$
  select e.name || ' ~' || round(sl.weight_kg * (1 + sl.reps::numeric / 30))::int || 'kg e1RM'
  from public.set_logs sl
  join public.exercises e
    on e.user_id = sl.user_id and e.client_local_id = sl.exercise_client_id
  where sl.user_id = p_user
    and sl.weight_kg is not null and sl.reps is not null and sl.reps > 0
  order by sl.weight_kg * (1 + sl.reps::numeric / 30) desc
  limit 1;
$$;

-- Friends-only compare: returns accepted friends who opted into each metric
create or replace function public.friend_compare_stats()
returns table (
  friend_id uuid,
  display_name text,
  weekly_volume_kg numeric,
  sessions_7d bigint,
  best_lift_label text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as friend_id,
    p.display_name,
    case when p.share_weekly_volume then public._weekly_volume_kg(p.id) else null end,
    case when p.share_session_count then public._sessions_7d(p.id) else null end,
    case when p.share_best_lifts then public._best_lift_label(p.id) else null end
  from public.profiles p
  where p.id <> auth.uid()
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = p.id)
          or (f.addressee_id = auth.uid() and f.requester_id = p.id)
        )
    )
    and (
      p.share_weekly_volume or p.share_session_count or p.share_best_lifts
    );
$$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.friend_compare_stats() to authenticated;
