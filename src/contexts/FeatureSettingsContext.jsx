import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { getCompanyFeatureSettings } from '@/services/featureSettingsApi';
import { isFeatureEnabled, mergeFeatureSettings } from '@/utils/featureSettings';

const FeatureSettingsContext = createContext(null);

export function FeatureSettingsProvider({ children }) {
    const { selectedCompany } = useCompany();
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        if (!selectedCompany?._id) {
            setSettings(null);
            return;
        }
        setLoading(true);
        try {
            const res = await getCompanyFeatureSettings();
            setSettings(mergeFeatureSettings(res.data?.settings));
        } catch {
            setSettings(mergeFeatureSettings(null));
        } finally {
            setLoading(false);
        }
    }, [selectedCompany?._id]);

    useEffect(() => {
        load();
    }, [load]);

    const check = useCallback(
        (path) => isFeatureEnabled(settings, path),
        [settings],
    );

    const value = {
        settings,
        loading,
        refreshFeatureSettings: load,
        isFeatureEnabled: check,
    };

    return (
        <FeatureSettingsContext.Provider value={value}>
            {children}
        </FeatureSettingsContext.Provider>
    );
}

export function useFeatureSettings() {
    const ctx = useContext(FeatureSettingsContext);
    if (!ctx) {
        return {
            settings: mergeFeatureSettings(null),
            loading: false,
            refreshFeatureSettings: async () => {},
            isFeatureEnabled: (path) => isFeatureEnabled(null, path),
        };
    }
    return ctx;
}
