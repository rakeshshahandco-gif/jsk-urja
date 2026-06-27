import apiClient from './client';
import { clampListParams, DEFAULT_LIMIT, DEFAULT_PAGE } from '../utils/pagination';

export const customersApi = {
  getCustomers: async (params = {}) => {
    const response = await apiClient.get('/customers', {
      params: clampListParams({
        page: DEFAULT_PAGE,
        limit: DEFAULT_LIMIT,
        ...params,
      }),
    });
    return response.data?.data || response.data;
  },

  getCustomer: async (id) => {
    const response = await apiClient.get(`/customers/${id}`);
    return response.data?.data || response.data;
  },

  createCustomer: async (customerData) => {
    // Ensure nested objects like contactPersons are handled correctly
    const response = await apiClient.post('/customers', customerData);
    return response.data?.data || response.data;
  },

  searchCustomers: async (q) => {
    const response = await apiClient.get('/customers/search', { params: { q } });
    return response.data?.data || response.data;
  },

  updateCustomer: async (id, data) => {
    const response = await apiClient.put(`/customers/${id}`, data);
    return response.data?.data || response.data;
  },
  
  deleteCustomer: async (id) => {
    const response = await apiClient.delete(`/customers/${id}`);
    return response.data;
  },

  getCustomerTypes: async () => {
    const response = await apiClient.get('/customers/types');
    return response.data?.data || response.data;
  },

  getCustomerStickers: async () => {
    const response = await apiClient.get('/customers/stickers');
    return response.data?.data || response.data;
  }
};
