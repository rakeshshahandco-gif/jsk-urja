/**
 * Protected CRM modules — approved features that must not be removed,
 * hidden, unregistered, or disabled by accidental code/deploy/template changes
 * without explicit owner approval (allowDisableProtectedModules).
 *
 * Single source of truth for WhatsApp Communication / AI / Settings protection.
 */

/** Existing frontend route paths (must match src/routes/paths.js). */
const ROUTES = Object.freeze({
    WHATSAPP_SETTINGS: '/whatsapp',
    WHATSAPP_CHAT: '/whatsapp/chat',
    WHATSAPP_BULK: {
        CAMPAIGNS: '/communication/whatsapp-bulk/campaigns',
        MATTERS: '/communication/whatsapp-bulk/matters',
        BLACKLIST: '/communication/whatsapp-bulk/blacklist',
        HISTORY: '/communication/whatsapp-bulk/history',
        NUMBER_HEALTH: '/communication/whatsapp-bulk/number-health',
        SETTINGS: '/communication/whatsapp-bulk/settings',
    },
    WHATSAPP_AI: {
        DASHBOARD: '/communication/whatsapp-ai',
        INBOX: '/communication/whatsapp-ai/inbox',
        SETTINGS: '/communication/whatsapp-ai/settings',
        AUDIT: '/communication/whatsapp-ai/audit',
    },
});

/** Conceptual protected keys (owner contract). */
export const PROTECTED_CRM_MODULE_KEYS = Object.freeze([
    'whatsapp_communication',
    'whatsapp_ai',
    'whatsapp_settings',
]);

/**
 * @typedef {object} ProtectedCrmModule
 * @property {string} key
 * @property {string} displayName
 * @property {string} moduleCode - company.enabledModules code
 * @property {string|null} featurePath - company feature settings path
 * @property {string[]} frontendRoutes
 * @property {string[]} sidebarMenuIds
 * @property {string[]} requiredPermissions
 * @property {string[]} backendRouteGroups - Express mount paths under /api/v1
 * @property {boolean} protectedFromAccidentalRemoval
 * @property {boolean} jskUrjaDefaultEnabled
 */

/** @type {ProtectedCrmModule[]} */
export const PROTECTED_CRM_MODULES = Object.freeze([
    {
        key: 'whatsapp_communication',
        displayName: 'WhatsApp Communication',
        moduleCode: 'whatsapp_bulk',
        featurePath: 'communication.enableWhatsappBulk',
        frontendRoutes: [
            ROUTES.WHATSAPP_CHAT,
            ROUTES.WHATSAPP_BULK.CAMPAIGNS,
            ROUTES.WHATSAPP_BULK.MATTERS,
            ROUTES.WHATSAPP_BULK.BLACKLIST,
            ROUTES.WHATSAPP_BULK.HISTORY,
            ROUTES.WHATSAPP_BULK.NUMBER_HEALTH,
            ROUTES.WHATSAPP_BULK.SETTINGS,
        ],
        sidebarMenuIds: [
            'whatsapp-root',
            'whatsapp-communication-group',
            'whatsapp-chat',
            'communication-bulk-campaigns',
            'communication-bulk-matter',
            'communication-bulk-blacklist',
            'communication-bulk-history',
            'communication-bulk-number-health',
            'communication-bulk-settings',
        ],
        requiredPermissions: [
            'whatsapp.whatsapp_settings.view',
            'whatsapp_bulk.campaigns.view',
            'whatsapp_bulk.settings.view',
        ],
        backendRouteGroups: ['/whatsapp-chat', '/whatsapp-bulk'],
        protectedFromAccidentalRemoval: true,
        jskUrjaDefaultEnabled: true,
    },
    {
        key: 'whatsapp_ai',
        displayName: 'WhatsApp AI',
        moduleCode: 'whatsapp_ai',
        featurePath: 'communication.whatsappAiEnabled',
        frontendRoutes: [
            ROUTES.WHATSAPP_AI.DASHBOARD,
            ROUTES.WHATSAPP_AI.INBOX,
            ROUTES.WHATSAPP_AI.SETTINGS,
            ROUTES.WHATSAPP_AI.AUDIT,
        ],
        sidebarMenuIds: [
            'whatsapp-root',
            'communication-whatsapp-ai-group',
            'communication-whatsapp-ai-dashboard',
            'communication-whatsapp-ai-settings',
            'communication-whatsapp-ai-audit',
        ],
        requiredPermissions: [
            'whatsapp_ai.module.view',
            'whatsapp_ai.dashboard.view',
            'whatsapp_ai.settings.manage',
            'whatsapp_ai.conversations.view_assigned',
            'whatsapp_ai.testing.inbound',
            'whatsapp_ai.module.takeover',
            'whatsapp_ai.audit.view',
        ],
        backendRouteGroups: ['/whatsapp-ai'],
        protectedFromAccidentalRemoval: true,
        jskUrjaDefaultEnabled: true,
    },
    {
        key: 'whatsapp_settings',
        displayName: 'WhatsApp Settings',
        moduleCode: 'whatsapp',
        featurePath: null,
        frontendRoutes: [ROUTES.WHATSAPP_SETTINGS],
        sidebarMenuIds: ['whatsapp-root', 'whatsapp'],
        requiredPermissions: [
            'whatsapp.whatsapp_settings.view',
            'whatsapp.whatsapp_settings.edit',
        ],
        backendRouteGroups: ['/whatsapp-settings'],
        protectedFromAccidentalRemoval: true,
        jskUrjaDefaultEnabled: true,
    },
]);

/** Module codes that must stay in JSK URJA enabledModules when guard is on. */
export const JSK_PROTECTED_MODULE_CODES = Object.freeze([
    ...new Set(PROTECTED_CRM_MODULES.map((m) => m.moduleCode).filter(Boolean)),
]);

/** Feature paths that must stay true for JSK URJA. */
export const JSK_PROTECTED_FEATURE_PATHS = Object.freeze(
    PROTECTED_CRM_MODULES.map((m) => m.featurePath).filter(Boolean),
);

export function getProtectedCrmModule(key) {
    return PROTECTED_CRM_MODULES.find((m) => m.key === key) || null;
}

/**
 * Merge protected WhatsApp feature flags onto company communication settings (JSK only).
 * Never deletes other keys; only forces protected flags ON.
 */
export function applyJskProtectedCommunicationFlags(settings) {
    const next = settings && typeof settings === 'object' ? { ...settings } : {};
    const communication = { ...(next.communication || {}) };
    for (const path of JSK_PROTECTED_FEATURE_PATHS) {
        const parts = String(path).split('.');
        if (parts[0] !== 'communication' || parts.length !== 2) continue;
        communication[parts[1]] = true;
    }
    next.communication = communication;
    return next;
}

/**
 * Ensure protected module codes remain in an enabledModules list.
 * @param {string[]} enabledModules
 * @returns {string[]}
 */
export function ensureProtectedModuleCodes(enabledModules = []) {
    const set = new Set((enabledModules || []).map((c) => String(c).trim().toLowerCase()).filter(Boolean));
    for (const code of JSK_PROTECTED_MODULE_CODES) {
        set.add(code);
    }
    return [...set];
}

/**
 * Reject accidental removal of protected modules unless explicitly allowed.
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function assertProtectedModulesNotRemoved(enabledModules, { allowDisableProtectedModules = false } = {}) {
    if (allowDisableProtectedModules) return { ok: true, missing: [] };
    const set = new Set((enabledModules || []).map((c) => String(c).trim().toLowerCase()));
    const missing = JSK_PROTECTED_MODULE_CODES.filter((code) => !set.has(code));
    return { ok: missing.length === 0, missing };
}
