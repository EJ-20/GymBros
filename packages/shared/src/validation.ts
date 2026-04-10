import { z } from 'zod';

export const muscleGroupSchema = z.enum([
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'core',
  'cardio',
  'full_body',
]);

export const exerciseTrackingModeSchema = z.enum([
  'weight_reps',
  'bodyweight_reps',
  'time',
  'time_distance',
]);

export const exerciseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  muscleGroup: muscleGroupSchema,
  equipment: z.string().max(80).optional(),
  isCustom: z.boolean(),
  createdAt: z.string().datetime(),
  trackingMode: exerciseTrackingModeSchema,
});

export const workoutSessionSchema = z.object({
  id: z.string().uuid(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  notes: z.string().max(2000).nullable(),
  perceivedExertion: z.number().min(1).max(10).nullable(),
  source: z.enum(['phone', 'watch']),
});

export const setLogSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  exerciseId: z.string().uuid(),
  orderIndex: z.number().int().min(0),
  reps: z.number().int().min(0).nullable(),
  weightKg: z.number().min(0).nullable(),
  durationSec: z.number().int().min(0).nullable(),
  distanceM: z.number().min(0).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
});

export const privacySettingsSchema = z.object({
  shareWeeklyVolume: z.boolean(),
  shareSessionCount: z.boolean(),
  shareBestLifts: z.boolean(),
});
