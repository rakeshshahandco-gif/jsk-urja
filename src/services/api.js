import axios from 'axios';
import { getAuthData, clearAuthData } from '@/utils/auth';

// Create axios instance
const api = axios.create({
    baseURL: 'http://localhost:3000/api/v1',
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
