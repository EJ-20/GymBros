import * as repo from '@/src/db/workoutRepo';
import type { ExerciseTrackingMode, MuscleGroup } from '@gymbros/shared';

export type CoachExerciseInput = {
  name: string;
  muscleGroup?: MuscleGroup;
  trackingMode?: ExerciseTrackingMode;
  equipment?: string;
};

export type CoachAction =
  | {
      type: 'createExercise';
      name: string;
      muscleGroup: MuscleGroup;
      trackingMode?: ExerciseTrackingMode;
      equipment?: string;
    }
  | {
      type: 'createRoutine';
      name: string;
      exercises: CoachExerciseInput[];
    };

export type AppliedCoachAction =
  | { type: 'createExercise'; name: string; created: boolean }
  | { type: 'createRoutine'; name: string; exerciseCount: number };

const MUSCLE_GROUPS = new Set<MuscleGroup>([
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'core',
  'cardio',
  'full_body',
]);

const TRACKING_MODES = new Set<ExerciseTrackingMode>([
  'weight_reps',
  'bodyweight_reps',
  'time',
  'time_distance',
]);

function cleanName(name: unknown, label: string): string {
  if (typeof name !== 'string') throw new Error(`${label} is missing a name.`);
  const trimmed = name.trim();
  if (!trimmed) throw new Error(`${label} is missing a name.`);
  if (trimmed.length > 80) throw new Error(`${label} name must be 80 characters or fewer.`);
  return trimmed;
}

function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function validateMuscleGroup(value: unknown): MuscleGroup {
  if (typeof value === 'string' && MUSCLE_GROUPS.has(value as MuscleGroup)) {
    return value as MuscleGroup;
  }
  throw new Error('New exercises need a valid muscle group.');
}

function validateTrackingMode(value: unknown): ExerciseTrackingMode {
  if (value == null) return 'weight_reps';
  if (typeof value === 'string' && TRACKING_MODES.has(value as ExerciseTrackingMode)) {
    return value as ExerciseTrackingMode;
  }
  return 'weight_reps';
}

function cleanEquipment(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 80) : undefined;
}

function findOrCreateExercise(input: CoachExerciseInput): string {
  const name = cleanName(input.name, 'Exercise');
  const existing = repo
    .listExercises()
    .find((exercise) => normalizeKey(exercise.name) === normalizeKey(name));
  if (existing) return existing.id;

  const created = repo.createExercise(name, validateMuscleGroup(input.muscleGroup), {
    equipment: cleanEquipment(input.equipment),
    trackingMode: validateTrackingMode(input.trackingMode),
  });
  return created.id;
}

export function describeCoachAction(action: CoachAction): string {
  if (action.type === 'createExercise') {
    return `Create exercise "${action.name}"`;
  }
  const exercises = action.exercises.map((exercise) => exercise.name).filter(Boolean);
  return `Create routine "${action.name}" with ${exercises.join(', ')}`;
}

export function applyCoachActions(actions: CoachAction[]): AppliedCoachAction[] {
  if (!actions.length) return [];
  if (actions.length > 3) throw new Error('Coach can apply up to 3 changes at a time.');

  const results: AppliedCoachAction[] = [];

  for (const action of actions) {
    if (action.type === 'createExercise') {
      const name = cleanName(action.name, 'Exercise');
      const existing = repo
        .listExercises()
        .find((exercise) => normalizeKey(exercise.name) === normalizeKey(name));
      if (existing) {
        results.push({ type: 'createExercise', name: existing.name, created: false });
        continue;
      }
      const created = repo.createExercise(name, validateMuscleGroup(action.muscleGroup), {
        equipment: cleanEquipment(action.equipment),
        trackingMode: validateTrackingMode(action.trackingMode),
      });
      results.push({ type: 'createExercise', name: created.name, created: true });
      continue;
    }

    if (action.type === 'createRoutine') {
      const name = cleanName(action.name, 'Routine');
      if (!Array.isArray(action.exercises) || !action.exercises.length) {
        throw new Error(`Routine "${name}" needs at least one exercise.`);
      }
      if (action.exercises.length > 16) {
        throw new Error(`Routine "${name}" can include up to 16 exercises.`);
      }

      const exerciseIds = action.exercises.map(findOrCreateExercise);
      const uniqueExerciseIds = Array.from(new Set(exerciseIds));
      repo.createTemplate(name, uniqueExerciseIds);
      results.push({ type: 'createRoutine', name, exerciseCount: uniqueExerciseIds.length });
    }
  }

  return results;
}
