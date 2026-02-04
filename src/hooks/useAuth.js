import { useContext } from 'react';
import { AuthContext } from '@/contexts/AuthContext';

export const useAuth = () => {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }

    return context;
};

// Custom hook to check permission
export const usePermission = (permission) => {
    const { hasPermission } = useAuth();
    return hasPermission(permission);
};

// Custom hook to check role
export const useRole = (role) => {
    const { hasRole } = useAuth();
    return hasRole(role);
};
