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
