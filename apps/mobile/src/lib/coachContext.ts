import { listExercises, recentSessionsForContext } from '@/src/db/workoutRepo';
import { formatSetSummary } from '@/src/lib/setDisplay';
import type { WeightUnit } from '@/src/lib/weightUnits';

export function buildCoachContextSummary(maxSessions = 6, weightUnit: WeightUnit = 'kg'): string {
  const blocks = recentSessionsForContext(maxSessions);
  if (!blocks.length) return '';

  const exercises = listExercises();
  const exById = Object.fromEntries(exercises.map((e) => [e.id, e]));

  return blocks
    .map(({ session, sets }) => {
      const when = session.endedAt ?? session.startedAt;
      const parts = sets.map((s) => {
        const ex = exById[s.exerciseId];
        const name = ex?.name ?? 'Exercise';
        return `${name}: ${formatSetSummary(ex ?? null, s, weightUnit)}`;
      });
      return `${when.slice(0, 10)}: ${parts.join('; ') || '(no sets)'}`;
    })
    .join('\n');
}
