import { recentSessionsForContext } from '@/src/db/workoutRepo';
import { formatWeightFromKgForInput, type WeightUnit } from '@/src/lib/weightUnits';

export function buildCoachContextSummary(maxSessions = 6, weightUnit: WeightUnit = 'kg'): string {
  const blocks = recentSessionsForContext(maxSessions);
  if (!blocks.length) return '';

  return blocks
    .map(({ session, sets, exerciseNames }) => {
      const when = session.endedAt ?? session.startedAt;
      const parts = sets.map((s) => {
        const name = exerciseNames[s.exerciseId] ?? 'Exercise';
        const w =
          s.weightKg != null
            ? `${formatWeightFromKgForInput(s.weightKg, weightUnit)}${weightUnit === 'lbs' ? 'lb' : 'kg'}`
            : '';
        const r = s.reps != null ? `${s.reps} reps` : '';
        const t = s.durationSec != null ? `${s.durationSec}s` : '';
        return [name, w && r ? `${r} @ ${w}` : r || w, t].filter(Boolean).join(' ');
      });
      return `${when.slice(0, 10)}: ${parts.join('; ') || '(no sets)'}`;
    })
    .join('\n');
}
