import apiClient from './client';

export const itemsApi = {
  // Get all items with optional filters
  getItems: async (params = {}) => {
    const response = await apiClient.get('/items', { params });
    // Handle different API response formats
    return response.data?.data || response.data?.results || response.data || [];
  },

  // Get item by ID
  getItem: async (id) => {
    const response = await apiClient.get(`/items/${id}`);
    return response.data?.data || response.data;
  },

  // Search items (alias for getItems with search param)
  searchItems: async (query) => {
    const response = await apiClient.get('/items', { params: { search: query, limit: 20 } });
    return response.data?.data || response.data?.results || response.data || [];
  }
};
