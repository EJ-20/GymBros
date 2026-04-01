-- Benchmark demographics: sex (cohort match), optional height & training years for tighter cohorts.

alter table public.profiles
  add column if not exists sex text,
  add column if not exists height_cm numeric,
  add column if not exists years_training int;

comment on column public.profiles.sex is 'For benchmark cohorts: male | female | non_binary | prefer_not';
comment on column public.profiles.height_cm is 'Optional height in cm; ±8% band vs other users when both set';
comment on column public.profiles.years_training is 'Optional self-reported years of structured training; ±4 years when both set';

alter table public.profiles drop constraint if exists profiles_sex_chk;

alter table public.profiles
  add constraint profiles_sex_chk
  check (
    sex is null
    or sex in ('male', 'female', 'non_binary', 'prefer_not')
  );

alter table public.profiles drop constraint if exists profiles_years_training_chk;

alter table public.profiles
  add constraint profiles_years_training_chk
  check (years_training is null or (years_training >= 0 and years_training <= 80));

-- Replace percentile RPC: cohort = same sex + age/weight bands + optional height/years when provided.
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
  my_sex text;
  my_height numeric;
  my_yt int;
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
    p.share_global_benchmarks,
    p.sex,
    p.height_cm,
    p.years_training
  into my_bw, my_year, my_cc, opted_in, my_sex, my_height, my_yt
  from public.profiles p
  where p.id = me;

  if not coalesce(opted_in, false) then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_opted_in',
      'message', 'Turn on global benchmarks in Account and save the required fields.'
    );
  end if;

  if my_bw is null or my_bw <= 0 or my_year is null or my_year < 1930 or my_year > extract(year from now())::int - 12 then
    return jsonb_build_object(
      'ok', false,
      'code', 'incomplete_profile',
      'message', 'Add a valid body weight (kg) and birth year to see benchmarks.'
    );
  end if;

  if my_sex is null or my_sex not in ('male', 'female', 'non_binary', 'prefer_not') then
    return jsonb_build_object(
      'ok', false,
      'code', 'incomplete_profile',
      'message', 'Select how you want to be grouped for benchmarks (sex / gender category).'
    );
  end if;

  if my_height is not null and (my_height < 100 or my_height > 250) then
    return jsonb_build_object(
      'ok', false,
      'code', 'incomplete_profile',
      'message', 'Height should be between 100 and 250 cm, or leave it blank.'
    );
  end if;

  if my_yt is not null and (my_yt < 0 or my_yt > 80) then
    return jsonb_build_object(
      'ok', false,
      'code', 'incomplete_profile',
      'message', 'Years of training should be between 0 and 80, or leave it blank.'
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
      and p.sex = my_sex
      and abs(p.birth_year - my_year) <= 5
      and p.bodyweight_kg between my_bw * 0.85 and my_bw * 1.15
      and (
        my_height is null
        or p.height_cm is null
        or (p.height_cm between my_height * 0.92 and my_height * 1.08)
      )
      and (
        my_yt is null
        or p.years_training is null
        or abs(p.years_training - my_yt) <= 4
      )
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
        and p.sex = my_sex
        and abs(p.birth_year - my_year) <= 5
        and p.bodyweight_kg between my_bw * 0.85 and my_bw * 1.15
        and p.country_code = my_cc
        and (
          my_height is null
          or p.height_cm is null
          or (p.height_cm between my_height * 0.92 and my_height * 1.08)
        )
        and (
          my_yt is null
          or p.years_training is null
          or abs(p.years_training - my_yt) <= 4
        )
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
      'message', format('Need at least %s people in your cohort who opted in. Right now: %s.', min_n, coalesce(g_n, 0)),
      'cohort_sample_size', coalesce(g_n, 0)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'cohort_description',
    'Same benchmark sex category; age ±5 yr; weight ±15%; optional height ±8% and training years ±4 when both you and the other person filled them in',
    'your_bodyweight_kg', my_bw,
    'your_birth_year', my_year,
    'your_sex', my_sex,
    'your_height_cm', my_height,
    'your_years_training', my_yt,
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
