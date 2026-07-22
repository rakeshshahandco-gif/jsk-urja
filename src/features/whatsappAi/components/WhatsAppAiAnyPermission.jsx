import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { PermissionDenied } from '@/components/auth/PermissionDenied';

/**
 * OR-permission gate for WhatsApp AI routes (does not replace ProtectedRoute auth).
 */
export default function WhatsAppAiAnyPermission({ permissions = [], children }) {
    const { hasPermission, user } = useAuth();
    const role = user?.roleName || (typeof user?.role === 'string' ? user.role : user?.role?.name);
    if (String(role || '').toLowerCase() === 'superadmin') {
        return children;
    }
    const ok = permissions.some((p) => hasPermission(p));
    if (!ok) {
        return <PermissionDenied requiredPermission={permissions.join(' OR ')} />;
    }
    return children;
}
