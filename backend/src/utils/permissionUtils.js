import { ApiError } from './ApiError.js';

/**
 * Get merged permissions for a user (Role + Overrides)
 */
export const getUserPermissions = (user) => {
    const rolePermissions = (user.role && user.role.permissions) || {};
    const overrides = user.additionalPermissions || {};
    
    // Merge: overrides take precedence
    const merged = { ...rolePermissions };
    for (const module in overrides) {
        merged[module] = { ...(merged[module] || {}), ...overrides[module] };
    }
    return merged;
};

/**
 * Check if user has specific permission
 * @param {Object} user 
 * @param {string} module 
 * @param {string} action 
 */
export const checkUserPermission = (user, module, action) => {
    // Superadmin Bypass
    if (user.roleName === 'superadmin') return true;
    
    const permissions = getUserPermissions(user);
    const modulePerms = permissions[module];
    
    if (!modulePerms) return false;
    
    const actionVal = modulePerms[action];
    
    // For boolean actions: true/false
    if (typeof actionVal === 'boolean') return actionVal;
    
    // For visibility actions: 'all', 'own', 'dept', 'assigned', or false
    if (actionVal === false) return false;
    if (actionVal) return true;
    
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
