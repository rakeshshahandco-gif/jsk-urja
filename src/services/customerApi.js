import { apiClient } from '../lib/apiClient';

/**
 * Customer API Service
 */

/**
 * Fetch all customers with pagination, search, and filtering
 * @param {Object} params - Query parameters
 * @param {number} params.page - Page number
 * @param {number} params.limit - Items per page
 * @param {string} params.search - Search query
 * @param {string} params.status - Filter by status
 * @param {string} params.customerStatus - Filter by customer status
 * @param {string} params.sortBy - Sort criteria (e.g., 'createdAt:desc')
 * @returns {Promise<Object>} - { results, page, limit, totalPages, totalResults }
 */
export const getCustomers = async (params = {}) => {
    try {
        const response = await apiClient.get('/customers', { params });
        return response.data.data; // structure depends on backend. api.js returned .json(). axios returns {data: ...}. 
        // Backend returns: new ApiResponse(200, result, ...) -> { statusCode, data: result, ... }
        // api.js was likely implicitly unwrapping or backend structure is { data }.
        // Let's look at customer.controller.js: res.send(new ApiResponse(200, result, ...))
        // ApiResponse usually has { statusCode, data, message, success }.
        // So response.data is the full object. response.data.data is the result.
        // wait, api.js get method returned apiRequest(...).then(res => res.json()).
        // So getCustomers returned response.data?
        // Let's verify CustomerController.getCustomers response structure. 
        // It returns `new ApiResponse(200, result)`.
        // Result is { data: customers, meta: ... }.
        // So the JSON is { statusCode: 200, data: { data: [], meta: ... }, message: ... }.
        // customerApi.js getCustomers returned response.data. 
        // If response was the JSON, response.data -> { data: [], meta: ... }.
        // axios response.data is the JSON. 
        // So we return response.data.data.
        // Wait! customerApi.js said `return response.data`.
        // If `response` was the JSON from fetch, then `header` or `body`?
        // fetch response.json() gives the body object.
        // So `response` in customerApi (from api.get) is the body object.
        // So `response.data` is the { data: [], meta: ... } object?
        // Yes.
        // So For axios: response.data IS the body object.
        // So return response.data.data.
    } catch (error) {
        console.error('Error fetching customers:', error);
        throw new Error(error.response?.data?.message || error.message);
    }
};

export const getCustomer = async (id) => {
    try {
        const response = await apiClient.get(`/customers/${id}`);
        return response.data.data;
    } catch (error) {
        console.error('Error fetching customer:', error);
        throw error;
    }
};

export const getCustomerTypes = async () => {
    try {
        const response = await apiClient.get('/customers/types');
        return response.data.data;
    } catch (error) {
        console.error('Error fetching customer types:', error);
        throw new Error(error.response?.data?.message || error.message);
    }
};

export const getCustomerStickers = async () => {
    try {
        const response = await apiClient.get('/customers/stickers');
        return response.data.data;
    } catch (error) {
        console.error('Error fetching customer stickers:', error);
        throw new Error(error.response?.data?.message || error.message);
    }
};

export const createCustomer = async (customerData) => {
    try {
        const response = await apiClient.post('/customers', customerData);
        return response.data.data;
    } catch (error) {
        console.error('Error creating customer:', error);
        throw error;
    }
};

export const updateCustomer = async (id, customerData) => {
    try {
        const response = await apiClient.put(`/customers/${id}`, customerData);
        return response.data.data;
    } catch (error) {
        console.error('Error updating customer:', error);
        throw new Error(error.response?.data?.message || error.message);
    }
};

export const deleteCustomer = async (id) => {
    try {
        const response = await apiClient.delete(`/customers/${id}`);
        return response.data.data;
    } catch (error) {
        console.error('Error deleting customer:', error);
        throw error;
    }
};

export const getCustomerConversations = async (customerId, params = {}) => {
    try {
        const response = await apiClient.get(`/customers/${customerId}/conversations`, { params });
        return response.data.data;
    } catch (error) {
        console.error('Error fetching customer conversations:', error);
        throw error;
    }
};

export const getConversationHistory = async (customerId, params = {}) => {
    try {
        const response = await apiClient.get(`/customers/${customerId}/conversation-history`, { params });
        return response.data.data;
    } catch (error) {
        console.error('Error fetching conversation history:', error);
        throw error;
    }
};

/**
 * Download customer import template
 * @returns {Promise<Blob>} - Excel file blob
 */
export const downloadCustomerTemplate = async () => {
    try {
        const response = await apiClient.get('/customers/template/download', {
            responseType: 'blob',
        });
        return response.data;
    } catch (error) {
        console.error('Error downloading template:', error);
        throw error;
    }
};

/**
 * Import customers from Excel file
 * @param {FormData} formData - Form data containing the file
 * @returns {Promise<Object>} - Import results
 */
export const importCustomers = async (formData) => {
    try {
        const response = await apiClient.post('/customers/import', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data.data;
    } catch (error) {
        console.error('Error importing customers:', error);
        throw error;
    }
};

export default {
    getCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomerTypes,
    getCustomerStickers,
    getCustomerConversations,
    getConversationHistory,
    downloadCustomerTemplate,
    importCustomers,
};
