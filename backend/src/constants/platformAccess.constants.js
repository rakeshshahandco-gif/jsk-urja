/**
 * Platform-level screens and API prefixes - superadmin / platform owner only.
 */

export const PLATFORM_API_PREFIXES = [
    '/module-allocation',
    '/industry-templates',
    '/platform-feature-settings',
    '/feature-configuration',
    '/workflow-masters',
    '/company-workflow-assignments',
    '/customer-template-field-settings',
    '/supplier-template-field-settings',
    '/item-template-field-settings',
    '/documents-kyc-template-settings',
    '/saas',
];

export const PLATFORM_MENU_IDS = new Set([
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
    'companies-list',
    'system-diagnostic',
    'backup-restore',
]);

export function isPlatformApiPath(pathname = '') {
    const p = String(pathname || '').split('?')[0];
    return PLATFORM_API_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

export function isPlatformAdminUser(user) {
    const role = String(user?.roleName || user?.role?.name || '').trim().toLowerCase();
    return role === 'superadmin';
}