import { recentSessionsForContext } from '@/src/db/workoutRepo';

export function buildCoachContextSummary(maxSessions = 6): string {
  const blocks = recentSessionsForContext(maxSessions);
  if (!blocks.length) return '';

  return blocks
    .map(({ session, sets, exerciseNames }) => {
      const when = session.endedAt ?? session.startedAt;
      const parts = sets.map((s) => {
        const name = exerciseNames[s.exerciseId] ?? 'Exercise';
        const w = s.weightKg != null ? `${s.weightKg}kg` : '';
        const r = s.reps != null ? `${s.reps} reps` : '';
        const t = s.durationSec != null ? `${s.durationSec}s` : '';
        return [name, w && r ? `${r} @ ${w}` : r || w, t].filter(Boolean).join(' ');
      });
      return `${when.slice(0, 10)}: ${parts.join('; ') || '(no sets)'}`;
    })
    .join('\n');
}
