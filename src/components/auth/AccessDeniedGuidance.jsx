import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { isPlatformAdminUser } from '@/constants/platformAccess';
import { ACCESS_SETUP_PATHS, ACCESS_DENIAL_TYPES } from '@/constants/accessGuidance.constants';
import styles from './PermissionDenied.module.scss';

function canOpenSetupPath(path, user, hasPermission) {
    if (!path) return false;
    if (path === ACCESS_SETUP_PATHS.COMPANY_MODULE_ALLOCATION) {
        return isPlatformAdminUser(user);
    }
    if (path === ACCESS_SETUP_PATHS.USER_MANAGEMENT) {
        if (isPlatformAdminUser(user)) return true;
        const role = String(user?.roleName || user?.role?.name || user?.role || '').toLowerCase();
        if (role === 'admin') return true;
        return typeof hasPermission === 'function'
            ? hasPermission('admin.user_management.view') || hasPermission('admin')
            : false;
    }
    if (path === ACCESS_SETUP_PATHS.INDUSTRY_TEMPLATES || path === ACCESS_SETUP_PATHS.FEATURE_COMPLIANCE) {
        return isPlatformAdminUser(user) || (typeof hasPermission === 'function' && hasPermission('admin'));
    }
    return false;
}

function formatRequiredRole(requiredRole, ROLE_CONFIG) {
    if (!requiredRole) return null;
    if (Array.isArray(requiredRole)) {
        return requiredRole.map((r) => ROLE_CONFIG?.[r]?.label || r).join(' / ');
    }
    if (typeof requiredRole === 'string' && requiredRole.includes('(')) return requiredRole;
    return ROLE_CONFIG?.[requiredRole]?.label || requiredRole;
}

/**
 * Shared Access Denied / Module Disabled guidance panel.
 * Display-only — does not grant access.
 */
export function AccessDeniedGuidance({
    guidance,
    title = 'Access Denied',
    roleConfig = null,
    permissionLabels = null,
}) {
    const navigate = useNavigate();
    const { user, hasPermission } = useAuth();
    const g = guidance || {};
    const setupPath = g.enablePath || '';
    const canOpenSetup = canOpenSetupPath(setupPath, user, hasPermission);
    const roleText = formatRequiredRole(g.requiredRole, roleConfig);
    const permissionText = g.requiredPermission
        ? (permissionLabels?.[g.requiredPermission] || g.requiredPermission)
        : null;

    return (
        <div className={styles.container}>
            <div className={styles.content}>
                <ShieldAlert size={72} className={styles.icon} />
                <h1 className={styles.title}>{title}</h1>
                <p className={styles.message}>{g.denialReason || 'You do not have access to this page.'}</p>

                <div className={styles.detailsCard}>
                    {g.moduleName && (
                        <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Module / Page</span>
                            <span className={styles.detailValue}>{g.moduleName}</span>
                        </div>
                    )}
                    <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Reason</span>
                        <span className={styles.detailValue}>{g.denialReason}</span>
                    </div>
                    {roleText && (
                        <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Required Role</span>
                            <span className={styles.detailValue}>{roleText}</span>
                        </div>
                    )}
                    {permissionText && (
                        <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Required Permission</span>
                            <span className={styles.detailValue}>{permissionText}</span>
                        </div>
                    )}
                    {g.moduleDisabled && (
                        <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Company Module</span>
                            <span className={styles.detailValue}>Disabled for this company</span>
                        </div>
                    )}
                    {g.enableLabel && (
                        <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Where to Enable</span>
                            <span className={styles.detailValue}>{g.enableLabel}</span>
                        </div>
                    )}
                    {g.allowedAdministrator && (
                        <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Who Can Enable</span>
                            <span className={styles.detailValue}>{g.allowedAdministrator}</span>
                        </div>
                    )}
                    {g.blockedPath && (
                        <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Blocked Path</span>
                            <span className={styles.detailValue}>{g.blockedPath}</span>
                        </div>
                    )}
                </div>

                {!canOpenSetup && g.contactNote && (
                    <div className={styles.contactNote}>{g.contactNote}</div>
                )}

                {Array.isArray(g.notes) && g.notes.length > 0 && (
                    <ul className={styles.notesList}>
                        {g.notes.map((n) => (
                            <li key={n}>{n}</li>
                        ))}
                    </ul>
                )}

                <div className={styles.actions}>
                    {setupPath && (
                        <Button
                            onClick={() => canOpenSetup && navigate(setupPath)}
                            disabled={!canOpenSetup}
                            title={canOpenSetup ? g.enableButtonLabel : 'You cannot open this setup page'}
                        >
                            {g.enableButtonLabel || 'Go to Access Setup'}
                        </Button>
                    )}
                    <Button onClick={() => navigate(-1)} variant="outline">
                        Go Back
                    </Button>
                    <Button onClick={() => navigate(ACCESS_SETUP_PATHS.HOME)} variant="outline">
                        Go to Home
                    </Button>
                </div>

                {g.type === ACCESS_DENIAL_TYPES.PLATFORM_ADMIN && !canOpenSetup && (
                    <p className={styles.footerHint}>Please contact your Platform Admin.</p>
                )}
            </div>
        </div>
    );
}

export default AccessDeniedGuidance;
