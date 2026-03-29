import axios from 'axios';
import { getAuthData, clearAuthData } from '../utils/auth';

const currentLocation = import.meta.env.VITE_API_URL || (window.location.hostname === 'jsk-urja.onrender.com' 
    ? 'https://jsk-urja-backend.onrender.com/api/v1' 
    : 'http://localhost:5000/api/v1');

export const apiClient = axios.create({
    baseURL: currentLocation,
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

// Response interceptor: Handle 401
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            clearAuthData();
        }
        return Promise.reject(error);
    }
);
