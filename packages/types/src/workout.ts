export interface Workout {
  id: string;
  userId: string;
  name: string;
  date: Date;
  exercises: Exercise[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Exercise {
  id: string;
  name: string;
  sets: Set[];
}

export interface Set {
  id: string;
  reps: number;
  weight: number;
  rpe?: number;
  restSeconds?: number;
}

export interface CreateWorkoutInput {
  name: string;
  date: Date;
  exercises: CreateExerciseInput[];
}

export interface CreateExerciseInput {
  name: string;
  sets: CreateSetInput[];
}

export interface CreateSetInput {
  reps: number;
  weight: number;
  rpe?: number;
  restSeconds?: number;
}

export interface UpdateWorkoutInput {
  name?: string;
  date?: Date;
  exercises?: CreateExerciseInput[];
}

