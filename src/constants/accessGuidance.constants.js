/**
 * Central access-denial guidance — use real menu paths only (do not invent setup screens).
 * Security is unchanged: this config is display-only.
 */

import { PATHS } from '@/routes/paths';
import { MODULE_REGISTRY, moduleForPath } from '@/config/menuModuleMap';
import { isPlatformPath } from '@/constants/platformAccess';

export const ACCESS_DENIAL_TYPES = Object.freeze({
    PLATFORM_ADMIN: 'PLATFORM_ADMIN',
    ROLE_MISSING: 'ROLE_MISSING',
    PERMISSION_MISSING: 'PERMISSION_MISSING',
    MODULE_DISABLED: 'MODULE_DISABLED',
});

/** Exact existing CRM paths for enabling access (labels match menu.config.js). */
export const ACCESS_SETUP_PATHS = Object.freeze({
    USER_MANAGEMENT: '/admin/users',
    COMPANY_MODULE_ALLOCATION: PATHS.SETTINGS.COMPANY_MODULE_ALLOCATION,
    FEATURE_COMPLIANCE: PATHS.SETTINGS.FEATURE_COMPLIANCE,
    INDUSTRY_TEMPLATES: PATHS.SETTINGS.INDUSTRY_TEMPLATES,
    HOME: PATHS.DASHBOARD,
});

const PLATFORM_PAGE_GUIDANCE = Object.freeze({
    '/admin/print-format-version-manager': {
        moduleName: 'Print Format Version Manager',
        denialReason: 'This page is restricted to Platform Admin (System Admin role).',
    },
    '/admin/module-allocation': {
        moduleName: 'Company Module Allocation',
        denialReason: 'This page is restricted to Platform Admin (System Admin role).',
    },
    '/admin/industry-templates': {
        moduleName: 'Industry Template Master',
        denialReason: 'This page is restricted to Platform Admin (System Admin role).',
    },
    '/admin/industry-deployment-manager': {
        moduleName: 'Industry Deployment Manager',
        denialReason: 'This page is restricted to Platform Admin (System Admin role).',
    },
    '/admin/platform-feature-defaults': {
        moduleName: 'Platform Default Settings',
        denialReason: 'This page is restricted to Platform Admin (System Admin role).',
    },
    '/admin/workflow-master': {
        moduleName: 'Workflow Master',
        denialReason: 'This page is restricted to Platform Admin (System Admin role).',
    },
    '/admin/feature-configuration': {
        moduleName: 'Feature Configuration Engine (Platform)',
        denialReason: 'This page is restricted to Platform Admin (System Admin role).',
    },
    '/admin/companies': {
        moduleName: 'All Companies (Platform)',
        denialReason: 'This page is restricted to Platform Admin (System Admin role).',
    },
    '/admin/diagnostics': {
        moduleName: 'System Master Diagnostic',
        denialReason: 'This page is restricted to Platform Admin (System Admin role).',
    },
    '/admin/backups': {
        moduleName: 'Backup & Restore',
        denialReason: 'This page is restricted to Platform Admin (System Admin role).',
    },
});

function titleFromPath(pathname = '') {
    const p = String(pathname || '').split('?')[0];
    if (!p) return 'Restricted page';
    const known = PLATFORM_PAGE_GUIDANCE[p];
    if (known?.moduleName) return known.moduleName;
    const parts = p.split('/').filter(Boolean);
    return parts[parts.length - 1]?.replace(/-/g, ' ') || 'Restricted page';
}

function moduleLabel(code) {
    const mod = MODULE_REGISTRY.find((m) => m.code === code);
    return mod?.label || code || 'Module';
}

/**
 * Platform Admin–only pages (ProtectedPlatformRoute / platform path redirect).
 * Real enable path: Admin → User & Security → User Management → Role = System Admin.
 * There is no separate “Platform Access / Print Format Manager” permission screen.
 */
export function resolvePlatformAccessGuidance(pathname = '') {
    const p = String(pathname || '').split('?')[0];
    const page = PLATFORM_PAGE_GUIDANCE[p] || {
        moduleName: titleFromPath(p),
        denialReason: 'This page is available only to Platform Admin.',
    };

    return {
        type: ACCESS_DENIAL_TYPES.PLATFORM_ADMIN,
        moduleName: page.moduleName,
        denialReason: page.denialReason,
        requiredRole: 'System Admin (Platform Admin)',
        requiredPermission: null,
        moduleDisabled: false,
        companyAllocationMissing: false,
        enableLabel:
            'Admin → User & Security → User Management → Select User → Role → System Admin',
        enablePath: ACCESS_SETUP_PATHS.USER_MANAGEMENT,
        enableButtonLabel: 'Go to User Management',
        allowedAdministrator: 'Existing Platform Admin (System Admin)',
        contactNote:
            'Only an existing Platform Admin can assign the System Admin role. Client Admin cannot grant Platform Admin access.',
        notes: [
            'In this CRM, Platform Admin access means the user role is System Admin (superadmin).',
            'Print Format Version Manager / Designer are not company-module toggles — they are Platform Admin pages.',
            'Live Sales Order / Sales Invoice print formats are not changed by opening these pages.',
        ],
    };
}

export function resolveModuleDisabledGuidance(pathname = '', moduleCode = '') {
    const code = moduleCode || moduleForPath(pathname) || '';
    const label = moduleLabel(code);

    return {
        type: ACCESS_DENIAL_TYPES.MODULE_DISABLED,
        moduleName: label,
        denialReason: `${label} is not enabled for the selected company.`,
        requiredRole: null,
        requiredPermission: null,
        moduleDisabled: true,
        companyAllocationMissing: true,
        enableLabel:
            `Super Admin → Platform Setup → Company Module Allocation → Select Company → ${label} → Enable`,
        enablePath: ACCESS_SETUP_PATHS.COMPANY_MODULE_ALLOCATION,
        enableButtonLabel: 'Go to Company Module Allocation',
        allowedAdministrator: 'Platform Admin (System Admin)',
        contactNote:
            'Client Admin cannot enable company modules. Ask your Platform Admin to allocate this module.',
        notes: [
            'After the module is enabled for the company, users still need role permissions under Admin → User Management.',
        ],
        moduleCode: code || null,
        blockedPath: pathname || null,
    };
}

export function resolvePermissionGuidance({
    requiredRole = null,
    requiredPermission = null,
    moduleName = 'This page',
} = {}) {
    const isRole = !!requiredRole && !requiredPermission;
    return {
        type: isRole ? ACCESS_DENIAL_TYPES.ROLE_MISSING : ACCESS_DENIAL_TYPES.PERMISSION_MISSING,
        moduleName,
        denialReason: isRole
            ? 'Your user role does not allow this page.'
            : 'You do not have the required permission for this page.',
        requiredRole: requiredRole || null,
        requiredPermission: requiredPermission || null,
        moduleDisabled: false,
        companyAllocationMissing: false,
        enableLabel:
            'Admin → User & Security → User Management → Select User / Role → set Role or Module Permissions',
        enablePath: ACCESS_SETUP_PATHS.USER_MANAGEMENT,
        enableButtonLabel: 'Go to User Management',
        allowedAdministrator: 'Client Admin (or Platform Admin)',
        contactNote:
            'If the module itself is disabled for the company, Platform Admin must enable it in Company Module Allocation first.',
        notes: [],
    };
}

export function resolveAccessGuidanceFromLocation(pathname = '') {
    const p = String(pathname || '').split('?')[0];
    if (isPlatformPath(p) || PLATFORM_PAGE_GUIDANCE[p]) {
        return resolvePlatformAccessGuidance(p);
    }
    const code = moduleForPath(p);
    if (code) return resolveModuleDisabledGuidance(p, code);
    return resolvePlatformAccessGuidance(p);
}

export const MODULE_DISABLED_TOOLTIP =
    'Disabled for this company. Enable from Super Admin → Platform Setup → Company Module Allocation.';
