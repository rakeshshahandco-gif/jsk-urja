import axios from 'axios';
import { getAuthData, clearAuthData } from '../utils/auth';

import { env } from '../config/env';

export const apiClient = axios.create({
    baseURL: env.API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor: Attach Auth Token
apiClient.interceptors.request.use(
    (config) => {
        const authData = getAuthData();
        if (authData && authData.token) {
            config.headers.Authorization = `Bearer ${authData.token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor: Handle 401 and Retries
apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const { config, response } = error;

        // 1. Handle 401 (Unauthorized)
        if (response && response.status === 401) {
            clearAuthData();
            return Promise.reject(error);
        }

        // 2. Retry logic for specific production errors (502, 503, 504, or network timeout)
        const isRetryable = !response || (response.status >= 502 && response.status <= 504);
        const retryCount = config.__retryCount || 0;

        if (isRetryable && retryCount < 2) {
            config.__retryCount = retryCount + 1;
            
            // Exponential backoff: 800ms, 2000ms
            const delay = retryCount === 0 ? 800 : 2000;
            console.warn(`⚠️ API Error (${response?.status || 'Network'}). Retrying in ${delay}ms... (Attempt ${config.__retryCount})`);
            
            await new Promise(resolve => setTimeout(resolve, delay));
            return apiClient(config);
        }

        return Promise.reject(error);
    }
);
