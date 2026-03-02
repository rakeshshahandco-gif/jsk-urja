// User Roles
export const ROLES = {
    ADMIN: 'admin',
    MANAGER: 'manager',
    STAFF: 'staff',
    VIEWER: 'viewer'
};

// Dynamic Modules and Permissions Configuration
export const APP_MODULES = [
    {
        name: 'Customers',
        permissions: [
            { key: 'VIEW_CUSTOMERS', value: 'view_customers', label: 'View Customers' },
            { key: 'ADD_CUSTOMER', value: 'add_customer', label: 'Add Customer' },
            { key: 'EDIT_CUSTOMER', value: 'edit_customer', label: 'Edit Customer' },
            { key: 'DELETE_CUSTOMER', value: 'delete_customer', label: 'Delete Customer' },
            { key: 'TALK_WITH_CUSTOMER', value: 'talk_with_customer', label: 'Talk With Customer' }
        ]
    },
    {
        name: 'Conversations',
        permissions: [
            { key: 'EDIT_CONVERSATIONS', value: 'edit_conversations', label: 'Edit Conversations' },
            { key: 'DELETE_CONVERSATIONS', value: 'delete_conversations', label: 'Delete Conversations' }
        ]
    },
    {
        name: 'Reports',
        permissions: [
            { key: 'VIEW_REPORTS', value: 'view_reports', label: 'View Reports' },
            { key: 'EXPORT_DATA', value: 'export_data', label: 'Export Data' }
        ]
    },
    {
        name: 'Users',
        permissions: [
            { key: 'MANAGE_USERS', value: 'manage_users', label: 'Manage Users' }
        ]
    },
    {
        name: 'Reminders',
        permissions: [
            { key: 'VIEW_REMINDERS', value: 'view_reminders', label: 'View Reminders' }
        ]
    },
    {
        name: 'Tasks',
        permissions: [
            { key: 'VIEW_TASKS', value: 'view_tasks', label: 'View Tasks' },
            { key: 'ADD_TASK', value: 'add_task', label: 'Add Task' },
            { key: 'EDIT_TASK', value: 'edit_task', label: 'Edit Task' },
            { key: 'DELETE_TASK', value: 'delete_task', label: 'Delete Task' }
        ]
    },
    {
        name: 'Groups',
        permissions: [
            { key: 'VIEW_GROUPS', value: 'view_groups', label: 'View Groups' },
            { key: 'ADD_GROUP', value: 'add_group', label: 'Add Group' },
            { key: 'EDIT_GROUP', value: 'edit_group', label: 'Edit Group' },
            { key: 'DELETE_GROUP', value: 'delete_group', label: 'Delete Group' }
        ]
    },
    {
        name: 'Inventory',
        permissions: [
            { key: 'VIEW_INVENTORY', value: 'view_inventory', label: 'View Inventory' },
            { key: 'MANAGE_INVENTORY', value: 'manage_inventory', label: 'Manage Inventory' }
        ]
    },
    {
        name: 'Production',
        permissions: [
            { key: 'VIEW_PRODUCTION', value: 'view_production', label: 'View Production' },
            { key: 'MANAGE_PRODUCTION', value: 'manage_production', label: 'Manage Production' }
        ]
    }
];

// Generate PERMISSIONS and PERMISSION_LABELS
export const PERMISSIONS = {};
export const PERMISSION_LABELS = {};

APP_MODULES.forEach(module => {
    module.permissions.forEach(perm => {
        PERMISSIONS[perm.key] = perm.value;
        PERMISSION_LABELS[perm.value] = perm.label;
    });
});

// Role-based permission mapping
export const ROLE_PERMISSIONS = {
    [ROLES.ADMIN]: ['*', 'view_reminders'], // All permissions
    [ROLES.MANAGER]: [
        PERMISSIONS.VIEW_CUSTOMERS,
        PERMISSIONS.ADD_CUSTOMER,
        PERMISSIONS.EDIT_CUSTOMER,
        PERMISSIONS.TALK_WITH_CUSTOMER,
        PERMISSIONS.EDIT_CONVERSATIONS,
        PERMISSIONS.VIEW_REPORTS,
        PERMISSIONS.EXPORT_DATA,
        PERMISSIONS.VIEW_REMINDERS,
        PERMISSIONS.VIEW_TASKS,
        PERMISSIONS.ADD_TASK,
        PERMISSIONS.EDIT_TASK,
        PERMISSIONS.VIEW_GROUPS,
        PERMISSIONS.ADD_GROUP,
        PERMISSIONS.EDIT_GROUP,
        PERMISSIONS.VIEW_INVENTORY,
        PERMISSIONS.MANAGE_INVENTORY,
        PERMISSIONS.VIEW_PRODUCTION,
        PERMISSIONS.MANAGE_PRODUCTION
    ],
    [ROLES.STAFF]: [
        PERMISSIONS.VIEW_CUSTOMERS,
        PERMISSIONS.ADD_CUSTOMER,
        PERMISSIONS.TALK_WITH_CUSTOMER,
        PERMISSIONS.VIEW_REMINDERS,
        PERMISSIONS.VIEW_TASKS,
        PERMISSIONS.ADD_TASK,
        PERMISSIONS.VIEW_GROUPS,
        PERMISSIONS.VIEW_INVENTORY,
        PERMISSIONS.VIEW_PRODUCTION
    ],
    [ROLES.VIEWER]: [
        PERMISSIONS.VIEW_CUSTOMERS,
        PERMISSIONS.VIEW_REMINDERS,
        PERMISSIONS.VIEW_TASKS,
        PERMISSIONS.VIEW_GROUPS,
        PERMISSIONS.VIEW_INVENTORY,
        PERMISSIONS.VIEW_PRODUCTION
    ]
};

// Check if role has permission
export const hasPermission = (userPermissions, requiredPermission, userRole = null) => {
    // 1. Check if userPermissions is explicitly set (even if empty)
    // If it's an array (including empty []), respect it strictly - this is Granular Mode
    if (Array.isArray(userPermissions)) {
        // Admin has all permissions
        if (userPermissions.includes('*')) return true;
        // Strictly check the array - if permission not in array, deny
        return userPermissions.includes(requiredPermission);
    }

    // 2. Fallback to Role Default Permissions (only if userPermissions is null/undefined)
    // This handles legacy users who don't have the permissions field set
    if (userRole && ROLE_PERMISSIONS[userRole]) {
        const rolePerms = ROLE_PERMISSIONS[userRole];
        if (rolePerms.includes('*')) return true;
        if (rolePerms.includes(requiredPermission)) return true;
    }

    return false;
};

// Check if user has role
export const hasRole = (userRole, requiredRole) => {
    if (Array.isArray(requiredRole)) {
        return requiredRole.includes(userRole);
    }
    return userRole === requiredRole;
};

// Get permissions for a role
export const getPermissionsForRole = (role) => {
    return ROLE_PERMISSIONS[role] || [];
};

// Permission labels for UI are now generated dynamically above

// Role labels and colors
export const ROLE_CONFIG = {
    [ROLES.ADMIN]: { label: 'Admin', color: '#dc2626', badge: '🔴' },
    [ROLES.MANAGER]: { label: 'Manager', color: '#f59e0b', badge: '🟡' },
    [ROLES.STAFF]: { label: 'Staff', color: '#3b82f6', badge: '🔵' },
    [ROLES.VIEWER]: { label: 'Viewer', color: '#6b7280', badge: '⚪' }
};
