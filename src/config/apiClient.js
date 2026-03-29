import axios from 'axios';
import { getAuthData, clearAuthData } from '../utils/auth';

/**
 * Robust API Client with Fallback Logic
 * 1. Tries primary URL (e.g., /api/v1)
 * 2. If network error, retries with fallback (/api)
 * 3. In dev mode, if still fails, tries common ports (5001, 5002)
 */

const getInitialBaseUrl = () => {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl && envUrl.startsWith('http')) return envUrl;
    return 'http://localhost:5000/api/v1';
};

let currentBaseUrl = getInitialBaseUrl();

const api = axios.create({
    baseURL: currentBaseUrl,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor: Attach Auth Token
api.interceptors.request.use(
    (config) => {
        const authData = getAuthData();
        if (authData && authData.token) {
            config.headers.Authorization = `Bearer ${authData.token}`;
        }
        // Sync with currentBaseUrl if it changed
        config.baseURL = currentBaseUrl;
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor: Fallback Logic
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const { config, response } = error;

        // If it's a network error (no response) and we haven't retried yet
        if (!response && !config._isRetry) {
            config._isRetry = true;

            // Step 1: Try stripping /v1
            if (config.baseURL.endsWith('/api/v1')) {
                console.warn('[API Client] Retrying without /v1...');
                const fallbackUrl = config.baseURL.replace('/api/v1', '/api');
                config.baseURL = fallbackUrl;
                return api(config);
            }

            // Step 2: Try alternative ports in development
            if (import.meta.env.DEV) {
                const alternativePorts = [5001, 5002];
                for (const port of alternativePorts) {
                    if (!config.baseURL.includes(`:${port}`)) {
                        console.warn(`[API Client] Trying port ${port}...`);
                        const fallbackUrl = `http://localhost:${port}/api`;
                        config.baseURL = fallbackUrl;
                        try {
                            return await api(config);
                        } catch (e) {
                            // continue to next port
                        }
                    }
                }
            }
        }

        // Final error handling
        if (!response) {
            error.message = `Cannot reach server at ${currentBaseUrl}. Tried v1, v0, and alternative ports. Ensure backend is running.`;
        } else if (response.status === 401) {
            clearAuthData();
        }

        return Promise.reject(error);
    }
);

export const apiClient = api;
export default api;
