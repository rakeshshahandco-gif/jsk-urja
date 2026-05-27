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
                setUser(authData.user);
                setToken(authData.token);

                try {
                    // Validate token and get fresh profile data
                    const response = await authService.getMe();
                    // getMe() returns the ApiResponse wrapper: { success, data: user, message }
                    // We need response.data (the actual user object), not response itself
                    const freshUser = response?.data || response;
                    console.log('🔄 Fresh profile loaded:', freshUser);
                    if (freshUser && freshUser._id) {
                        setUser(freshUser);
                        saveAuthData(freshUser, authData.token);
                    }
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
            // authService.login returns the ApiResponse wrapper: { success, data: { ...user, token }, message }
            // The actual user+token is in response.data
            const payload = response?.data || response;
            const { token: newToken, ...userData } = payload;

            if (!newToken) {
                return { success: false, error: 'Login failed: No token received' };
            }

            setUser(userData);
            setToken(newToken);

            return { success: true };
        } catch (error) {
            console.error("Login error:", error);
            const onRender =
                typeof window !== 'undefined' &&
                window.location.hostname.endsWith('.onrender.com');
            const timedOut = error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '');
            let msg;
            if (!error.response) {
                if (onRender) {
                    msg = timedOut
                        ? 'Render server is waking up (can take 1–2 minutes on first visit). Wait, then try Login again. Tip: use https://jsk-urja-backend.onrender.com/login'
                        : 'Cannot reach the Render backend. Check internet, wait 1 minute, then retry. Use https://jsk-urja-backend.onrender.com/login';
                } else {
                    msg = 'Cannot reach the server. Start the backend: cd backend && npm run dev (port 5000).';
                }
            } else {
                msg = error.response?.data?.message || error.message || 'Login failed';
            }
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
        const userRoleIdent = user?.roleName || (typeof user?.role === 'string' ? user.role : user?.role?.name) || 'viewer';
        return checkPermission(user.permissions || [], permission, userRoleIdent, user.additionalPermissions || {});
    }, [user]);

    // Check if user has role
    const hasRole = useCallback((role) => {
        if (!user) return false;
        const userRoleIdent = user?.roleName || (typeof user?.role === 'string' ? user.role : user?.role?.name) || 'viewer';
        return checkRole(userRoleIdent, role);
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
// force re-save
