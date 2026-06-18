import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { getFeatureRegistry } from '@/services/featureConfigurationApi';
import { buildEffectiveOverrides, isFeatureConfigEnabled } from '@/utils/featureConfiguration';

let registryCache = null;

export function clearFeatureRegistryCache() {
    registryCache = null;
}

export function useFeatureConfiguration() {
    const { settings, refreshFeatureSettings } = useFeatureSettings();
    const [registry, setRegistry] = useState(registryCache || []);

    useEffect(() => {
        let cancelled = false;
        getFeatureRegistry()
            .then((r) => {
                if (cancelled) return;
                registryCache = r || [];
                setRegistry(registryCache);
            })
            .catch(() => {
                if (!cancelled) setRegistry([]);
            });
        return () => { cancelled = true; };
    }, []);

    const refreshAll = useCallback(async () => {
        clearFeatureRegistryCache();
        await refreshFeatureSettings();
        const r = await getFeatureRegistry();
        registryCache = r || [];
        setRegistry(registryCache);
    }, [refreshFeatureSettings]);

    const overrides = useMemo(() => buildEffectiveOverrides(settings, registry), [settings, registry]);

    const isEnabled = useCallback(
        (featureKey) => isFeatureConfigEnabled(settings, registry, featureKey),
        [settings, registry],
    );

    return { registry, overrides, isEnabled, settings, refreshFeatureSettings, refreshAll };
}
