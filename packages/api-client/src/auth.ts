import { apiClient } from './client';
import type { User, CreateUserInput } from '@gymbros/types';

export const authApi = {
  login: async (email: string, password: string) => {
    return apiClient.post<{ user: User; token: string }>('/auth/login', {
      email,
      password,
    });
  },

  register: async (input: CreateUserInput & { password: string }) => {
    return apiClient.post<{ user: User; token: string }>('/auth/register', input);
  },

  getCurrentUser: async () => {
    return apiClient.get<User>('/auth/me');
  },
};

