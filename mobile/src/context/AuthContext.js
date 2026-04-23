import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authApi } from '../api/auth.api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // On app start, restore session from SecureStore
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const storedToken = await SecureStore.getItemAsync('auth_token');
        const storedUser = await SecureStore.getItemAsync('auth_user');
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
          // Validate token is still valid
          try {
            const res = await authApi.getMe();
            const freshUser = res?.data || res;
            if (freshUser?._id) {
              setUser(freshUser);
              await SecureStore.setItemAsync('auth_user', JSON.stringify(freshUser));
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
      const res = await authApi.login(normalizedUsername, password);
      
      // SUPER SEARCH: Scan every possible property for the token
      const newToken = 
        res?.token || 
        res?.data?.token || 
        res?.tokens?.access?.token || // Standard for some boilerplates
        res?.data?.tokens?.access?.token ||
        res?.accessToken;

      // Extract user data
      const userData = res?.data?._id ? res.data : (res?._id ? res : (res?.data || res));

      if (!newToken) {
        // Construct a helpful error message with response snippet
        const responseSnippet = JSON.stringify(res).substring(0, 100);
        console.error('Login Debug Info:', responseSnippet);
        throw new Error(`Server response missing token. (Data: ${responseSnippet}...)`);
      }

      setToken(newToken);
      setUser(userData);

      await SecureStore.setItemAsync('auth_token', newToken);
      await SecureStore.setItemAsync('auth_user', JSON.stringify(userData));

      return { success: true };
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Login failed';
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    setUser(null);
    setToken(null);
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('auth_user');
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

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
