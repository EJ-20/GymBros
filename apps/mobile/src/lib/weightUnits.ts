/** Canonical storage is always kg in SQLite / Supabase. */
export type WeightUnit = 'kg' | 'lbs';

const LB_PER_KG = 2.2046226218487757;

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

export function weightUnitLabel(unit: WeightUnit): string {
  return unit === 'kg' ? 'kg' : 'lb';
}

/** Parse user input in the selected unit → kg for persistence. */
export function parseWeightInputToKg(text: string, unit: WeightUnit): number | null {
  const v = parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(v) || v < 0) return null;
  return unit === 'kg' ? v : lbToKg(v);
}

/** Format kg → input/display string in the selected unit (1 decimal when needed). */
export function formatWeightFromKgForInput(kg: number, unit: WeightUnit): string {
  const n = unit === 'kg' ? kg : kgToLb(kg);
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Volume stored as Σ(reps × kg); scale for lb·reps display. */
export function volumeKgToDisplayNumber(volumeKg: number, unit: WeightUnit): number {
  return Math.round(unit === 'lbs' ? volumeKg * LB_PER_KG : volumeKg);
}

export function volumeUnitSuffix(unit: WeightUnit): string {
  return unit === 'lbs' ? 'lb·reps' : 'kg·reps';
}
