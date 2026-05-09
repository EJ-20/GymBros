import { getHomeDashboardStats } from '@/src/analytics/homeStats';
import { listExercises, listTemplates, recentSessionsForContext } from '@/src/db/workoutRepo';
import { listRecentHealthDaily } from '@/src/health/healthRepo';
import { formatSetSummary } from '@/src/lib/setDisplay';
import type { WeightUnit } from '@/src/lib/weightUnits';
import { fetchGlobalBenchmarks, topPercentFromPercentile } from '@/src/sync/benchmarks';
import { fetchFriendLeadership, fetchMyTrainingStats } from '@/src/sync/social';
import { pullProfile } from '@/src/sync/syncEngine';

function compactLine(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(', ');
}

function currentAgeFromBirthYear(birthYear: number | null): number | null {
  if (!birthYear) return null;
  const age = new Date().getFullYear() - birthYear;
  return age > 0 && age < 120 ? age : null;
}

function formatBodyweight(kg: number | null, unit: WeightUnit): string | null {
  if (kg == null || Number.isNaN(kg)) return null;
  if (unit === 'lbs') return `${Math.round(kg * 2.20462)} lb (${Math.round(kg)} kg)`;
  return `${Math.round(kg)} kg`;
}

function formatMinutes(minutes: number | null): string | null {
  if (minutes == null || Number.isNaN(minutes)) return null;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function formatPercentile(percentile: number | null | undefined): string | null {
  if (percentile == null || Number.isNaN(percentile)) return null;
  const rounded = Math.round(percentile);
  const top = topPercentFromPercentile(percentile);
  return top == null ? `${rounded}th percentile` : `${rounded}th percentile (about top ${top}%)`;
}

export async function buildCoachContextSummary(
  maxSessions = 12,
  weightUnit: WeightUnit = 'kg'
): Promise<string> {
  const blocks = recentSessionsForContext(maxSessions);
  const exercises = listExercises();
  const exById = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const templates = listTemplates();
  const dashboard = getHomeDashboardStats();
  const health = listRecentHealthDaily(14);

  const sections: string[] = [];

  const [profile, myStats, friends, benchmarks] = await Promise.all([
    pullProfile().catch(() => null),
    fetchMyTrainingStats().catch(() => ({ data: null, error: null })),
    fetchFriendLeadership().catch(() => ({ data: null, error: null })),
    fetchGlobalBenchmarks().catch(() => ({ data: null, error: null })),
  ]);

  if (profile) {
    const age = currentAgeFromBirthYear(profile.birthYear);
    sections.push(
      [
        'User profile:',
        `- ${compactLine([
          profile.displayName ? `display name ${profile.displayName}` : null,
          age ? `age about ${age}` : null,
          profile.birthYear ? `birth year ${profile.birthYear}` : null,
          profile.sex ? `sex ${profile.sex}` : null,
          formatBodyweight(profile.bodyweightKg, weightUnit)
            ? `bodyweight ${formatBodyweight(profile.bodyweightKg, weightUnit)}`
            : null,
          profile.heightCm ? `height ${Math.round(profile.heightCm)} cm` : null,
          profile.yearsTraining != null ? `${profile.yearsTraining} years training` : null,
          profile.countryCode ? `country ${profile.countryCode}` : null,
          `preferred unit ${weightUnit}`,
        ])}`,
        `- sharing settings: weekly volume ${profile.shareWeeklyVolume ? 'on' : 'off'}, sessions ${
          profile.shareSessionCount ? 'on' : 'off'
        }, best lifts ${profile.shareBestLifts ? 'on' : 'off'}, global benchmarks ${
          profile.shareGlobalBenchmarks ? 'on' : 'off'
        }`,
      ].join('\n')
    );
  }

  sections.push(
    [
      'Local training summary:',
      `- Last 7 days: ${dashboard.last7.sessions} sessions, ${dashboard.last7.totalSets} sets, ${dashboard.last7.totalMin} minutes.`,
      `- Previous 7 days: ${dashboard.prev7.sessions} sessions, ${dashboard.prev7.totalSets} sets.`,
      `- Last 30 days: ${dashboard.last30.sessions} sessions, ${dashboard.last30.totalSets} sets.`,
      `- All-time completed workouts on this device: ${dashboard.allTimeCompleted}. Current streak: ${dashboard.streakDays} days.`,
      dashboard.topExerciseLast7
        ? `- Most logged exercise this week: ${dashboard.topExerciseLast7.name} (${dashboard.topExerciseLast7.setCount} sets).`
        : null,
      dashboard.activeSession ? '- User currently has an active workout session.' : null,
    ]
      .filter(Boolean)
      .join('\n')
  );

  if (myStats.data) {
    sections.push(
      [
        'Cloud training stats:',
        `- Weekly volume: ${Math.round(myStats.data.weeklyVolumeKg)} kg.`,
        `- Sessions in last 7 days: ${myStats.data.sessions7d}.`,
        myStats.data.bestLiftLabel ? `- Best lift: ${myStats.data.bestLiftLabel}.` : null,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  if (benchmarks.data?.ok) {
    const global = benchmarks.data.global;
    const region = benchmarks.data.region;
    sections.push(
      [
        'Global leaderboard and benchmark context:',
        benchmarks.data.cohort_description ? `- Cohort: ${benchmarks.data.cohort_description}.` : null,
        global
          ? `- Global: relative weekly load ${formatPercentile(
              global.relative_weekly_load_percentile
            )}, sessions ${formatPercentile(global.sessions_7d_percentile)}, cardio ${formatPercentile(
              global.cardio_minutes_7d_percentile
            )}; sample size ${global.sample_size}.`
          : null,
        region
          ? `- Region${region.country_code ? ` (${region.country_code})` : ''}: relative weekly load ${formatPercentile(
              region.relative_weekly_load_percentile
            )}, sessions ${formatPercentile(region.sessions_7d_percentile)}, cardio ${formatPercentile(
              region.cardio_minutes_7d_percentile
            )}; sample size ${region.sample_size}.`
          : null,
      ]
        .filter(Boolean)
        .join('\n')
    );
  } else if (benchmarks.data?.message) {
    sections.push(`Global leaderboard and benchmark context:\n- ${benchmarks.data.message}`);
  }

  if (friends.data?.length) {
    sections.push(
      [
        'Friend leaderboard:',
        ...friends.data.slice(0, 10).map((friend, index) => {
          const name = friend.displayName ?? `Friend ${index + 1}`;
          return `- ${name}: ${
            friend.weeklyVolumeKg != null ? `${Math.round(friend.weeklyVolumeKg)} kg weekly volume` : 'volume hidden'
          }, ${
            friend.sessionCount7d != null ? `${friend.sessionCount7d} sessions last 7d` : 'sessions hidden'
          }${friend.bestLiftLabel ? `, best lift ${friend.bestLiftLabel}` : ''}`;
        }),
      ].join('\n')
    );
  }

  if (health.length) {
    sections.push(
      [
        'Recent health and activity data from device:',
        ...health.slice(0, 7).map((day) => {
          return `- ${day.day}: ${compactLine([
            day.steps != null ? `${Math.round(day.steps)} steps` : null,
            day.activeEnergyKcal != null ? `${Math.round(day.activeEnergyKcal)} active kcal` : null,
            day.exerciseMinutes != null ? `${Math.round(day.exerciseMinutes)} exercise min` : null,
            day.sleepMinutes != null ? `${formatMinutes(day.sleepMinutes)} sleep` : null,
            day.restingHeartRateBpm != null ? `${Math.round(day.restingHeartRateBpm)} bpm resting HR` : null,
            day.avgHeartRateBpm != null ? `${Math.round(day.avgHeartRateBpm)} bpm avg HR` : null,
            day.hrvSdnnMs != null ? `${Math.round(day.hrvSdnnMs)} ms HRV` : null,
            day.bodyMassKg != null ? `body mass ${formatBodyweight(day.bodyMassKg, weightUnit)}` : null,
          ])}`;
        }),
      ].join('\n')
    );
  }

  if (exercises.length) {
    sections.push(
      [
        'Available exercises:',
        ...exercises
          .slice(0, 120)
          .map(
            (e) =>
              `- ${e.name} (${e.muscleGroup}, ${e.trackingMode}${e.isCustom ? ', custom' : ''})`
          ),
      ].join('\n')
    );
  }

  if (templates.length) {
    sections.push(
      [
        'Saved routines:',
        ...templates.slice(0, 20).map((t) => {
          const names = t.exerciseIds.map((id) => exById[id]?.name ?? 'Unknown exercise');
          return `- ${t.name}: ${names.join(', ') || '(no exercises)'}`;
        }),
      ].join('\n')
    );
  }

  if (blocks.length) {
    sections.push(
      [
        'Recent completed workouts:',
        ...blocks.map(({ session, sets }) => {
          const when = session.endedAt ?? session.startedAt;
          const parts = sets.map((s) => {
            const ex = exById[s.exerciseId];
            const name = ex?.name ?? 'Exercise';
            return `${name}: ${formatSetSummary(ex ?? null, s, weightUnit)}`;
          });
          return `- ${when.slice(0, 10)}: ${parts.join('; ') || '(no sets)'}`;
        }),
      ].join('\n')
    );
  }

  return sections.join('\n\n');
}
