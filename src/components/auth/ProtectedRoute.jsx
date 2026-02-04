import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { PermissionDenied } from './PermissionDenied';

export const ProtectedRoute = ({
    children,
    requireRole = null,
    requirePermission = null
}) => {
    const { user, loading, isAuthenticated, hasRole, hasPermission } = useAuth();

    // Show nothing while loading
    if (loading) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
                fontSize: '1.125rem',
                color: '#6b7280'
            }}>
                Loading...
            </div>
        );
    }

    // Redirect to login if not authenticated
    if (!isAuthenticated()) {
        return <Navigate to="/login" replace />;
    }

    // Check role requirement
    if (requireRole && !hasRole(requireRole)) {
        return <PermissionDenied requiredRole={requireRole} />;
    }

    // Check permission requirement
    if (requirePermission && !hasPermission(requirePermission)) {
        return <PermissionDenied requiredPermission={requirePermission} />;
    }

    // User is authenticated and has required permissions
    return children;
};
