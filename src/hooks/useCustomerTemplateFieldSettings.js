import { useCallback, useEffect, useMemo, useState } from 'react';
import { getEffectiveCustomerFieldSettings } from '@/services/customerTemplateFieldSettingsApi';
import { buildCustomerFieldControl } from '@/constants/customerMasterTemplateFields';

export function useCustomerTemplateFieldSettings(companyId, isEnabledLegacy) {
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        if (!companyId) {
            setSettings({ useLegacy: true, fields: {} });
            setLoading(false);
            return undefined;
        }
        setLoading(true);
        getEffectiveCustomerFieldSettings(companyId)
            .then((data) => {
                if (!cancelled) setSettings(data);
            })
            .catch(() => {
                if (!cancelled) setSettings({ useLegacy: true, fields: {} });
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [companyId]);

    const fieldCtrl = useMemo(
        () => buildCustomerFieldControl(settings, isEnabledLegacy),
        [settings, isEnabledLegacy],
    );

    const isCustomerFieldVisible = useCallback(
        (fieldKey) => fieldCtrl.isVisible(fieldKey),
        [fieldCtrl],
    );

    return { fieldCtrl, isCustomerFieldVisible, loading, settings };
}
