/**
 * Central Permission Registry
 * This is the single source of truth for all modules and their available permissions.
 * Adding a module here will automatically reflect in the User Management UI.
 */
export const PERMISSION_REGISTRY = [
    {
        id: 'customers',
        name: 'Customers',
        actions: [
            { id: 'view', label: 'View Customers', type: 'boolean' },
            { id: 'add', label: 'Add Customer', type: 'boolean' },
            { id: 'edit', label: 'Edit Customer', type: 'boolean' },
            { id: 'delete', label: 'Delete Customer', type: 'boolean' },
            { id: 'talk', label: 'Talk With Customer', type: 'boolean' },
            { id: 'scope', label: 'Data Visibility', type: 'scope', options: ['Own', 'Department', 'All'] }
        ]
    },
    {
        id: 'tasks',
        name: 'Tasks',
        actions: [
            { id: 'view', label: 'View Tasks', type: 'boolean' },
            { id: 'add', label: 'Add Task', type: 'boolean' },
            { id: 'edit', label: 'Edit Task', type: 'boolean' },
            { id: 'delete', label: 'Delete Task', type: 'boolean' }
        ]
    },
    {
        id: 'reminders',
        name: 'Reminders',
        actions: [
            { id: 'view', label: 'View Reminders', type: 'boolean' }
        ]
    },
    {
        id: 'reports',
        name: 'Reports',
        actions: [
            { id: 'view', label: 'View Reports', type: 'boolean' }
        ]
    },
    {
        id: 'inventory',
        name: 'Inventory',
        actions: [
            { id: 'view', label: 'View Inventory', type: 'boolean' },
            { id: 'adjust', label: 'Adjust Stock', type: 'boolean' },
            { id: 'reports', label: 'Inventory Reports', type: 'boolean' }
        ]
    },
    {
        id: 'production',
        name: 'Production',
        actions: [
            { id: 'view', label: 'View Production', type: 'boolean' },
            { id: 'entry', label: 'Production Entry', type: 'boolean' },
            { id: 'bom', label: 'Manage BOM', type: 'boolean' }
        ]
    },
    {
        id: 'purchase',
        name: 'Purchase',
        actions: [
            { id: 'view', label: 'View Purchase', type: 'boolean' },
            { id: 'add', label: 'Add Purchase Order', type: 'boolean' },
            { id: 'edit', label: 'Edit Purchase Order', type: 'boolean' },
            { id: 'scope', label: 'Data Visibility', type: 'scope', options: ['Own', 'Department', 'All'] }
        ]
    },
    {
        id: 'sales',
        name: 'Sales',
        actions: [
            { id: 'view', label: 'View Sales', type: 'boolean' },
            { id: 'add', label: 'Add Sale Order', type: 'boolean' },
            { id: 'edit', label: 'Edit Sale Order', type: 'boolean' },
            { id: 'invoice', label: 'Generate Invoice', type: 'boolean' },
            { id: 'scope', label: 'Data Visibility', type: 'scope', options: ['Own', 'Department', 'All'] }
        ]
    },
    {
        id: 'service',
        name: 'Service',
        actions: [
            { id: 'view', label: 'View Service', type: 'boolean' },
            { id: 'tickets', label: 'Manage Tickets', type: 'boolean' }
        ]
    },
    {
        id: 'accounts',
        name: 'Accounts',
        actions: [
            { id: 'view', label: 'View Accounts', type: 'boolean' },
            { id: 'vouchers', label: 'Manage Vouchers', type: 'boolean' },
            { id: 'ledgers', label: 'Manage Ledgers', type: 'boolean' },
            { id: 'reports', label: 'Financial Reports', type: 'boolean' }
        ]
    },
    {
        id: 'users',
        name: 'Users',
        actions: [
            { id: 'manage', label: 'Manage Users & Permissions', type: 'boolean' },
            { id: 'roles', label: 'Manage Roles', type: 'boolean' },
            { id: 'audit', label: 'View Audit Logs', type: 'boolean' }
        ]
    },
    {
        id: 'settings',
        name: 'Settings',
        actions: [
            { id: 'view', label: 'View Settings', type: 'boolean' },
            { id: 'company', label: 'Company Profile', type: 'boolean' },
            { id: 'whatsapp', label: 'WhatsApp Config', type: 'boolean' }
        ]
    }
];
