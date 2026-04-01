-- Display preference: kg vs lbs (stored values remain kg everywhere).

alter table public.profiles
  add column if not exists weight_unit text not null default 'kg';

alter table public.profiles drop constraint if exists profiles_weight_unit_chk;

alter table public.profiles
  add constraint profiles_weight_unit_chk
  check (weight_unit in ('kg', 'lbs'));

comment on column public.profiles.weight_unit is 'UI preference: kg or lbs; workout data stays in kg';
