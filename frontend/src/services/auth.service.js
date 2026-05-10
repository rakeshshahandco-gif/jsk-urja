import api from './api';
import { clearAuthData, saveAuthData } from '@/utils/auth';

export const authService = {
    // Login user
    login: async (username, password) => {
        const { data } = await api.post('/auth/login', { username, password });
        if (data.success && data.data.token) {
            saveAuthData(data.data, data.data.token);
        }
        return data;
    },

    // Register user (Admin only usually, but endpoint exists)
    register: async (userData) => {
        const { data } = await api.post('/auth/register', userData);
        return data;
    },

    // Get current user profile
    getMe: async () => {
        const { data } = await api.get('/auth/me');
        // data = { success: true, data: { ...user }, message: '...' }
        // Return the inner data (actual user) so callers don't have to unwrap
        return data;
    },

    // Logout
    logout: async () => {
        clearAuthData();
        // Optional: Call backend logout if you implement a blacklist
    },

    // Update Notification Settings
    updateNotificationSettings: async (settings) => {
        const { data } = await api.put('/auth/notification-settings', settings);
        return data;
    }
};
