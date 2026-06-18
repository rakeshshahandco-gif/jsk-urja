import { useCallback, useEffect, useMemo, useState } from 'react';
import { getEffectiveDocumentsKycSettings } from '@/services/documentsKycTemplateSettingsApi';
import { buildDocumentControl } from '@/constants/documentsKycTemplate.constants';

export function useDocumentsKycTemplateSettings(companyId, partyType, isEnabledLegacy, fieldCtrl) {
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        if (!companyId) {
            setSettings({ useLegacy: true, customerDocuments: {}, supplierDocuments: {} });
            setLoading(false);
            return undefined;
        }
        setLoading(true);
        getEffectiveDocumentsKycSettings(companyId)
            .then((data) => {
                if (!cancelled) setSettings(data);
            })
            .catch(() => {
                if (!cancelled) setSettings({ useLegacy: true, customerDocuments: {}, supplierDocuments: {} });
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [companyId]);

    const docCtrl = useMemo(
        () => buildDocumentControl(settings, partyType, isEnabledLegacy, fieldCtrl),
        [settings, partyType, isEnabledLegacy, fieldCtrl],
    );

    const refresh = useCallback(async () => {
        if (!companyId) return;
        try {
            const data = await getEffectiveDocumentsKycSettings(companyId);
            setSettings(data);
        } catch {
            setSettings({ useLegacy: true, customerDocuments: {}, supplierDocuments: {} });
        }
    }, [companyId]);

    return { docCtrl, loading, settings, refresh };
}
