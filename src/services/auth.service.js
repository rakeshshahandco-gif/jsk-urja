import api from './api';
import { clearAuthData, saveAuthData } from '@/utils/auth';

export const authService = {
    // Login user
    login: async (username, password) => {
        try {
            const { data } = await api.post('/auth/login', { username, password });
            if (data.success && data.data.token) {
                saveAuthData(data.data, data.data.token);
            }
            return data;
        } catch (error) {
            throw error;
        }
    },

    // Register user (Admin only usually, but endpoint exists)
    register: async (userData) => {
        const { data } = await api.post('/auth/register', userData);
        return data;
    },

    // Get current user profile
    getMe: async () => {
        const { data } = await api.get('/auth/me');
        return data;
    },

    // Logout
    logout: async () => {
        clearAuthData();
        // Optional: Call backend logout if you implement a blacklist
    }
};
