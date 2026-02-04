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
        return response.data; // Backend for getFollowups returns result directly in controller (e.g. { results: [], ... }) OR ApiResponse? 
        // Need to check followup.controller.js. Assuming consistent ApiResponse, it should be response.data.data.
        // But let's check legacy usage: `return response.data`. 
        // If api.js returned the JSON body, and getFollowups returned .data, then the body had a .data property.
        // If the backend returned raw JSON (not ApiResponse), then .data might be undefined if not wrapped.

        // Safety: let's return response.data for now and assume it matches the body structure unless wrapped.
        // If backend returns { results: [...] } directly (without 'data' wrapper), then previous code `response.data` seems wrong if api.js returned the body.
        // Unless api.js returned { data: body }? No, lines 46: return await response.json().

        // Let's assume consistent ApiResponse wrapper. 
        // Actually, let's play safe and return response.data if we want the BODY.
        // But previous code was `return response.data`. So the body MUST have had a `data` property.
        // So for Axios, `response.data` is the body. So we want `response.data.data`.
        // BUT wait. If `getFollowups` returns `{ results, page ... }`, then `response.data` (body) IS that object if NOT wrapped.
        // If wrapped in ApiResponse, body is { statusCode, data: { results... }, message }.
        // Then `response.data` (body).data is correct.

        // Let's stick to the pattern: Axios `response.data` == Fetch `await response.json()`.
        // So `response.data.data` replaces `(await response.json()).data`.
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
