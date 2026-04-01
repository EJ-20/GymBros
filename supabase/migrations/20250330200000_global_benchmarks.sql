-- Global / regional benchmark percentiles (opt-in, cohort by age + bodyweight).
-- Uses SECURITY DEFINER RPC; only returns aggregate percentiles for the caller.

alter table public.profiles
  add column if not exists bodyweight_kg numeric,
  add column if not exists birth_year int,
  add column if not exists country_code text,
  add column if not exists share_global_benchmarks boolean not null default false;

comment on column public.profiles.bodyweight_kg is 'Body weight in kg for relative strength benchmarks';
comment on column public.profiles.birth_year is 'Birth year for age cohort matching';
comment on column public.profiles.country_code is 'ISO 3166-1 alpha-2 region for regional percentiles (optional)';
comment on column public.profiles.share_global_benchmarks is 'Opt-in: include my stats in anonymous cohorts and show percentile rankings';

-- Cardio / conditioning volume from timed sets on cardio-tagged exercises (last 7 days, completed sessions).
create or replace function public._cardio_minutes_7d(p_user uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(sl.duration_sec), 0)::numeric / 60.0
  from public.set_logs sl
  join public.workout_sessions ws
    on ws.user_id = sl.user_id and ws.client_local_id = sl.session_client_id
  join public.exercises e
    on e.user_id = sl.user_id and e.client_local_id = sl.exercise_client_id
  where sl.user_id = p_user
    and ws.ended_at is not null
    and ws.ended_at >= (now() - interval '7 days')
    and lower(e.muscle_group::text) = 'cardio'
    and sl.duration_sec is not null
    and sl.duration_sec > 0;
$$;

-- Percentiles among opt-in users with similar age (±5 yr) and bodyweight (±15%).
create or replace function public.global_benchmark_percentiles()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_bw numeric;
  my_year int;
  my_cc text;
  opted_in boolean;
  my_vol numeric;
  my_rel numeric;
  my_sess bigint;
  my_cardio numeric;
  min_n int := 12;
  min_reg int := 5;
  g_n int;
  g_pct_rel numeric;
  g_pct_sess numeric;
  g_pct_cardio numeric;
  r_n int;
  r_pct_rel numeric;
  r_pct_sess numeric;
  r_pct_cardio numeric;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;

  select
    p.bodyweight_kg,
    p.birth_year,
    case
      when p.country_code is null or length(trim(p.country_code)) <> 2 then null
      else upper(trim(p.country_code))
    end,
    p.share_global_benchmarks
  into my_bw, my_year, my_cc, opted_in
  from public.profiles p
  where p.id = me;

  if not coalesce(opted_in, false) then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_opted_in',
      'message', 'Turn on global benchmarks in Account and save body weight and birth year.'
    );
  end if;

  if my_bw is null or my_bw <= 0 or my_year is null or my_year < 1930 or my_year > extract(year from now())::int - 10 then
    return jsonb_build_object(
      'ok', false,
      'code', 'incomplete_profile',
      'message', 'Add a valid body weight (kg) and birth year to see benchmarks.'
    );
  end if;

  my_vol := coalesce(public._weekly_volume_kg(me), 0);
  my_rel := my_vol / my_bw;
  my_sess := coalesce(public._sessions_7d(me), 0)::bigint;
  my_cardio := coalesce(public._cardio_minutes_7d(me), 0);

  with cohort as (
    select p.id, p.bodyweight_kg, p.birth_year
    from public.profiles p
    where p.share_global_benchmarks = true
      and p.bodyweight_kg is not null and p.bodyweight_kg > 0
      and p.birth_year is not null
      and abs(p.birth_year - my_year) <= 5
      and p.bodyweight_kg between my_bw * 0.85 and my_bw * 1.15
  ),
  metrics as (
    select
      c.id,
      coalesce(public._weekly_volume_kg(c.id), 0) / c.bodyweight_kg as rel_vol,
      coalesce(public._sessions_7d(c.id), 0)::numeric as sess,
      coalesce(public._cardio_minutes_7d(c.id), 0) as cardio
    from cohort c
  ),
  ranked as (
    select
      count(*)::int as n,
      count(*) filter (where m.rel_vol < my_rel)::int as rv_b,
      count(*) filter (where m.rel_vol = my_rel)::int as rv_e,
      count(*) filter (where m.sess < my_sess::numeric)::int as sv_b,
      count(*) filter (where m.sess = my_sess::numeric)::int as sv_e,
      count(*) filter (where m.cardio < my_cardio)::int as cv_b,
      count(*) filter (where m.cardio = my_cardio)::int as cv_e
    from metrics m
  )
  select
    r.n,
    case when r.n >= min_n then
      round(100.0 * (r.rv_b + 0.5 * r.rv_e) / nullif(r.n, 0), 1)
    end,
    case when r.n >= min_n then
      round(100.0 * (r.sv_b + 0.5 * r.sv_e) / nullif(r.n, 0), 1)
    end,
    case when r.n >= min_n then
      round(100.0 * (r.cv_b + 0.5 * r.cv_e) / nullif(r.n, 0), 1)
    end
  into g_n, g_pct_rel, g_pct_sess, g_pct_cardio
  from ranked r;

  if my_cc is not null then
    with cohort as (
      select p.id, p.bodyweight_kg, p.birth_year
      from public.profiles p
      where p.share_global_benchmarks = true
        and p.bodyweight_kg is not null and p.bodyweight_kg > 0
        and p.birth_year is not null
        and abs(p.birth_year - my_year) <= 5
        and p.bodyweight_kg between my_bw * 0.85 and my_bw * 1.15
        and p.country_code = my_cc
    ),
    metrics as (
      select
        c.id,
        coalesce(public._weekly_volume_kg(c.id), 0) / c.bodyweight_kg as rel_vol,
        coalesce(public._sessions_7d(c.id), 0)::numeric as sess,
        coalesce(public._cardio_minutes_7d(c.id), 0) as cardio
      from cohort c
    ),
    ranked as (
      select
        count(*)::int as n,
        count(*) filter (where m.rel_vol < my_rel)::int as rv_b,
        count(*) filter (where m.rel_vol = my_rel)::int as rv_e,
        count(*) filter (where m.sess < my_sess::numeric)::int as sv_b,
        count(*) filter (where m.sess = my_sess::numeric)::int as sv_e,
        count(*) filter (where m.cardio < my_cardio)::int as cv_b,
        count(*) filter (where m.cardio = my_cardio)::int as cv_e
      from metrics m
    )
    select
      r.n,
      case when r.n >= min_reg then
        round(100.0 * (r.rv_b + 0.5 * r.rv_e) / nullif(r.n, 0), 1)
      end,
      case when r.n >= min_reg then
        round(100.0 * (r.sv_b + 0.5 * r.sv_e) / nullif(r.n, 0), 1)
      end,
      case when r.n >= min_reg then
        round(100.0 * (r.cv_b + 0.5 * r.cv_e) / nullif(r.n, 0), 1)
      end
    into r_n, r_pct_rel, r_pct_sess, r_pct_cardio
    from ranked r;
  end if;

  if g_n is null or g_n < min_n then
    return jsonb_build_object(
      'ok', false,
      'code', 'insufficient_cohort',
      'message', format('Need at least %s people in your age & weight cohort who opted in. Right now: %s.', min_n, coalesce(g_n, 0)),
      'cohort_sample_size', coalesce(g_n, 0)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'cohort_description', 'Similar age (±5 years) and body weight (±15%), all opted in',
    'your_bodyweight_kg', my_bw,
    'your_birth_year', my_year,
    'global', jsonb_build_object(
      'sample_size', g_n,
      'relative_weekly_load_percentile', g_pct_rel,
      'sessions_7d_percentile', g_pct_sess,
      'cardio_minutes_7d_percentile', g_pct_cardio
    ),
    'region', case
      when my_cc is null then null::jsonb
      when r_n is null or r_n < min_reg then jsonb_build_object(
        'sample_size', coalesce(r_n, 0),
        'country_code', my_cc,
        'note', format('Regional rank needs at least %s people in your country in this cohort.', min_reg)
      )
      else jsonb_build_object(
        'sample_size', r_n,
        'country_code', my_cc,
        'relative_weekly_load_percentile', r_pct_rel,
        'sessions_7d_percentile', r_pct_sess,
        'cardio_minutes_7d_percentile', r_pct_cardio
      )
    end
  );
end;
$$;

grant execute on function public.global_benchmark_percentiles() to authenticated;
