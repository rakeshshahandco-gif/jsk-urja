import React from 'react';
import { useAuth } from '@/hooks/useAuth';

export const PermissionGate = ({ permission, role, fallback = null, children }) => {
    const { hasPermission, hasRole } = useAuth();

    // Check permission
    if (permission && !hasPermission(permission)) {
        return fallback;
    }

    // Check role
    if (role && !hasRole(role)) {
        return fallback;
    }

    return children;
};
