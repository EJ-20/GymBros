import type { Exercise, SetLog } from '@gymbros/shared';
import {
  formatWeightFromKgForInput,
  weightUnitLabel,
  type WeightUnit,
} from '@/src/lib/weightUnits';

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || sec < 0 || !Number.isFinite(sec)) return '—';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${String(mm).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Display distance: km when weight unit is metric, miles when lbs. */
export function formatDistanceFromMeters(m: number | null | undefined, unit: WeightUnit): string {
  if (m == null || m <= 0 || !Number.isFinite(m)) return '—';
  if (unit === 'lbs') {
    return `${(m / 1609.344).toFixed(2)} mi`;
  }
  return `${(m / 1000).toFixed(2)} km`;
}

export function parseDistanceInputToMeters(text: string, unit: WeightUnit): number | null {
  const n = parseFloat(text.replace(',', '.').trim());
  if (!Number.isFinite(n) || n < 0) return null;
  if (unit === 'lbs') return n * 1609.344;
  return n * 1000;
}

export function formatDistanceInputFromMeters(m: number, unit: WeightUnit): string {
  if (unit === 'lbs') return (m / 1609.344).toFixed(2);
  return (m / 1000).toFixed(2);
}

export function formatSetSummary(ex: Exercise | null | undefined, s: SetLog, unit: WeightUnit): string {
  const mode = ex?.trackingMode ?? 'weight_reps';
  switch (mode) {
    case 'time':
      return formatDuration(s.durationSec);
    case 'time_distance': {
      const t = formatDuration(s.durationSec);
      const d = formatDistanceFromMeters(s.distanceM, unit);
      return `${t} · ${d}`;
    }
    case 'bodyweight_reps':
      return `${s.reps ?? '—'} reps`;
    default: {
      const w =
        s.weightKg != null
          ? `${formatWeightFromKgForInput(s.weightKg, unit)} ${weightUnitLabel(unit)}`
          : '—';
      return `${s.reps ?? '—'} × ${w}`;
    }
  }
}

export function distanceFieldLabel(unit: WeightUnit): string {
  return unit === 'lbs' ? 'Distance (mi)' : 'Distance (km)';
}
