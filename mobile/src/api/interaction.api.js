import apiClient from './client';

export const followupApi = {
  getFollowups: async (params = {}) => {
    const response = await apiClient.get('/followups', { params });
    return response.data?.data || response.data;
  },
  
  getFollowupByCustomer: async (customerId) => {
    const response = await apiClient.get(`/followups/customer/${customerId}`);
    return response.data?.data || response.data;
  },

  createFollowup: async (data) => {
    const response = await apiClient.post('/followups', data);
    return response.data?.data || response.data;
  },

  updateFollowup: async (id, data) => {
    const response = await apiClient.patch(`/followups/${id}`, data);
    return response.data?.data || response.data;
  }
};

export const conversationApi = {
  getConversationsByCustomer: async (customerId, params = {}) => {
    const response = await apiClient.get(`/customers/${customerId}/conversations`, { params });
    return response.data?.data || response.data;
  },
  
  getConversationHistory: async (customerId) => {
    const response = await apiClient.get(`/customers/${customerId}/conversation-history`);
    return response.data?.data || response.data;
  },

  createConversation: async (data) => {
    const response = await apiClient.post('/conversations', data);
    return response.data?.data || response.data;
  }
};

export const reminderApi = {
  getReminders: async (params = {}) => {
    const response = await apiClient.get('/reminders', { params });
    return response.data?.data || response.data;
  },

  createReminder: async (data) => {
    const response = await apiClient.post('/reminders', data);
    return response.data?.data || response.data;
  },

  upsertCustomerReminder: async (customerId, data) => {
    const response = await apiClient.put(`/customers/${customerId}/reminder`, data);
    return response.data?.data || response.data;
  },

  closeReminder: async (id) => {
    const response = await apiClient.put(`/reminders/${id}/close`);
    return response.data?.data || response.data;
  }
};
