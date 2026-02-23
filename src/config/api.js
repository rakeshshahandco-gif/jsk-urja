const currentLocation = window.location.hostname === 'jsk-urja.onrender.com' ? 'https://jsk-urja-backend.onrender.com/api/v1' : 'http://localhost:5000/api/v1'
import { getAuthData } from '../utils/auth';

// API Configuration
// const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
const API_BASE_URL = currentLocation;

/**
 * Makes an HTTP request using fetch API
 * @param {string} endpoint - API endpoint path
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} - Response data
 */
export const apiRequest = async (endpoint, options = {}) => {
    const url = `${API_BASE_URL}${endpoint}`;

    const authData = getAuthData();
    const defaultHeaders = {
        'Content-Type': 'application/json',
    };

    if (authData && authData.token) {
        defaultHeaders['Authorization'] = `Bearer ${authData.token}`;
    }

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
    };

    try {
        const response = await fetch(url, config);

        // Check if request was successful
        if (!response.ok) {
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
            } catch (e) {
                // If not JSON, use default message
            }
            throw new Error(errorMessage);
        }

        // Handle different response types
        if (options.responseType === 'blob') {
            return await response.blob();
        }

        // Default to JSON
        return await response.json();
    } catch (error) {
        console.error('API Request Error:', error);
        throw error;
    }
};

/**
 * GET request helper
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>}
 */
export const get = async (endpoint, params = {}, options = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;

    return apiRequest(url, {
        method: 'GET',
        ...options
    });
};

/**
 * POST request helper
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Request body
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>}
 */
export const post = async (endpoint, data = {}, options = {}) => {
    return apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(data),
        ...options
    });
};

/**
 * PATCH request helper
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Request body
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>}
 */
export const patch = async (endpoint, data = {}, options = {}) => {
    return apiRequest(endpoint, {
        method: 'PATCH',
        body: JSON.stringify(data),
        ...options
    });
};

/**
 * PUT request helper
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Request body
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>}
 */
export const put = async (endpoint, data = {}, options = {}) => {
    return apiRequest(endpoint, {
        method: 'PUT',
        body: JSON.stringify(data),
        ...options
    });
};

/**
 * DELETE request helper
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>}
 */
export const del = async (endpoint, options = {}) => {
    return apiRequest(endpoint, {
        method: 'DELETE',
        ...options
    });
};

export default {
    get,
    post,
    patch,
    put,
    delete: del,
};
