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

export function bestBodyweightRepsFromHistory(
  sets: Pick<SetLog, 'reps' | 'weightKg'>[]
): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (s.reps == null || s.reps < 1) continue;
    if (best == null || s.reps > best) best = s.reps;
  }
  return best;
}

export function isBodyweightRepsPrCandidate(
  reps: number,
  priorBestReps: number | null
): boolean {
  if (reps < 1) return false;
  if (priorBestReps == null) return true;
  return reps > priorBestReps;
}

export function bestDurationSecFromHistory(
  sets: Pick<SetLog, 'durationSec'>[]
): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (s.durationSec == null || s.durationSec < 1) continue;
    if (best == null || s.durationSec > best) best = s.durationSec;
  }
  return best;
}

export function isDurationPrCandidate(
  durationSec: number,
  priorBestSec: number | null
): boolean {
  if (durationSec < 1) return false;
  if (priorBestSec == null) return true;
  return durationSec > priorBestSec;
}

export function bestDistanceMFromHistory(
  sets: Pick<SetLog, 'distanceM'>[]
): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (s.distanceM == null || s.distanceM <= 0) continue;
    if (best == null || s.distanceM > best) best = s.distanceM;
  }
  return best;
}

export function isDistancePrCandidate(
  distanceM: number,
  priorBestM: number | null
): boolean {
  if (distanceM <= 0) return false;
  if (priorBestM == null) return true;
  return distanceM > priorBestM + 0.01;
}
