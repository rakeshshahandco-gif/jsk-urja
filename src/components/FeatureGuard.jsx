import React from 'react';
import { Navigate } from 'react-router-dom';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { PATHS } from '@/routes/paths';

/**
 * Blocks route when company feature flag is off (backend also validates API).
 */
export function FeatureGuard({ feature, children, fallback = null }) {
    const { isFeatureEnabled, loading } = useFeatureSettings();

    if (loading) {
        return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading...</div>;
    }

    if (!isFeatureEnabled(feature)) {
        if (fallback) return fallback;
        return <Navigate to={PATHS.SETTINGS.HOME} replace />;
    }

    return children;
}
