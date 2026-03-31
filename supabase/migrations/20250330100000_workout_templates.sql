-- Saved routines (templates): sync with mobile workout_templates

create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  client_local_id text not null,
  name text not null,
  exercise_ids text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, client_local_id)
);

create index workout_templates_user_created_idx
  on public.workout_templates (user_id, created_at desc);

alter table public.workout_templates enable row level security;

create policy "workout_templates_own"
  on public.workout_templates for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.workout_templates to authenticated;
