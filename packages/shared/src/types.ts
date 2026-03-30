export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'legs'
  | 'core'
  | 'cardio'
  | 'full_body';

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment?: string;
  isCustom: boolean;
  createdAt: string;
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

export interface WorkoutTemplate {
  id: string;
  name: string;
  exerciseIds: string[];
  createdAt: string;
}
