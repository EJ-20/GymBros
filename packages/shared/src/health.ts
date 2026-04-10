import { z } from 'zod';

/**
 * One calendar day of health metrics (local YYYY-MM-DD).
 * Populated by a native watch companion, HealthKit / Health Connect imports, or phone sensors.
 */
export const healthWatchPayloadSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  steps: z.number().int().nonnegative().optional(),
  activeEnergyKcal: z.number().nonnegative().optional(),
  restingHeartRateBpm: z.number().positive().optional(),
  avgHeartRateBpm: z.number().positive().optional(),
  sleepMinutes: z.number().int().nonnegative().optional(),
  exerciseMinutes: z.number().int().nonnegative().optional(),
  distanceMeters: z.number().nonnegative().optional(),
  vo2Max: z.number().positive().optional(),
  bloodOxygenPercent: z.number().min(0).max(100).optional(),
  respiratoryRate: z.number().positive().optional(),
  hrvSdnnMs: z.number().nonnegative().optional(),
  bodyMassKg: z.number().positive().optional(),
  source: z.enum(['watch', 'phone', 'import']).optional(),
  extra: z.record(z.unknown()).optional(),
});

export type HealthWatchPayload = z.infer<typeof healthWatchPayloadSchema>;
