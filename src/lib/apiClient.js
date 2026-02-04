import axios from 'axios';
import { env } from '../config/env';

const currentLocation = window.location.hostname === 'jsk-urja.onrender.com' ? 'https://jsk-urja-backend.onrender.com/api/v1' : 'http://localhost:3000/api/v1'

export const apiClient = axios.create({
    // baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',
    baseURL: currentLocation,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptors can be added here
