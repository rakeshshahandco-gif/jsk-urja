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
            { id: 'item_images', name: 'Item Images (Textile)', actions: ['view', 'upload', 'delete', 'download'] },
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
        id: 'documents',
        name: 'Documents',
        submodules: [
            { id: 'scan_bills', name: 'Scan Bills', actions: ['view', 'add', 'edit', 'delete', 'scan'] },
            { id: 'missing_attachments', name: 'Missing Attachments', actions: ['view', 'export'] },
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
            { id: 'sales_register', name: 'Sales Register', actions: ['view', 'export'] },
            { id: 'purchase_register', name: 'Purchase Register', actions: ['view', 'export'] },
            { id: 'day_book', name: 'Day Book', actions: ['view', 'export'] },
            { id: 'cash_book', name: 'Cash Book', actions: ['view', 'export'] },
            { id: 'bank_book', name: 'Bank Book', actions: ['view', 'export'] },
            { id: 'outstanding', name: 'Outstanding Report', actions: ['view', 'export'] },
            { id: 'credit_notes', name: 'Credit Notes', actions: ['view', 'add', 'edit', 'delete', 'print'] },
            { id: 'debit_notes', name: 'Debit Notes', actions: ['view', 'add', 'edit', 'delete', 'print'] },
        ]
    },
    {
        id: 'voucher_entry',
        name: 'Voucher Entry',
        submodules: [
            { id: 'petty_cash', name: 'Petty Cash', actions: ['view', 'add', 'edit', 'delete', 'import', 'export', 'approve'] },
        ]
    },
    {
        id: 'tds',
        name: 'TDS',
        submodules: [
            { id: 'dashboard', name: 'TDS Dashboard', actions: ['view'] },
            { id: 'master', name: 'TDS Master / Section Rates', actions: ['view', 'edit'] },
            { id: 'ledger_mapping', name: 'TDS Ledger Mapping', actions: ['view', 'edit'] },
            { id: 'deduction_register', name: 'TDS Deduction Register', actions: ['view'] },
            { id: 'payable_register', name: 'TDS Payable Register', actions: ['view'] },
            { id: 'challan', name: 'TDS Challan / Payment', actions: ['view', 'add', 'edit', 'delete'] },
            { id: 'returns', name: 'TDS Return / Filing Data', actions: ['view', 'edit', 'export'] },
            { id: 'reports', name: 'TDS Reports', actions: ['view', 'export'] },
            { id: 'settings', name: 'TDS Settings', actions: ['view', 'edit'] },
        ]
    },
    {
        id: 'reports',
        name: 'Reports',
        submodules: [
            { id: 'customer_master_report', name: 'Customer Master', actions: ['view', 'export'] },
            { id: 'followup_report', name: 'Follow-up Tracker Report', actions: ['view', 'export'] },
            { id: 'followup_dashboard_report', name: 'Follow-up Dashboard Report', actions: ['view', 'export'] },
            { id: 'followup_task_report', name: 'Follow-up Task Report', actions: ['view', 'export'] },
            { id: 'conversation_history_report', name: 'Conversation History', actions: ['view', 'export'] },
            { id: 'reminder_report', name: 'Open Reminders', actions: ['view'] },
            { id: 'task_reminder_report', name: 'Task Reminder Report', actions: ['view', 'export'] },
            { id: 'purchase_comparison_report', name: 'Purchase Comparison Report', actions: ['view', 'export'] }
        ]
    },
    {
        id: 'mis',
        name: 'MIS',
        submodules: [
            { id: 'dashboard', name: 'MIS Dashboard', actions: ['view'] },
            { id: 'director_dashboard', name: 'Director MIS Dashboard', actions: ['view'] },
            { id: 'trial_balance', name: 'Trial Balance', actions: ['view', 'export'] },
            { id: 'profit_loss', name: 'Profit & Loss', actions: ['view', 'export'] },
            { id: 'balance_sheet', name: 'Balance Sheet', actions: ['view', 'export'] },
            { id: 'sales_marketing', name: 'Sales MIS Dashboard', actions: ['view'] },
            { id: 'product_gp_analysis', name: 'Product-wise GP Analysis', actions: ['view'] },
            { id: 'sales_conversion', name: 'Sales Conversion', actions: ['view'] }
        ]
    },
    {
        id: 'admin',
        name: 'Admin',
        submodules: [
            { id: 'company_profile', name: 'Company Profile', actions: ['view', 'edit'] },
            { id: 'print_format_designer', name: 'Print Format Designer', actions: ['view'] },
            { id: 'user_management', name: 'User Management', actions: ['view', 'manage'] }
        ]
    },
    {
        id: 'whatsapp',
        name: '💬 WhatsApp',
        submodules: [
            { id: 'whatsapp_settings', name: 'WhatsApp Connection & Settings', actions: ['view', 'edit', 'connect', 'disconnect'] },
            { id: 'whatsapp_send', name: 'Send via WhatsApp', actions: ['view', 'send'] }
        ]
    },
    {
        id: 'whatsapp_bulk',
        name: 'WhatsApp Bulk Messaging',
        submodules: [
            { id: 'campaigns', name: 'WhatsApp Bulk Message Utility', actions: ['view', 'add', 'edit', 'delete', 'send', 'export'] },
            { id: 'matter_master', name: 'WhatsApp Matter Master', actions: ['view', 'add', 'edit', 'delete'] },
            { id: 'blacklist', name: 'WhatsApp Blacklist', actions: ['view', 'add', 'edit', 'delete'] },
            { id: 'history', name: 'Campaign History', actions: ['view', 'export'] },
            { id: 'settings', name: 'WhatsApp Bulk Messaging Settings', actions: ['view', 'edit'] },
        ],
    },
    {
        id: 'whatsapp_ai',
        name: 'WhatsApp AI',
        submodules: [
            { id: 'module', name: 'WhatsApp AI Access', actions: ['view', 'archive', 'takeover', 'return_to_ai'] },
            { id: 'settings', name: 'AI Settings', actions: ['manage'] },
            { id: 'knowledge', name: 'AI Knowledge', actions: ['manage', 'approve'] },
            { id: 'conversations', name: 'AI Conversations', actions: ['view_all', 'view_assigned'] },
            { id: 'lead_draft', name: 'AI Lead Drafts', actions: ['create', 'approve'] },
            { id: 'documents', name: 'AI Product Documents', actions: ['manage', 'share'] },
            { id: 'audit', name: 'AI Audit Logs', actions: ['view'] },
            { id: 'dashboard', name: 'AI Dashboard', actions: ['view'] },
            { id: 'testing', name: 'AI Testing', actions: ['inbound', 'generate_draft'] },
            { id: 'drafts', name: 'AI Reply Drafts', actions: ['view', 'edit', 'approve', 'reject', 'regenerate'] },
        ],
    },
    {
        id: 'email',
        name: 'Platform Email',
        submodules: [
            { id: 'settings', name: 'Platform Email Settings', actions: ['view', 'edit', 'test'] },
            { id: 'communication_history', name: 'Communication History', actions: ['view', 'export'] },
        ],
    },
    {
        id: 'email_bulk',
        name: 'Email Bulk Messaging',
        submodules: [
            { id: 'campaigns', name: 'Email Bulk Message Utility', actions: ['view', 'add', 'edit', 'delete', 'send', 'export'] },
            { id: 'templates', name: 'Email Template Master', actions: ['view', 'add', 'edit', 'delete'] },
            { id: 'blacklist', name: 'Email Blacklist', actions: ['view', 'add', 'edit', 'delete'] },
            { id: 'history', name: 'Email Campaign History', actions: ['view', 'export'] },
            { id: 'settings', name: 'Email Bulk Messaging Settings', actions: ['view', 'edit'] },
        ],
    },
    {
        id: 'messenger',
        name: 'Messenger',
        submodules: [
            { id: 'module_access', name: 'Messenger Access', actions: ['view', 'add', 'edit', 'delete', 'send'] },
        ],
    },
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
        'tds',
        'reports',
        'admin.whatsapp_settings.view',
        'whatsapp.whatsapp_settings.view',
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

/**
 * Grant check for nested permission trees (role.permissions / additionalPermissions).
 * Only explicit `true` grants. Explicit `false` / missing does not grant and does not deny
 * other sources (caller continues to the next source).
 */
export const nestedPermissionGrants = (tree, requiredPermission) => {
    if (!tree || typeof tree !== 'object' || typeof requiredPermission !== 'string') {
        return false;
    }

    if (!requiredPermission.includes('.')) {
        const moduleData = tree[requiredPermission];
        if (moduleData === true) return true;
        if (moduleData && typeof moduleData === 'object') {
            const hasAnyTrueValue = (obj) => {
                if (!obj || typeof obj !== 'object') return obj === true;
                return Object.values(obj).some(
                    (val) => val === true || (val && typeof val === 'object' && hasAnyTrueValue(val)),
                );
            };
            return hasAnyTrueValue(moduleData);
        }
        return false;
    }

    const parts = requiredPermission.split('.');
    if (parts.length === 3) {
        const [mod, sub, act] = parts;
        if (tree[mod]?.[sub]?.[act] === true) return true;
        if (tree[mod]?.[act] === true) return true;
        return false;
    }
    if (parts.length === 2) {
        const [mod, act] = parts;
        if (tree[mod]?.[act] === true) return true;
        const moduleData = tree[mod];
        if (moduleData && typeof moduleData === 'object') {
            return Object.values(moduleData).some(
                (sub) => typeof sub === 'object' && sub !== null && sub[act] === true,
            );
        }
    }
    return false;
};

// Check if user has permission
export const hasPermission = (
    userPermissions,
    requiredPermission,
    userRole = null,
    additionalPermissions = {},
    rolePermissions = {},
) => {
    // 1. Normalize and check for System Admin/Admin role bypass
    const normalizedRole = (userRole || '').trim().toLowerCase();
    const isAdmin = ['admin', 'superadmin', 'system admin', 'systemadmin'].includes(normalizedRole);
    
    if (isAdmin) return true;

    // 2. Safety check for missing permission data
    const hasRoleTree = rolePermissions && typeof rolePermissions === 'object'
        && Object.keys(rolePermissions).length > 0;
    if (!userPermissions && !additionalPermissions && !hasRoleTree) {
        return false;
    }

    // 3. Check additionalPermissions (granular object structure) — true grants only
    if (typeof requiredPermission === 'string' && additionalPermissions) {
        if (requiredPermission.includes('.')) {
            const parts = requiredPermission.split('.');
            if (parts.length === 3) {
                const [mod, sub, act] = parts;
                if (additionalPermissions[mod]?.[sub]?.[act]) return true;
                if (additionalPermissions[mod]?.[act]) return true;
            } else if (parts.length === 2) {
                const [mod, act] = parts;
                if (additionalPermissions[mod]?.[act]) return true;
                const moduleData = additionalPermissions[mod];
                if (moduleData && typeof moduleData === 'object') {
                    return Object.values(moduleData).some(sub => 
                        typeof sub === 'object' && sub !== null && sub[act] === true
                    );
                }
            }
        } else {
            const moduleData = additionalPermissions[requiredPermission];
            if (moduleData === true) return true;
            if (moduleData && typeof moduleData === 'object') {
                const hasAnyTrueValue = (obj) => {
                    if (!obj || typeof obj !== 'object') return obj === true;
                    return Object.values(obj).some(val => val === true || (val && typeof val === 'object' && hasAnyTrueValue(val)));
                };
                return hasAnyTrueValue(moduleData);
            }
        }
    }

    // 4. Check userPermissions array
    const permissions = Array.isArray(userPermissions) ? userPermissions : [userPermissions].filter(Boolean);
    if (permissions.includes('*')) return true;
    if (permissions.some(p => (typeof p === 'string' ? p : p?.key) === requiredPermission)) return true;

    // 4b. Authenticated role permission tree (user.role.permissions) — true grants only
    if (nestedPermissionGrants(rolePermissions, requiredPermission)) {
        return true;
    }

    // 5. Fallback to Role Default Permissions
    if (userRole && ROLE_PERMISSIONS[userRole]) {
        const rolePerms = ROLE_PERMISSIONS[userRole];
        if (rolePerms.includes('*') || rolePerms.includes(requiredPermission)) return true;
    }

    // TDS sidebar parent: any granular TDS (or legacy Accounts TDS) right opens the module menu
    if (requiredPermission === 'tds') {
        const list = Array.isArray(userPermissions) ? userPermissions : [userPermissions].filter(Boolean);
        if (list.some((p) => typeof p === 'string' && (p.startsWith('tds.') || p.startsWith('accounts.tds_compliance')))) {
            return true;
        }
        if (additionalPermissions?.tds && typeof additionalPermissions.tds === 'object') return true;
        if (additionalPermissions?.accounts?.tds_compliance && typeof additionalPermissions.accounts.tds_compliance === 'object') {
            return true;
        }
    }

    // Legacy: grants issued as Accounts — TDS Compliance still satisfy tds.* checks
    if (typeof requiredPermission === 'string' && requiredPermission.startsWith('tds.')) {
        const list = Array.isArray(userPermissions) ? userPermissions : [userPermissions].filter(Boolean);
        const act = requiredPermission.split('.').pop();
        if (act === 'view' && list.some((p) => p === 'accounts.tds_compliance.view')) return true;
        if (['add', 'edit', 'manage'].includes(act) && list.some((p) => p === 'accounts.tds_compliance.edit' || p === 'accounts.tds_compliance.add')) {
            return true;
        }
        if (act === 'export' && list.some((p) => p === 'accounts.tds_compliance.export')) return true;
        if (act === 'delete' && list.some((p) => p === 'accounts.tds_compliance.delete')) return true;
        const ap = additionalPermissions?.accounts?.tds_compliance;
        if (ap && typeof ap === 'object') {
            if (act === 'view' && ap.view) return true;
            if (['add', 'edit', 'manage'].includes(act) && (ap.edit || ap.add)) return true;
            if (act === 'export' && ap.export) return true;
            if (act === 'delete' && ap.delete) return true;
        }
    }

    return false;
};

// Check if user has role
export const hasRole = (userRole, requiredRole) => {
    if (!userRole) return false;
    
    const normalizedUserRole = userRole.trim().toLowerCase();
    
    // System Admin bypasses all role requirements
    if (['admin', 'superadmin', 'system admin', 'systemadmin'].includes(normalizedUserRole)) {
        return true;
    }

    if (Array.isArray(requiredRole)) {
        return requiredRole.some(role => role.trim().toLowerCase() === normalizedUserRole);
    }
    
    return normalizedUserRole === requiredRole.trim().toLowerCase();
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
