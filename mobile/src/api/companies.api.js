import apiClient from './client';

export const companiesApi = {
  getActiveCompanies: async () => {
    const response = await apiClient.get('/companies/active');
    return response.data?.data || response.data || [];
  },
};
