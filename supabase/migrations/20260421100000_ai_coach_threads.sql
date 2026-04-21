-- AI coach persistence: conversation threads + messages owned per user.

create table public.coach_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  unique (id, user_id)
);

create index coach_threads_user_updated_idx
  on public.coach_threads (user_id, updated_at desc);

alter table public.coach_threads enable row level security;

create policy "coach_threads_own"
  on public.coach_threads for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  tool_name text,
  created_at timestamptz not null default now(),
  constraint coach_messages_thread_fk
    foreign key (thread_id, user_id)
    references public.coach_threads (id, user_id)
    on delete cascade
);

create index coach_messages_thread_created_idx
  on public.coach_messages (thread_id, created_at asc);

create index coach_messages_user_created_idx
  on public.coach_messages (user_id, created_at desc);

alter table public.coach_messages enable row level security;

create policy "coach_messages_own"
  on public.coach_messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.touch_coach_thread()
returns trigger
language plpgsql
as $$
begin
  update public.coach_threads
  set updated_at = new.created_at,
      last_message_at = new.created_at
  where id = new.thread_id
    and user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists coach_messages_touch_thread on public.coach_messages;
create trigger coach_messages_touch_thread
  after insert on public.coach_messages
  for each row execute function public.touch_coach_thread();

grant select, insert, update, delete on public.coach_threads to authenticated;
grant select, insert, update, delete on public.coach_messages to authenticated;
