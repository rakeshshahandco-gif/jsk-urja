import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api/auth.api';
import apiClient from '../api/client';
import { storage } from '../utils/storage';
import { hasPermission as checkPermission } from '../utils/permissions';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = async () => {
    setUser(null);
    setToken(null);
    await storage.removeItem('auth_token');
    await storage.removeItem('auth_user');
    await storage.removeItem('jsk_selected_company');
  };

  // On app start, restore session from storage
  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const storedToken = await storage.getItem('auth_token');
        const storedUser = await storage.getItem('auth_user');
        if (storedToken && storedUser) {
          let parsedUser = null;
          try {
            parsedUser = JSON.parse(storedUser);
          } catch {
            await clearSession();
            return;
          }
          if (!cancelled) {
            setToken(storedToken);
            setUser(parsedUser);
          }
          try {
            const res = await authApi.getMe();
            const freshUser = res?.data || res;
            if (!cancelled && freshUser?._id) {
              setUser(freshUser);
              await storage.setItem('auth_user', JSON.stringify(freshUser));
            }
          } catch {
            await clearSession();
          }
        }
      } catch (e) {
        console.warn('Session restore error:', e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 12000);

    restoreSession().finally(() => clearTimeout(timeout));

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  const login = async (username, password) => {
    try {
      const normalizedUsername = username.trim().toLowerCase();
      const apiResponse = await authApi.login(normalizedUsername, password);
      const body = apiResponse?.data ?? apiResponse;

      const newToken =
        body?.token ||
        apiResponse?.token ||
        body?.accessToken ||
        apiResponse?.accessToken;

      if (!newToken) {
        throw new Error('Server response missing token.');
      }

      const userData = { ...body };
      delete userData.token;
      delete userData.accessToken;

      setToken(newToken);
      setUser(userData);

      await storage.setItem('auth_token', newToken);
      await storage.setItem('auth_user', JSON.stringify(userData));
      // Drop stale company from another server (localhost vs Render).
      await storage.removeItem('jsk_selected_company');

      return { success: true };
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Login failed';
      return { success: false, error: msg };
    }
  };

  const logout = clearSession;

  const hasPermission = (permission) => checkPermission(user, permission);

  const testRemoteConnection = async () => {
    try {
      const startTime = Date.now();
      // Test the heartbeat endpoint
      const response = await apiClient.get('/health');
      const duration = Date.now() - startTime;
      return { 
        success: true, 
        message: `Connection OK! Server replied in ${duration}ms.`,
        data: JSON.stringify(response.data)
      };
    } catch (error) {
      return { 
        success: false, 
        message: `Connection Failed: ${error.message}`,
        details: error.response ? `Status: ${error.response.status}` : 'No response from server'
      };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        hasPermission,
        testRemoteConnection,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
