import { apiClient } from './client';
import type {
  Workout,
  CreateWorkoutInput,
  UpdateWorkoutInput,
} from '@gymbros/types';

export const workoutsApi = {
  getAll: async () => {
    return apiClient.get<Workout[]>('/workouts');
  },

  getById: async (id: string) => {
    return apiClient.get<Workout>(`/workouts/${id}`);
  },

  create: async (input: CreateWorkoutInput) => {
    return apiClient.post<Workout>('/workouts', input);
  },

  update: async (id: string, input: UpdateWorkoutInput) => {
    return apiClient.put<Workout>(`/workouts/${id}`, input);
  },

  delete: async (id: string) => {
    return apiClient.delete<void>(`/workouts/${id}`);
  },
};

