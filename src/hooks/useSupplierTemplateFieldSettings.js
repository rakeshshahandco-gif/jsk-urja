import { useCallback, useEffect, useMemo, useState } from 'react';
import { getEffectiveSupplierFieldSettings } from '@/services/supplierTemplateFieldSettingsApi';
import { buildSupplierFieldControl } from '@/constants/supplierMasterTemplateFields';

export function useSupplierTemplateFieldSettings(companyId, isEnabledLegacy) {
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
        getEffectiveSupplierFieldSettings(companyId)
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
        () => buildSupplierFieldControl(settings, isEnabledLegacy),
        [settings, isEnabledLegacy],
    );

    return { fieldCtrl, loading, settings };
}
