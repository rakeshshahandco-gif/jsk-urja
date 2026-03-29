import apiClient from '../config/apiClient';

/**
 * Fetches all users from the backend.
 * @param {Object} params - Query parameters (limit, status, etc.)
 * @returns {Promise<Object>} - Returns an object containing the users array.
 */
export const getUsers = async (params) => {
    const response = await apiClient.get('/users', { params });
    // The components expect either res.users or res.data.users or just res.
    // Based on PrdIssueTab.jsx: (res.users || res.data?.users || [])
    // We wrap the data to ensure compatibility with the existing PRD feature components.
    return {
        users: response.data.data,
        data: {
            users: response.data.data
        }
    };
};

/**
 * Fetches a single user by ID.
 * @param {string} id - User ID
 * @returns {Promise<Object>} - User data
 */
export const getUser = async (id) => {
    const response = await apiClient.get(`/users/${id}`);
    return response.data.data;
};

/**
 * Creates a new user.
 * @param {Object} userData - User details
 * @returns {Promise<Object>} - Created user data
 */
export const createUser = async (userData) => {
    const response = await apiClient.post('/users', userData);
    return response.data.data;
};

/**
 * Updates an existing user.
 * @param {string} id - User ID
 * @param {Object} userData - Updated user details
 * @returns {Promise<Object>} - Updated user data
 */
export const updateUser = async (id, userData) => {
    const response = await apiClient.patch(`/users/${id}`, userData);
    return response.data.data;
};

/**
 * Deletes a user.
 * @param {string} id - User ID
 * @returns {Promise<Object>} - Response data
 */
export const deleteUser = async (id) => {
    const response = await apiClient.delete(`/users/${id}`);
    return response.data.data;
};
