import { apiClient } from '../lib/apiClient';

/**
 * Follow-up API Service
 */

/**
 * Fetch all follow-ups with filtering
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>}
 */
export const getFollowups = async (params = {}) => {
    try {
        const response = await apiClient.get('/followups', { params });
        return response.data.data || response.data;
    } catch (error) {
        console.error('Error fetching follow-ups:', error);
        throw error;
    }
};

export const getFollowup = async (id) => {
    try {
        const response = await apiClient.get(`/followups/${id}`);
        return response.data.data || response.data;
    } catch (error) {
        console.error('Error fetching follow-up:', error);
        throw error;
    }
};

export const getFollowupByCustomer = async (customerId) => {
    try {
        const response = await apiClient.get(`/followups/customer/${customerId}`);
        return response.data.data || response.data;
    } catch (error) {
        console.error('Error fetching customer follow-up:', error);
        throw error;
    }
};

export const getUpcomingFollowups = async () => {
    try {
        const response = await apiClient.get('/followups/upcoming');
        return response.data.data || response.data;
    } catch (error) {
        console.error('Error fetching upcoming follow-ups:', error);
        throw error;
    }
};

export const createFollowup = async (followupData) => {
    try {
        const response = await apiClient.post('/followups', followupData);
        return response.data.data || response.data;
    } catch (error) {
        console.error('Error creating follow-up:', error);
        throw error;
    }
};

export const updateFollowup = async (id, followupData) => {
    try {
        const response = await apiClient.patch(`/followups/${id}`, followupData);
        return response.data.data || response.data;
    } catch (error) {
        console.error('Error updating follow-up:', error);
        throw error;
    }
};

export const deleteFollowup = async (id) => {
    try {
        const response = await apiClient.delete(`/followups/${id}`);
        return response.data.data || response.data;
    } catch (error) {
        console.error('Error deleting follow-up:', error);
        throw error;
    }
};

export default {
    getFollowups,
    getFollowup,
    getFollowupByCustomer,
    getUpcomingFollowups,
    createFollowup,
    updateFollowup,
    deleteFollowup,
};
