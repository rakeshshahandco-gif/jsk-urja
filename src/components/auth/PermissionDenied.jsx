import React, { useMemo } from 'react';
import { AccessDeniedGuidance } from './AccessDeniedGuidance';
import { resolvePermissionGuidance } from '@/constants/accessGuidance.constants';
import { ROLE_CONFIG, PERMISSION_LABELS } from '@/utils/permissions';

export const PermissionDenied = ({ requiredRole, requiredPermission, moduleName }) => {
    const guidance = useMemo(
        () =>
            resolvePermissionGuidance({
                requiredRole,
                requiredPermission,
                moduleName: moduleName || 'This page',
            }),
        [requiredRole, requiredPermission, moduleName],
    );

    return (
        <AccessDeniedGuidance
            guidance={guidance}
            title="Access Denied"
            roleConfig={ROLE_CONFIG}
            permissionLabels={PERMISSION_LABELS}
        />
    );
};
