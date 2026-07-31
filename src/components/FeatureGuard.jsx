import React from 'react';
import { Navigate } from 'react-router-dom';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { PATHS } from '@/routes/paths';
import WhatsAppModuleUnavailable from '@/components/WhatsAppModuleUnavailable';

/**
 * Blocks route when company feature flag is off (backend also validates API).
 * WhatsApp Communication/Bulk: show owner fallback instead of silent redirect.
 */
export function FeatureGuard({ feature, children, fallback = null }) {
    const { isFeatureEnabled, loading, refreshFeatureSettings } = useFeatureSettings();

    if (loading) {
        return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading...</div>;
    }

    if (!isFeatureEnabled(feature)) {
        if (fallback) return fallback;
        if (feature === 'communication.enableWhatsappBulk') {
            return (
                <WhatsAppModuleUnavailable
                    moduleName="WhatsApp Communication"
                    statusPath={PATHS.SETTINGS.WHATSAPP}
                    onRetry={typeof refreshFeatureSettings === 'function' ? () => refreshFeatureSettings() : undefined}
                />
            );
        }
        return <Navigate to={PATHS.SETTINGS.HOME} replace />;
    }

    return children;
}
