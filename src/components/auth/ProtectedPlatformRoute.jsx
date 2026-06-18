import React from 'react';
import { ProtectedRoute } from './ProtectedRoute';
import { PlatformAccessDenied } from './PlatformAccessDenied';
import { useAuth } from '@/hooks/useAuth';
import { isPlatformAdminUser } from '@/constants/platformAccess';

export const ProtectedPlatformRoute = ({ children }) => {
    const { user } = useAuth();

    return (
        <ProtectedRoute>
            {isPlatformAdminUser(user) ? children : <PlatformAccessDenied />}
        </ProtectedRoute>
    );
};
