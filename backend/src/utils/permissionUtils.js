import { ApiError } from './ApiError.js';

/**
 * Get merged permissions for a user (Role + Overrides)
 */
export const getUserPermissions = (user) => {
    const rolePermissions = (user.role && user.role.permissions) || {};
    const overrides = user.additionalPermissions || {};
    
    // Merge logic for 2-level nesting (Module -> Submodule -> Actions)
    const merged = { ...rolePermissions };
    
    for (const moduleId in overrides) {
        const moduleOverrides = overrides[moduleId] || {};
        const moduleBase = merged[moduleId] || {};
        
        const moduleMerged = { ...moduleBase };
        for (const subModuleId in moduleOverrides) {
            moduleMerged[subModuleId] = {
                ...(moduleBase[subModuleId] || {}),
                ...moduleOverrides[subModuleId]
            };
        }
        merged[moduleId] = moduleMerged;
    }
    return merged;
};

/**
 * Check if user has specific permission
 * @param {Object} user 
 * @param {string} permissionKey (e.g. "inventory.item_master.view")
 */
export const checkUserPermission = (user, permissionKey) => {
    const rawRole = user.roleName || user.role?.name || '';
    const roleName = String(rawRole).trim().toLowerCase();
    if (roleName === 'superadmin') return true;
    // Routes use checkPermission('admin') as module gate (feature / customer settings)
    if (permissionKey === 'admin' && roleName === 'admin') return true;
    // Company Admin always has Print Format Designer (staff need explicit grant)
    if (
        roleName === 'admin' &&
        typeof permissionKey === 'string' &&
        permissionKey.startsWith('admin.print_format_designer.')
    ) {
        return true;
    }
    
    // Legacy support for fixed permission array if exists
    if (Array.isArray(user.permissions)) {
        if (user.permissions.includes('*')) return true;
        if (user.permissions.includes(permissionKey)) return true;
    }

    const permissions = getUserPermissions(user);
    
    // Support "module.submodule.action"
    if (typeof permissionKey === 'string' && permissionKey.includes('.')) {
        const [mod, sub, act] = permissionKey.split('.');
        return !!permissions[mod]?.[sub]?.[act];
    }

    // Support "module" check (true if any submodule has any action)
    if (permissions[permissionKey]) {
        return Object.values(permissions[permissionKey]).some(sub => 
            Object.values(sub).some(val => !!val)
        );
    }
    
    return false;
};

/**
 * Get MongoDB filter based on user's data scope for a module
 * @param {Object} user 
 * @param {string} module 
 * @param {string} action (usually 'view' or 'edit')
 */
export const getDataScopeFilter = (user, module, action = 'view') => {
    if (user.roleName === 'superadmin') return {};

    const permissions = getUserPermissions(user);
    const scope = permissions[module]?.[action] || user.dataScope || 'Own';

    switch (scope) {
        case 'All':
            return {};
        case 'Department':
            return { department: user.department };
        case 'Assigned':
            return { $or: [{ assignedTo: user._id }, { createdBy: user._id }] };
        case 'Own':
        default:
            return { createdBy: user._id };
    }
};
