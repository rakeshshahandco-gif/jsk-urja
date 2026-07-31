import React from 'react';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { useCompany } from '@/contexts/CompanyContext';
import { PATHS } from '@/routes/paths';
import { WHATSAPP_AI_FEATURE } from '../constants';
import WhatsAppModuleUnavailable from '@/components/WhatsAppModuleUnavailable';

/**
 * Feature gate for WhatsApp AI routes.
 * Waits for company + feature settings before applying the default-false flag.
 * When disabled/unavailable: keep a clear owner message (do not silent-hide).
 */
export default function WhatsAppAiFeatureGuard({ children }) {
    const { isFeatureEnabled, loading: featureLoading, settings, refreshFeatureSettings } = useFeatureSettings();
    const { selectedCompany, loading: companyLoading } = useCompany();

    if (companyLoading || featureLoading || !selectedCompany?._id || settings == null) {
        return (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                Loading WhatsApp AI…
            </div>
        );
    }

    if (!isFeatureEnabled(WHATSAPP_AI_FEATURE)) {
        return (
            <WhatsAppModuleUnavailable
                moduleName="WhatsApp AI"
                statusPath={PATHS.SETTINGS.WHATSAPP_AI.SETTINGS}
                onRetry={typeof refreshFeatureSettings === 'function' ? () => refreshFeatureSettings() : undefined}
            />
        );
    }

    return children;
}
