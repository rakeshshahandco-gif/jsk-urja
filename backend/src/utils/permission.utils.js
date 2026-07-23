import { getEffectivePermissionRegistry } from './permissionRegistryEnricher.js';

/**
 * Synchronizes a role or user's permissions object with the latest PERMISSION_REGISTRY.
 * This ensures that when new modules are added to the registry, they automatically
 * appear in existing roles/users with default values.
 * 
 * @param {Object} existingPermissions - The current permissions object from DB
 * @param {Boolean} isFullAccess - If true (e.g. for superadmin), defaults to true for all actions
 * @returns {Object} - The synchronized permissions object
 */
export const syncPermissionsWithRegistry = (existingPermissions = {}, isFullAccess = false) => {
    // Ensure existingPermissions is an object
    let synced = {};
    try {
        synced = (existingPermissions && typeof existingPermissions === 'object') 
            ? JSON.parse(JSON.stringify(existingPermissions)) 
            : {};
    } catch (e) {
        synced = {};
    }

    getEffectivePermissionRegistry().forEach(module => {
        // Ensure module exists and is an object
        if (!synced[module.id] || typeof synced[module.id] !== 'object') {
            synced[module.id] = {};
        }

        module.submodules.forEach(sub => {
            // Ensure submodule exists and is an object
            if (!synced[module.id][sub.id] || typeof synced[module.id][sub.id] !== 'object') {
                synced[module.id][sub.id] = {};
            }

            sub.actions.forEach(action => {
                const actionId = typeof action === 'string' ? action : action.id;
                
                // Only set if not already defined as a boolean
                if (synced[module.id][sub.id][actionId] === undefined) {
                    synced[module.id][sub.id][actionId] = isFullAccess;
                }
            });
        });
    });

    return synced;
};

/**
 * Grant only missing actions for one registry module.
 * Preserves explicit `false` / custom values. Idempotent.
 *
 * @param {object} existingPermissions
 * @param {string} moduleId e.g. 'whatsapp_bulk'
 * @param {boolean} grantMissing default true for Client Admin Bulk backfill
 */
export const ensureModulePermissions = (existingPermissions = {}, moduleId, grantMissing = true) => {
    let synced = {};
    try {
        synced = (existingPermissions && typeof existingPermissions === 'object')
            ? JSON.parse(JSON.stringify(existingPermissions))
            : {};
    } catch (e) {
        synced = {};
    }

    const mod = getEffectivePermissionRegistry().find((m) => m.id === moduleId);
    if (!mod) return synced;

    if (!synced[moduleId] || typeof synced[moduleId] !== 'object') {
        synced[moduleId] = {};
    }

    mod.submodules.forEach((sub) => {
        if (!synced[moduleId][sub.id] || typeof synced[moduleId][sub.id] !== 'object') {
            synced[moduleId][sub.id] = {};
        }
        sub.actions.forEach((action) => {
            const actionId = typeof action === 'string' ? action : action.id;
            if (synced[moduleId][sub.id][actionId] === undefined) {
                synced[moduleId][sub.id][actionId] = !!grantMissing;
            }
        });
    });

    return synced;
};

/** Client Admin role names that should receive WhatsApp Bulk company-admin access. */
export const CLIENT_ADMIN_ROLE_NAMES = ['admin'];

/**
 * Pure: ensure whatsapp_bulk.* missing keys are true for a Client Admin permission tree.
 * Does not grant other modules. Does not overwrite explicit false.
 */
export const ensureClientAdminWhatsappBulkPermissions = (existingPermissions = {}) =>
    ensureModulePermissions(existingPermissions, 'whatsapp_bulk', true);

/**
 * Whether a role document is the CRM Client Admin role (not Superadmin).
 */
export const isClientAdminRole = (role) => {
    const name = String(role?.name || '').trim().toLowerCase();
    return name === 'admin';
};
