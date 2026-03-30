import type { SetLog } from './types';

/** Best set by estimated 1RM (Epley): weight * (1 + reps/30). */
export function estimatedOneRmKg(weightKg: number, reps: number): number {
  if (reps <= 0) return weightKg;
  return weightKg * (1 + reps / 30);
}

export function isPrCandidate(
  set: Pick<SetLog, 'weightKg' | 'reps'>,
  priorBest: { weightKg: number; reps: number } | null
): boolean {
  if (set.weightKg == null || set.reps == null || set.reps < 1) return false;
  if (!priorBest) return true;
  const cur = estimatedOneRmKg(set.weightKg, set.reps);
  const prev = estimatedOneRmKg(priorBest.weightKg, priorBest.reps);
  return cur > prev + 0.01;
}

export function bestSetFromHistory(
  sets: Pick<SetLog, 'weightKg' | 'reps'>[]
): { weightKg: number; reps: number } | null {
  let best: { weightKg: number; reps: number } | null = null;
  let bestE = 0;
  for (const s of sets) {
    if (s.weightKg == null || s.reps == null || s.reps < 1) continue;
    const e = estimatedOneRmKg(s.weightKg, s.reps);
    if (e > bestE) {
      bestE = e;
      best = { weightKg: s.weightKg, reps: s.reps };
    }
  }
  return best;
}
