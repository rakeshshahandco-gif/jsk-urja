// User Roles
export const ROLES = {
    ADMIN: 'admin',
    MANAGER: 'manager',
    STAFF: 'staff',
    VIEWER: 'viewer'
};

// Permissions
export const PERMISSIONS = {
    VIEW_CUSTOMERS: 'view_customers',
    ADD_CUSTOMER: 'add_customer',
    EDIT_CUSTOMER: 'edit_customer',
    DELETE_CUSTOMER: 'delete_customer',
    TALK_WITH_CUSTOMER: 'talk_with_customer',
    EDIT_CONVERSATIONS: 'edit_conversations',
    DELETE_CONVERSATIONS: 'delete_conversations',
    VIEW_REPORTS: 'view_reports',
    EXPORT_DATA: 'export_data',
    MANAGE_USERS: 'manage_users',
    VIEW_REMINDERS: 'view_reminders',
};

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
        PERMISSIONS.VIEW_REMINDERS
    ],
    [ROLES.STAFF]: [
        PERMISSIONS.VIEW_CUSTOMERS,
        PERMISSIONS.ADD_CUSTOMER,
        PERMISSIONS.TALK_WITH_CUSTOMER,
        PERMISSIONS.VIEW_REMINDERS
    ],
    [ROLES.VIEWER]: [
        PERMISSIONS.VIEW_CUSTOMERS,
        PERMISSIONS.VIEW_REMINDERS
    ]
};

// Check if role has permission
export const hasPermission = (userPermissions, requiredPermission) => {
    if (!userPermissions) return false;

    // Admin has all permissions
    if (userPermissions.includes('*')) return true;

    return userPermissions.includes(requiredPermission);
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

// Permission labels for UI
export const PERMISSION_LABELS = {
    [PERMISSIONS.VIEW_CUSTOMERS]: 'View Customers',
    [PERMISSIONS.ADD_CUSTOMER]: 'Add Customer',
    [PERMISSIONS.EDIT_CUSTOMER]: 'Edit Customer',
    [PERMISSIONS.DELETE_CUSTOMER]: 'Delete Customer',
    [PERMISSIONS.TALK_WITH_CUSTOMER]: 'Talk With Customer',
    [PERMISSIONS.EDIT_CONVERSATIONS]: 'Edit Conversations',
    [PERMISSIONS.DELETE_CONVERSATIONS]: 'Delete Conversations',
    [PERMISSIONS.VIEW_REPORTS]: 'View Reports',
    [PERMISSIONS.EXPORT_DATA]: 'Export Data',
    [PERMISSIONS.MANAGE_USERS]: 'Manage Users'
};

// Role labels and colors
export const ROLE_CONFIG = {
    [ROLES.ADMIN]: { label: 'Admin', color: '#dc2626', badge: '🔴' },
    [ROLES.MANAGER]: { label: 'Manager', color: '#f59e0b', badge: '🟡' },
    [ROLES.STAFF]: { label: 'Staff', color: '#3b82f6', badge: '🔵' },
    [ROLES.VIEWER]: { label: 'Viewer', color: '#6b7280', badge: '⚪' }
};
