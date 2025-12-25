/**
 * Calculate estimated 1RM using Epley formula
 * @param weight - Weight lifted
 * @param reps - Number of reps performed
 * @returns Estimated one-rep max
 */
export function calculateOneRM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  if (reps === 0) return 0;
  
  // Epley formula: 1RM = weight × (1 + reps/30)
  return weight * (1 + reps / 30);
}

/**
 * Calculate estimated 1RM using Brzycki formula
 * @param weight - Weight lifted
 * @param reps - Number of reps performed
 * @returns Estimated one-rep max
 */
export function calculateOneRMBrzycki(weight: number, reps: number): number {
  if (reps === 1) return weight;
  if (reps === 0) return 0;
  
  // Brzycki formula: 1RM = weight / (1.0278 - 0.0278 × reps)
  return weight / (1.0278 - 0.0278 * reps);
}

