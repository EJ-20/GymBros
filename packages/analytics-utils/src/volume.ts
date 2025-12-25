/**
 * Calculate total volume (weight × reps) for a set
 * @param weight - Weight lifted
 * @param reps - Number of reps performed
 * @returns Total volume
 */
export function calculateSetVolume(weight: number, reps: number): number {
  return weight * reps;
}

/**
 * Calculate total volume for multiple sets
 * @param sets - Array of sets with weight and reps
 * @returns Total volume
 */
export function calculateTotalVolume(
  sets: Array<{ weight: number; reps: number }>
): number {
  return sets.reduce((total, set) => {
    return total + calculateSetVolume(set.weight, set.reps);
  }, 0);
}

