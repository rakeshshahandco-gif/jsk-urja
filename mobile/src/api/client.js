import axios from 'axios';
import ENV from '../config/env';
import { storage } from '../utils/storage';

const BASE_URL = ENV.apiUrl;

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to every request automatically
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await storage.getItem('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      console.warn('Could not read token from storage:', e.message);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 globally (token expired → force logout)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await storage.removeItem('auth_token');
      await storage.removeItem('auth_user');
      // AuthContext will re-check and redirect to login on next action
    }
    return Promise.reject(error);
  }
);

export default apiClient;
