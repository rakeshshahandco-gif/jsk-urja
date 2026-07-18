/**
 * Platform-level UI paths and menu ids - superadmin only.
 */

export const PLATFORM_MENU_IDS = new Set([
    'super-admin',
    'super-admin-saas',
    'super-admin-platform-setup',
    'super-admin-tenant',
    'super-admin-system',
    /** @deprecated sidebar id — kept for UI preference migrations */
    'saas-admin',
    'saas-dashboard',
    'saas-companies',
    'saas-subscriptions',
    'saas-activity',
    'industry-template-master',
    'company-module-allocation',
    'platform-feature-defaults',
    'feature-configuration',
    'workflow-master',
    'print-format-version-manager',
    'companies-list',
    'system-diagnostic',
    'backup-restore',
]);

export const PLATFORM_PATH_PREFIXES = [
    '/admin/industry-templates',
    '/admin/module-allocation',
    '/admin/platform-feature-defaults',
    '/admin/feature-configuration',
    '/admin/workflow-master',
    '/admin/print-format-version-manager',
    '/admin/companies',
    '/admin/diagnostics',
    '/admin/backups',
    '/saas-admin',
];

export function isPlatformAdminUser(user) {
    const role = String(user?.roleName || user?.role?.name || user?.role || '').trim().toLowerCase();
    return role === 'superadmin';
}

export function isPlatformPath(pathname = '') {
    const p = String(pathname || '').split('?')[0].toLowerCase();
    return PLATFORM_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`) || p.startsWith(`${prefix}?`));
}

export function isPlatformMenuId(menuId) {
    return PLATFORM_MENU_IDS.has(menuId);
}
