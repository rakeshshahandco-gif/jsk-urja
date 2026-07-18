import React from 'react';
import { useLocation } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { PlatformAccessDenied } from './PlatformAccessDenied';
import { useAuth } from '@/hooks/useAuth';
import { isPlatformAdminUser } from '@/constants/platformAccess';

export const ProtectedPlatformRoute = ({ children }) => {
    const { user } = useAuth();
    const location = useLocation();

    return (
        <ProtectedRoute>
            {isPlatformAdminUser(user) ? (
                children
            ) : (
                <PlatformAccessDenied key={location.pathname} />
            )}
        </ProtectedRoute>
    );
};
