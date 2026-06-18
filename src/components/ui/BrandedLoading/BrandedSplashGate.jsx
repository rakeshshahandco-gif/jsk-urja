import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCompany } from '@/contexts/CompanyContext';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { BrandedSplashScreen } from './BrandedSplashScreen';

/**
 * Shows the branded splash only when logged in, company selected, and
 * ui.brandedSplashEnabled is ticked in Feature / Compliance settings.
 */
export const BrandedSplashGate = ({ children }) => {
    const { user } = useAuth();
    const { selectedCompany } = useCompany();
    const { isFeatureEnabled, loading } = useFeatureSettings();
    const [splashDone, setSplashDone] = useState(false);

    const companyReady = Boolean(user && selectedCompany?._id);
    const showSplash = companyReady
        && !loading
        && isFeatureEnabled('ui.brandedSplashEnabled')
        && !splashDone;

    useEffect(() => {
        if (!showSplash) return undefined;
        const timer = setTimeout(() => setSplashDone(true), 800);
        return () => clearTimeout(timer);
    }, [showSplash]);

    useEffect(() => {
        setSplashDone(false);
    }, [selectedCompany?._id]);

    if (showSplash) {
        return <BrandedSplashScreen />;
    }

    return children;
};
