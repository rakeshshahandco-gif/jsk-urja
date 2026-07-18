import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { AccessDeniedGuidance } from './AccessDeniedGuidance';
import { resolvePlatformAccessGuidance } from '@/constants/accessGuidance.constants';

export const PlatformAccessDenied = () => {
    const location = useLocation();
    const deniedPath =
        location.state?.from ||
        (location.pathname !== '/platform-access-denied' ? location.pathname : '') ||
        '';

    const guidance = useMemo(
        () => resolvePlatformAccessGuidance(deniedPath),
        [deniedPath],
    );

    return <AccessDeniedGuidance guidance={guidance} title="Access Denied" />;
};
