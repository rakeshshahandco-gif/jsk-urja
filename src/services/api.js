import axios from 'axios';
import { getAuthData, clearAuthData } from '@/utils/auth';

import { env } from '@/config/env';

export const prodBackend = 'https://jsk-urja-backend.onrender.com';
export const SOCKET_URL = env.SOCKET_URL;
export const currentLocation = env.API_URL;

const isRenderDeploy =
    typeof window !== 'undefined' &&
    window.location.hostname.endsWith('.onrender.com');

// Create axios instance
const api = axios.create({
    baseURL: currentLocation.endsWith('/') ? currentLocation : `${currentLocation}/`,
    // Render free tier can take 30–90s to wake; 10s caused false "Cannot reach server".
    timeout: isRenderDeploy ? 90000 : 10000,
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
            try {
                const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('jsk_selected_company') : null;
                if (raw) {
                    const co = JSON.parse(raw);
                    if (co && co._id) {
                        config.headers['X-Company-Id'] = co._id;
                    }
                }
            } catch {
                /* ignore invalid stored company */
            }
        }

        // Add Financial Year filter to GET requests
        const selectedFY = localStorage.getItem('selectedFY');
        if (selectedFY && config.method === 'get') {
            // Skip for specific global routes
            const skipRoutes = ['/financial-years', '/company-profile', '/auth'];
            const shouldSkip = skipRoutes.some(route => config.url.includes(route));
            
            if (!shouldSkip) {
                config.params = config.params || {};
                
                // If financialYear is explicitly 'all', remove it for backend to skip filtering
                if (config.params.financialYear === 'all') {
                    delete config.params.financialYear;
                } else if (!config.params.financialYear) {
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
