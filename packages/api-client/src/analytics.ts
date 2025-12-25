import { apiClient } from './client';
import type { AnalyticsData, OneRM, Volume } from '@gymbros/types';

export const analyticsApi = {
  getAnalytics: async (userId: string) => {
    return apiClient.get<AnalyticsData>(`/analytics/${userId}`);
  },

  getOneRM: async (userId: string, exercise?: string) => {
    const endpoint = exercise
      ? `/analytics/${userId}/one-rm?exercise=${exercise}`
      : `/analytics/${userId}/one-rm`;
    return apiClient.get<OneRM[]>(endpoint);
  },

  getVolume: async (userId: string, exercise?: string) => {
    const endpoint = exercise
      ? `/analytics/${userId}/volume?exercise=${exercise}`
      : `/analytics/${userId}/volume`;
    return apiClient.get<Volume[]>(endpoint);
  },
};

