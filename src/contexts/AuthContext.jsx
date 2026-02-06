import React, { createContext, useState, useEffect, useCallback } from 'react';
import { saveAuthData, getAuthData, clearAuthData } from '@/utils/auth';
import { hasPermission as checkPermission, hasRole as checkRole } from '@/utils/permissions';
import { authService } from '@/services/auth.service';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(true);

    // Load user from localStorage on mount
    useEffect(() => {
        const initAuth = async () => {
            const authData = getAuthData();
            if (authData) {
                // Determine if we need to validate token with backend?
                // For now, trust hydration but maybe fetch fresh profile
                setUser(authData.user);
                setToken(authData.token);

                try {
                    // POC: Validate token validity by fetching profile
                    const { data } = await authService.getMe();
                    console.log('🔄 Fresh profile loaded:', data);
                    setUser(data);
                    // Update storage with fresh data
                    saveAuthData(data, authData.token);
                } catch (e) {
                    console.error("Token invalid or expired", e);
                    logout();
                }
            }
            setLoading(false);
        };
        initAuth();
    }, []);

    // Login function
    const login = useCallback(async (username, password) => {
        try {
            const response = await authService.login(username, password);
            const { token: newToken, ...userData } = response.data;

            setUser(userData);
            setToken(newToken);
            // saveAuthData is handled in service or we do it here? 
            // Service does it, but let's be safe. Service saveAuthData might be enough.

            return { success: true };
        } catch (error) {
            console.error("Login error:", error);
            const msg = error.response?.data?.message || error.message || 'Login failed';
            return { success: false, error: msg };
        }
    }, []);

    // Logout function
    const logout = useCallback(async () => {
        try {
            await authService.logout();
            setUser(null);
            setToken(null);
            return { success: true };
        } catch (error) {
            // Force logout locally even if backend fails
            setUser(null);
            setToken(null);
            clearAuthData();
            return { success: false, error: error.message };
        }
    }, []);

    const hasPermission = useCallback((permission) => {
        if (!user) return false;
        return checkPermission(user.permissions || [], permission, user.role);
    }, [user]);

    // Check if user has role
    const hasRole = useCallback((role) => {
        if (!user) return false;
        return checkRole(user.role, role);
    }, [user]);

    // Check if user is authenticated
    const isAuthenticated = useCallback(() => {
        return !!user && !!token;
    }, [user, token]);

    // Update user profile (for current logged-in user)
    const updateUserProfile = useCallback((updatedData) => {
        if (!user) return;

        const updatedUser = { ...user, ...updatedData };
        setUser(updatedUser);

        // Update localStorage
        if (token) {
            saveAuthData(updatedUser, token);
        }
    }, [user, token]);

    const value = {
        user,
        token,
        loading,
        login,
        logout,
        updateUserProfile,
        hasPermission,
        hasRole,
        isAuthenticated
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
