import axios from 'axios';
import { getAuthData, clearAuthData } from '@/utils/auth';

import { env } from '@/config/env';

export const prodBackend = 'https://jsk-urja-backend.onrender.com';
export const SOCKET_URL = env.SOCKET_URL;
export const currentLocation = env.API_URL;

// Create axios instance
const api = axios.create({
    baseURL: currentLocation.endsWith('/') ? currentLocation : `${currentLocation}/`,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor for adding token
api.interceptors.request.use(
    (config) => {
        const authData = getAuthData();
        if (authData && authData.token) {
            config.headers.Authorization = `Bearer ${authData.token}`;
        }

        // Add Financial Year filter to GET requests
        const selectedFY = localStorage.getItem('selectedFY');
        if (selectedFY && config.method === 'get') {
            // Skip for specific global routes
            const skipRoutes = ['/financial-years', '/company-profile', '/auth'];
            const shouldSkip = skipRoutes.some(route => config.url.includes(route));
            
            if (!shouldSkip) {
                config.params = config.params || {};
                if (!config.params.financialYear) {
                    config.params.financialYear = selectedFY;
                }
            }
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor for handling errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            // Token expired or invalid
            clearAuthData();
            // Optional: Redirect to login or trigger global logout event
            // window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default api;
