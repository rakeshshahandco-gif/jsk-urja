import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// ─── IMPORTANT ───────────────────────────────────────────────────────────────
// This points to the SAME backend that the desktop CRM uses.
// No duplicate data, no separate database. Real-time sync guaranteed.
// ─────────────────────────────────────────────────────────────────────────────
const BASE_URL = 'https://jsk-urja-backend.onrender.com/api/v1';

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
      const token = await SecureStore.getItemAsync('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      console.warn('Could not read token from SecureStore:', e.message);
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
      await SecureStore.deleteItemAsync('auth_token');
      await SecureStore.deleteItemAsync('auth_user');
      // AuthContext will re-check and redirect to login
    }
    return Promise.reject(error);
  }
);

export default apiClient;
