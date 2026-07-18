import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { AccessDeniedGuidance } from '@/components/auth/AccessDeniedGuidance';
import { resolveModuleDisabledGuidance } from '@/constants/accessGuidance.constants';
import { moduleForPath } from '@/config/menuModuleMap';

export default function ModuleDisabledPage() {
    const location = useLocation();
    const from = location.state?.from || '';
    const moduleCode = location.state?.moduleCode || moduleForPath(from) || '';

    const guidance = useMemo(
        () => resolveModuleDisabledGuidance(from, moduleCode),
        [from, moduleCode],
    );

    return <AccessDeniedGuidance guidance={guidance} title="Module not available" />;
}
