import api from '../config/api';

/**
 * Conversation API Service
 */

/**
 * Fetch all conversations with filtering
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>}
 */
export const getConversations = async (params = {}) => {
    try {
        const response = await api.get('/conversations', params);
        return response.data;
    } catch (error) {
        console.error('Error fetching conversations:', error);
        throw error;
    }
};

/**
 * Fetch a single conversation by ID
 * @param {string} id - Conversation ID
 * @returns {Promise<Object>}
 */
export const getConversation = async (id) => {
    try {
        const response = await api.get(`/conversations/${id}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching conversation:', error);
        throw error;
    }
};

/**
 * Fetch conversations for a specific customer
 * @param {string} customerId - Customer ID
 * @param {Object} params - Query parameters (limit, page)
 * @returns {Promise<Object>}
 */
export const getConversationsByCustomer = async (customerId, params = {}) => {
    try {
        const response = await api.get(`/conversations/customer/${customerId}`, params);
        return response.data;
    } catch (error) {
        console.error('Error fetching customer conversations:', error);
        throw error;
    }
};

/**
 * Create a new conversation
 * @param {Object} conversationData - Conversation data
 * @returns {Promise<Object>}
 */
export const createConversation = async (conversationData) => {
    try {
        const response = await api.post('/conversations', conversationData);
        return response.data;
    } catch (error) {
        console.error('Error creating conversation:', error);
        throw error;
    }
};

/**
 * Update an existing conversation
 * @param {string} id - Conversation ID
 * @param {Object} conversationData - Updated conversation data
 * @returns {Promise<Object>}
 */
export const updateConversation = async (id, conversationData) => {
    try {
        const response = await api.patch(`/conversations/${id}`, conversationData);
        return response.data;
    } catch (error) {
        console.error('Error updating conversation:', error);
        throw error;
    }
};

/**
 * Delete a conversation
 * @param {string} id - Conversation ID
 * @returns {Promise<Object>}
 */
export const deleteConversation = async (id) => {
    try {
        const response = await api.delete(`/conversations/${id}`);
        return response.data;
    } catch (error) {
        console.error('Error deleting conversation:', error);
        throw error;
    }
};

export default {
    getConversations,
    getConversation,
    getConversationsByCustomer,
    createConversation,
    updateConversation,
    deleteConversation,
};
