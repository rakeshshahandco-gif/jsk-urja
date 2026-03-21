// User Roles
export const ROLES = {
    SUPERADMIN: 'superadmin',
    ADMIN: 'admin',
    MANAGER: 'manager',
    STAFF: 'staff',
    VIEWER: 'viewer'
};

// Dynamic Modules and Permissions Configuration
export const APP_MODULES = [
    {
        id: 'customers',
        name: 'Customers',
        submodules: [
            { id: 'customer_master', name: 'Customer Master', actions: ['view', 'add', 'edit', 'delete', 'export'] },
            { id: 'reminder_tasks', name: 'Reminder Tasks', actions: ['view', 'manage'] },
            { id: 'follow_up', name: 'Follow-up Dashboard', actions: ['view', 'talk'] }
        ]
    },
    {
        id: 'tasks',
        name: 'Task Management',
        submodules: [
            { id: 'task_list', name: 'Manage Tasks', actions: ['view', 'add', 'edit', 'delete'] },
            { id: 'task_groups', name: 'Task Groups', actions: ['view', 'manage'] }
        ]
    },
    {
        id: 'inventory',
        name: 'Inventory',
        submodules: [
            { id: 'item_master', name: 'Item Master', actions: ['view', 'add', 'edit', 'delete', 'export', 'import'] },
            { id: 'item_types', name: 'Item Types', actions: ['view', 'manage'] },
            { id: 'item_groups', name: 'Item Groups', actions: ['view', 'manage'] },
            { id: 'bom', name: 'Bill of Materials (BOM)', actions: ['view', 'add', 'edit', 'delete', 'print', 'export'] },
            { id: 'raw_material_report', name: 'Raw Material Stock Report', actions: ['view', 'export'] },
            { id: 'finished_goods_report', name: 'Finished Goods Stock Report', actions: ['view', 'export'] },
            { id: 'stock_ledger', name: 'Stock Movement Ledger', actions: ['view', 'export'] }
        ]
    },
    {
        id: 'production',
        name: 'Production',
        submodules: [
            { id: 'prod_dashboard', name: 'Dashboard', actions: ['view'] },
            { id: 'prod_output', name: 'Production Output Entry', actions: ['view', 'add'] },
            { id: 'comp_replacement', name: 'Component Replacement', actions: ['view', 'add'] },
            { id: 'prod_rejection', name: 'Production Rejection', actions: ['view', 'add'] },
            { id: 'prod_rework', name: 'Failure & Rework', actions: ['view', 'manage'] }
        ]
    },
    {
        id: 'purchase',
        name: 'Purchase',
        submodules: [
            { id: 'suppliers', name: 'Suppliers', actions: ['view', 'add', 'edit', 'delete'] },
            { id: 'purchase_orders', name: 'Purchase Orders', actions: ['view', 'add', 'edit', 'delete', 'print', 'approve'] },
            { id: 'grn', name: 'Goods Receipt (GRN)', actions: ['view', 'add'] },
            { id: 'purchase_invoices', name: 'Purchase Invoices', actions: ['view', 'add', 'edit', 'delete'] }
        ]
    },
    {
        id: 'sales',
        name: 'Sales',
        submodules: [
            { id: 'sales_orders', name: 'Sales Orders', actions: ['view', 'add', 'edit', 'delete', 'print'] },
            { id: 'sales_invoices', name: 'Tax Invoices (GST)', actions: ['view', 'add', 'edit', 'delete', 'print'] },
            { id: 'invoice_series', name: 'Invoice Series', actions: ['view', 'manage'] }
        ]
    },
    {
        id: 'service',
        name: 'Service',
        submodules: [
            { id: 'complaints', name: 'Customer Complaints', actions: ['view', 'add', 'edit'] },
            { id: 'replacement_dashboard', name: 'Replacement Dashboard', actions: ['view'] },
            { id: 'replacement_dispatches', name: 'Replacement Dispatches', actions: ['view', 'add'] }
        ]
    },
    {
        id: 'accounts',
        name: 'Accounts',
        submodules: [
            { id: 'receipt_entry', name: 'Receipt Entry', actions: ['view', 'add'] },
            { id: 'payment_entry', name: 'Payment Entry', actions: ['view', 'add'] },
            { id: 'expense_entry', name: 'Expense Voucher', actions: ['view', 'add'] },
            { id: 'journal_entry', name: 'Journal Voucher', actions: ['view', 'add'] },
            { id: 'vouchers', name: 'Voucher Register', actions: ['view', 'edit'] },
            { id: 'ledger_master', name: 'Ledger Master', actions: ['view', 'manage'] },
            { id: 'ledger_report', name: 'Ledger Report', actions: ['view', 'export'] },
            { id: 'outstanding', name: 'Outstanding Report', actions: ['view', 'export'] }
        ]
    },
    {
        id: 'reports',
        name: 'Reports',
        submodules: [
            { id: 'customer_master_report', name: 'Customer Master', actions: ['view', 'export'] },
            { id: 'followup_report', name: 'Follow-up Tracker Report', actions: ['view', 'export'] },
            { id: 'reminder_report', name: 'Open Reminders', actions: ['view'] }
        ]
    },
    {
        id: 'admin',
        name: 'Admin',
        submodules: [
            { id: 'company_profile', name: 'Company Profile', actions: ['view', 'edit'] },
            { id: 'whatsapp_settings', name: 'WhatsApp Settings', actions: ['view', 'edit'] },
            { id: 'user_management', name: 'User Management', actions: ['view', 'manage'] }
        ]
    }
];

// Generate PERMISSIONS and PERMISSION_LABELS
export const PERMISSIONS = {};
export const PERMISSION_LABELS = {};

APP_MODULES.forEach(module => {
    module.submodules?.forEach(sub => {
        sub.actions?.forEach(action => {
            const key = `${module.id.toUpperCase()}_${sub.id.toUpperCase()}_${action.toUpperCase()}`;
            const val = `${module.id}.${sub.id}.${action}`;
            PERMISSIONS[key] = val;
            PERMISSION_LABELS[val] = action.charAt(0).toUpperCase() + action.slice(1); // Capitalize first letter for label
        });
    });
});

// Role-based default permissions (Standard defaults for new users)
export const ROLE_PERMISSIONS = {
    [ROLES.ADMIN]: ['*'],
    [ROLES.MANAGER]: [
        'customers',
        'tasks',
        'inventory',
        'production',
        'purchase',
        'sales',
        'service',
        'accounts',
        'reports'
    ],
    [ROLES.STAFF]: [
        'customers.customer_master.view',
        'customers.customer_master.add',
        'customers.reminder_tasks.view',
        'tasks.task_list.view',
        'tasks.task_list.add',
        'inventory.item_master.view',
        'inventory.bom.view',
        'production.prod_output.add',
        'purchase.purchase_orders.view',
        'sales.sales_orders.view',
        'service.complaints.view'
    ],
    [ROLES.VIEWER]: [
        'customers.customer_master.view',
        'inventory.item_master.view',
        'sales.sales_orders.view',
        'accounts.ledger_report.view'
    ]
};

// Check if role has permission
export const hasPermission = (userPermissions, requiredPermission, userRole = null, additionalPermissions = {}) => {
    // Extract role name if userRole is an object
    const actualRole = typeof userRole === 'object' ? (userRole?.name || userRole?.roleName) : userRole;

    // Superadmin has all permissions
    if (actualRole === ROLES.SUPERADMIN || actualRole === 'superadmin') return true;

    // 1. Check Granular Object (additionalPermissions)
    // Format can be "module.submodule.action" or just "module"
    if (typeof requiredPermission === 'string') {
        if (requiredPermission.includes('.')) {
            const [mod, sub, act] = requiredPermission.split('.');
            if (additionalPermissions?.[mod]?.[sub]?.[act]) return true;
        } else {
            // If just module name is passed, check if any submodule/action is true
            const moduleData = additionalPermissions?.[requiredPermission];
            if (moduleData && typeof moduleData === 'object') {
                const hasAny = Object.values(moduleData).some(sub => 
                    Object.values(sub).some(val => !!val)
                );
                if (hasAny) return true;
            }
        }
    }

    // 2. Check explicitly set Legacy Permissions Array (for backward compatibility)
    if (Array.isArray(userPermissions)) {
        if (userPermissions.includes('*')) return true;
        if (userPermissions.includes(requiredPermission)) return true;
    }

    // 3. Fallback to Role Default Permissions (from constants)
    if (userRole && ROLE_PERMISSIONS[userRole]) {
        const rolePerms = ROLE_PERMISSIONS[userRole];
        if (rolePerms.includes('*')) return true;
        if (rolePerms.includes(requiredPermission)) return true;
    }

    return false;
};

// Check if user has role
export const hasRole = (userRole, requiredRole) => {
    // Extract role name if userRole is an object
    const actualRole = typeof userRole === 'object' ? (userRole?.name || userRole?.roleName) : userRole;

    if (actualRole === ROLES.SUPERADMIN || actualRole === 'superadmin') return true;
    if (Array.isArray(requiredRole)) {
        return requiredRole.includes(actualRole);
    }
    return actualRole === requiredRole;
};

// Get permissions for a role
export const getPermissionsForRole = (role) => {
    return ROLE_PERMISSIONS[role] || [];
};

// Permission labels for UI are now generated dynamically above

// Role labels and colors
export const ROLE_CONFIG = {
    [ROLES.SUPERADMIN]: { label: 'System Admin', color: '#7c3aed', badge: '🟣' },
    [ROLES.ADMIN]: { label: 'Admin', color: '#dc2626', badge: '🔴' },
    [ROLES.MANAGER]: { label: 'Manager', color: '#f59e0b', badge: '🟡' },
    [ROLES.STAFF]: { label: 'Staff', color: '#3b82f6', badge: '🔵' },
    [ROLES.VIEWER]: { label: 'Viewer', color: '#6b7280', badge: '⚪' }
};
