export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'legs'
  | 'core'
  | 'cardio'
  | 'full_body';

/** How sets are logged in the workout UI. */
export type ExerciseTrackingMode =
  | 'weight_reps'
  | 'bodyweight_reps'
  | 'time'
  | 'time_distance';

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment?: string;
  isCustom: boolean;
  createdAt: string;
  trackingMode: ExerciseTrackingMode;
}

export interface WorkoutSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  perceivedExertion: number | null;
  source: 'phone' | 'watch';
}

export interface SetLog {
  id: string;
  sessionId: string;
  exerciseId: string;
  orderIndex: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  /** Meters; used with `time_distance` (e.g. run / treadmill). */
  distanceM: number | null;
  rpe: number | null;
}

export interface PrivacySettings {
  shareWeeklyVolume: boolean;
  shareSessionCount: boolean;
  shareBestLifts: boolean;
}

export interface ProfilePublic {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  privacy: PrivacySettings;
}

export interface FriendSummary {
  userId: string;
  displayName: string | null;
  weeklyVolumeKg: number | null;
  sessionCount7d: number | null;
  bestLiftLabel: string | null;
}

/** Result from server search for adding friends (display name or user id prefix). */
export type ProfileSearchRelationship = 'none' | 'friend' | 'pending_out' | 'pending_in';

export interface ProfileSearchHit {
  userId: string;
  displayName: string | null;
  relationship: ProfileSearchRelationship;
}

export interface MyTrainingStats {
  weeklyVolumeKg: number;
  sessions7d: number;
  bestLiftLabel: string | null;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  exerciseIds: string[];
  createdAt: string;
}
