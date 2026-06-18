import { useCallback, useEffect, useMemo, useState } from 'react';
import { getEffectiveItemFieldSettings } from '@/services/itemTemplateFieldSettingsApi';
import { buildItemFieldControl } from '@/constants/itemMasterTemplateFields';

export function useItemTemplateFieldSettings(companyId, isEnabledLegacy) {
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
        getEffectiveItemFieldSettings(companyId)
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
        () => buildItemFieldControl(settings, isEnabledLegacy),
        [settings, isEnabledLegacy],
    );

    return { fieldCtrl, loading, settings };
}
