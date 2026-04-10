-- Exercise logging mode (weight/reps, time-only, time+distance, bodyweight reps) and run distance.

alter table public.exercises
  add column if not exists tracking_mode text not null default 'weight_reps';

alter table public.set_logs
  add column if not exists distance_m numeric;
