import { getSupabase } from '@/src/lib/supabase';

export type GlobalBenchmarkPayload = {
  ok: boolean;
  code?: string;
  message?: string;
  cohort_description?: string;
  /** Present when ok is false and the cohort is too small */
  cohort_sample_size?: number;
  your_bodyweight_kg?: number;
  your_birth_year?: number;
  your_sex?: string;
  your_height_cm?: number | null;
  your_years_training?: number | null;
  global?: {
    sample_size: number;
    relative_weekly_load_percentile: number;
    sessions_7d_percentile: number;
    cardio_minutes_7d_percentile: number;
  };
  region?: {
    sample_size: number;
    country_code?: string;
    note?: string;
    relative_weekly_load_percentile?: number;
    sessions_7d_percentile?: number;
    cardio_minutes_7d_percentile?: number;
  } | null;
};

/** Percentile is mid-rank in cohort (higher = stronger / more). Top X% ≈ 100 - percentile. */
export function topPercentFromPercentile(p: number | null | undefined): number | null {
  if (p == null || Number.isNaN(p)) return null;
  return Math.max(1, Math.min(99, Math.round(100 - p)));
}

export async function fetchGlobalBenchmarks(): Promise<{
  data: GlobalBenchmarkPayload | null;
  error: string | null;
}> {
  const sb = getSupabase();
  if (!sb) return { data: null, error: 'Not configured' };
  const { data, error } = await sb.rpc('global_benchmark_percentiles');
  if (error) return { data: null, error: error.message };
  return { data: data as GlobalBenchmarkPayload, error: null };
}
