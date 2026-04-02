import type { WorkoutSession } from '@gymbros/shared';
import * as repo from '@/src/db/workoutRepo';

const MS_DAY = 86_400_000;

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayKeyFromEndedAt(iso: string): string {
  const d = new Date(iso);
  return localDateKey(d);
}

function startOfTodayLocal(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/** Consecutive calendar days (local) ending at the most recent workout day with training logged. */
export function workoutStreakDays(completed: WorkoutSession[]): number {
  const keys = new Set(completed.map((s) => dayKeyFromEndedAt(s.endedAt!)));
  if (keys.size === 0) return 0;
  let cursor = startOfTodayLocal();
  if (!keys.has(localDateKey(cursor))) {
    cursor = new Date(cursor.getTime() - MS_DAY);
  }
  if (!keys.has(localDateKey(cursor))) return 0;
  let streak = 0;
  for (;;) {
    const k = localDateKey(cursor);
    if (!keys.has(k)) break;
    streak++;
    cursor = new Date(cursor.getTime() - MS_DAY);
  }
  return streak;
}

function inRollingWindow(endedAt: string, now: number, startOffsetMs: number, endOffsetMs: number): boolean {
  const t = new Date(endedAt).getTime();
  return t >= now - endOffsetMs && t < now - startOffsetMs;
}

export type HomeDashboardStats = {
  last7: { sessions: number; totalSets: number; totalMin: number };
  prev7: { sessions: number; totalSets: number };
  last30: { sessions: number; totalSets: number };
  streakDays: number;
  allTimeCompleted: number;
  topExerciseLast7: { name: string; setCount: number } | null;
  lastSession: WorkoutSession | null;
  activeSession: WorkoutSession | null;
};

export function getHomeDashboardStats(): HomeDashboardStats {
  const activeSession = repo.getActiveSession();
  const raw = repo.listSessions(400);
  const completed = raw.filter((s) => s.endedAt);
  const now = Date.now();

  const last7 = completed.filter((s) => inRollingWindow(s.endedAt!, now, 0, 7 * MS_DAY));
  const prev7 = completed.filter((s) =>
    inRollingWindow(s.endedAt!, now, 7 * MS_DAY, 14 * MS_DAY)
  );
  const last30 = completed.filter((s) => inRollingWindow(s.endedAt!, now, 0, 30 * MS_DAY));

  let sets7 = 0;
  let min7 = 0;
  for (const s of last7) {
    sets7 += repo.sessionSetCount(s.id);
    const end = new Date(s.endedAt!).getTime();
    const start = new Date(s.startedAt).getTime();
    min7 += Math.max(0, Math.round((end - start) / 60_000));
  }
  let setsPrev7 = 0;
  for (const s of prev7) {
    setsPrev7 += repo.sessionSetCount(s.id);
  }
  let sets30 = 0;
  for (const s of last30) {
    sets30 += repo.sessionSetCount(s.id);
  }

  const exerciseSetCounts = new Map<string, number>();
  for (const s of last7) {
    for (const log of repo.listSetsForSession(s.id)) {
      exerciseSetCounts.set(log.exerciseId, (exerciseSetCounts.get(log.exerciseId) ?? 0) + 1);
    }
  }
  let topExerciseLast7: { name: string; setCount: number } | null = null;
  for (const [exerciseId, setCount] of exerciseSetCounts) {
    if (!topExerciseLast7 || setCount > topExerciseLast7.setCount) {
      const ex = repo.getExerciseById(exerciseId);
      topExerciseLast7 = { name: ex?.name ?? 'Exercise', setCount };
    }
  }

  return {
    last7: { sessions: last7.length, totalSets: sets7, totalMin: min7 },
    prev7: { sessions: prev7.length, totalSets: setsPrev7 },
    last30: { sessions: last30.length, totalSets: sets30 },
    streakDays: workoutStreakDays(completed),
    allTimeCompleted: repo.countCompletedSessions(),
    topExerciseLast7,
    lastSession: completed[0] ?? null,
    activeSession,
  };
}
