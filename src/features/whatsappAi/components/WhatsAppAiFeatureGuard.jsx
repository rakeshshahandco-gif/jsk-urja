import React from 'react';
import { Navigate } from 'react-router-dom';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { useCompany } from '@/contexts/CompanyContext';
import { PATHS } from '@/routes/paths';
import { WHATSAPP_AI_FEATURE } from '../constants';

/**
 * Feature gate for WhatsApp AI routes.
 * Waits for company + feature settings before applying the default-false flag,
 * so first paint does not redirect to Admin Home while settings are still loading.
 */
export default function WhatsAppAiFeatureGuard({ children }) {
    const { isFeatureEnabled, loading: featureLoading, settings } = useFeatureSettings();
    const { selectedCompany, loading: companyLoading } = useCompany();

    if (companyLoading || featureLoading || !selectedCompany?._id || settings == null) {
        return (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                Loading WhatsApp AI…
            </div>
        );
    }

    if (!isFeatureEnabled(WHATSAPP_AI_FEATURE)) {
        return <Navigate to={PATHS.SETTINGS.HOME} replace />;
    }

    return children;
}
