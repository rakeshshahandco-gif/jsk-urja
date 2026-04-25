import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api/auth.api';
import apiClient from '../api/client';
import { storage } from '../utils/storage';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // On app start, restore session from storage
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const storedToken = await storage.getItem('auth_token');
        const storedUser = await storage.getItem('auth_user');
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
          // Validate token is still valid
          try {
            const res = await authApi.getMe();
            const freshUser = res?.data || res;
            if (freshUser?._id) {
              setUser(freshUser);
              await storage.setItem('auth_user', JSON.stringify(freshUser));
            }
          } catch {
            // Token expired — force logout
            await logout();
          }
        }
      } catch (e) {
        console.warn('Session restore error:', e.message);
      } finally {
        setLoading(false);
      }
    };
    restoreSession();
  }, []);

  const login = async (username, password) => {
    try {
      const normalizedUsername = username.trim().toLowerCase();
      const apiResponse = await authApi.login(normalizedUsername, password);
      
      const newToken = 
        apiResponse?.data?.token || 
        apiResponse?.token || 
        apiResponse?.data?.accessToken ||
        apiResponse?.accessToken;

      const userData = apiResponse?.data || apiResponse;

      if (!newToken) {
        throw new Error('Server response missing token.');
      }

      setToken(newToken);
      setUser(userData);

      await storage.setItem('auth_token', newToken);
      await storage.setItem('auth_user', JSON.stringify(userData));

      return { success: true };
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Login failed';
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    setUser(null);
    setToken(null);
    await storage.removeItem('auth_token');
    await storage.removeItem('auth_user');
  };

  const hasPermission = (permission) => {
    if (!user) return false;
    const role = user?.roleName || user?.role?.name || user?.role || 'viewer';
    if (role === 'admin' || role === 'superadmin') return true;
    const additionalPerms = user?.additionalPermissions || {};
    const parts = permission.split('.');
    if (parts.length >= 2) {
      const [mod, sub, act] = parts;
      if (act) return !!additionalPerms?.[mod]?.[sub]?.[act];
      return !!additionalPerms?.[mod]?.[sub];
    }
    const modData = additionalPerms[permission];
    if (modData === true) return true;
    if (modData && typeof modData === 'object') {
      return Object.values(modData).some(v =>
        typeof v === 'object' ? Object.values(v).some(Boolean) : !!v
      );
    }
    return false;
  };

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
