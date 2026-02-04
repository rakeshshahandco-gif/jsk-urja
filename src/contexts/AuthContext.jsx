import React, { createContext, useState, useEffect, useCallback } from 'react';
import { mockLogin, mockLogout, saveAuthData, getAuthData, clearAuthData } from '@/utils/auth';
import { hasPermission as checkPermission, hasRole as checkRole } from '@/utils/permissions';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(true);

    // Load user from localStorage on mount
    useEffect(() => {
        const authData = getAuthData();
        if (authData) {
            // Fix for stale admin permissions
            if (authData.user.role === 'admin' && !authData.user.permissions.includes('*')) {
                console.log('🔄 Repairing stale admin permissions');
                authData.user.permissions = ['*'];
                // Update storage immediately
                saveAuthData(authData.user, authData.token);
            }

            console.log('👤 Loaded user:', authData.user.name, 'Role:', authData.user.role, 'Permissions:', authData.user.permissions);
            setUser(authData.user);
            setToken(authData.token);
        }
        setLoading(false);
    }, []);

    // Login function
    const login = useCallback(async (username, password) => {
        try {
            const response = await mockLogin(username, password);
            const { token: newToken, ...userData } = response;

            setUser(userData);
            setToken(newToken);
            saveAuthData(userData, newToken);

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }, []);

    // Logout function
    const logout = useCallback(async () => {
        try {
            await mockLogout();
            setUser(null);
            setToken(null);
            clearAuthData();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }, []);

    // Check if user has permission
    const hasPermission = useCallback((permission) => {
        if (!user) return false;
        return checkPermission(user.permissions, permission);
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
