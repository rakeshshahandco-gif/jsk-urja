import apiClient from './client';

// Uses the SAME /api/v1/auth/login endpoint as the desktop CRM
export const authApi = {
  login: async (username, password) => {
    const response = await apiClient.post('/auth/login', { username, password });
    return response.data;
  },
  getMe: async () => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },
};
