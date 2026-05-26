import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { PermissionDenied } from './PermissionDenied';
import { BrandedLoader } from '@/components/ui/BrandedLoading/BrandedLoader';

export const ProtectedRoute = ({
    children,
    requireRole = null,
    requirePermission = null
}) => {
    const { user, loading, isAuthenticated, hasRole, hasPermission } = useAuth();

    if (loading) {
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    width: '100%',
                }}
            >
                <BrandedLoader size={120} />
            </div>
        );
    }

    // Redirect to login if not authenticated
    if (!isAuthenticated()) {
        return <Navigate to="/login" replace />;
    }

    // Superadmin Bypass
    const userRole = user?.roleName || (typeof user?.role === 'string' ? user.role : user?.role?.name);
    if (userRole === 'superadmin') {
        return children;
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
