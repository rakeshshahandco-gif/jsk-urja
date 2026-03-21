/**
 * Central Permission Registry
 * This is the single source of truth for all modules and their available permissions.
 * Adding a module here will automatically reflect in the User Management UI.
 */
export const PERMISSION_REGISTRY = [
    {
        id: 'customers',
        name: 'Customers',
        submodules: [
            {
                id: 'customer_master',
                name: 'Customer Master',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' },
                    { id: 'edit', label: 'Edit', type: 'boolean' },
                    { id: 'delete', label: 'Delete', type: 'boolean' },
                    { id: 'export', label: 'Export', type: 'boolean' }
                ]
            },
            {
                id: 'reminder_tasks',
                name: 'Reminder Tasks',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'manage', label: 'Manage', type: 'boolean' }
                ]
            },
            {
                id: 'follow_up',
                name: 'Follow-up Dashboard',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'talk', label: 'Talk With Customer', type: 'boolean' }
                ]
            }
        ]
    },
    {
        id: 'tasks',
        name: 'Task Management',
        submodules: [
            {
                id: 'task_list',
                name: 'Manage Tasks',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' },
                    { id: 'edit', label: 'Edit', type: 'boolean' },
                    { id: 'delete', label: 'Delete', type: 'boolean' }
                ]
            },
            {
                id: 'task_groups',
                name: 'Task Groups',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'manage', label: 'Manage', type: 'boolean' }
                ]
            }
        ]
    },
    {
        id: 'inventory',
        name: 'Inventory',
        submodules: [
            {
                id: 'item_master',
                name: 'Item Master',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' },
                    { id: 'edit', label: 'Edit', type: 'boolean' },
                    { id: 'delete', label: 'Delete', type: 'boolean' },
                    { id: 'export', label: 'Export', type: 'boolean' },
                    { id: 'import', label: 'Import', type: 'boolean' }
                ]
            },
            {
                id: 'item_types',
                name: 'Item Types',
                actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage', type: 'boolean' }]
            },
            {
                id: 'item_groups',
                name: 'Item Groups',
                actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage', type: 'boolean' }]
            },
            {
                id: 'bom',
                name: 'Bill of Materials (BOM)',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' },
                    { id: 'edit', label: 'Edit', type: 'boolean' },
                    { id: 'delete', label: 'Delete', type: 'boolean' },
                    { id: 'print', label: 'Print', type: 'boolean' },
                    { id: 'export', label: 'Export', type: 'boolean' }
                ]
            },
            {
                id: 'raw_material_report',
                name: 'Raw Material Stock Report',
                actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }]
            },
            {
                id: 'finished_goods_report',
                name: 'Finished Goods Stock Report',
                actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }]
            },
            {
                id: 'stock_ledger',
                name: 'Stock Movement Ledger',
                actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }]
            }
        ]
    },
    {
        id: 'production',
        name: 'Production',
        submodules: [
            {
                id: 'prod_dashboard',
                name: 'Dashboard',
                actions: [{ id: 'view', label: 'View', type: 'boolean' }]
            },
            {
                id: 'prod_output',
                name: 'Production Output Entry',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' }
                ]
            },
            {
                id: 'comp_replacement',
                name: 'Component Replacement',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' }
                ]
            },
            {
                id: 'prod_rejection',
                name: 'Production Rejection',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' }
                ]
            },
            {
                id: 'prod_rework',
                name: 'Failure & Rework',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'manage', label: 'Manage', type: 'boolean' }
                ]
            }
        ]
    },
    {
        id: 'purchase',
        name: 'Purchase',
        submodules: [
            {
                id: 'suppliers',
                name: 'Suppliers',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' },
                    { id: 'edit', label: 'Edit', type: 'boolean' },
                    { id: 'delete', label: 'Delete', type: 'boolean' }
                ]
            },
            {
                id: 'purchase_orders',
                name: 'Purchase Orders',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' },
                    { id: 'edit', label: 'Edit', type: 'boolean' },
                    { id: 'delete', label: 'Delete', type: 'boolean' },
                    { id: 'print', label: 'Print', type: 'boolean' },
                    { id: 'approve', label: 'Approve', type: 'boolean' }
                ]
            },
            {
                id: 'grn',
                name: 'Goods Receipt (GRN)',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' }
                ]
            },
            {
                id: 'purchase_invoices',
                name: 'Purchase Invoices',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' },
                    { id: 'edit', label: 'Edit', type: 'boolean' },
                    { id: 'delete', label: 'Delete', type: 'boolean' }
                ]
            }
        ]
    },
    {
        id: 'sales',
        name: 'Sales',
        submodules: [
            {
                id: 'sales_orders',
                name: 'Sales Orders',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' },
                    { id: 'edit', label: 'Edit', type: 'boolean' },
                    { id: 'delete', label: 'Delete', type: 'boolean' },
                    { id: 'print', label: 'Print', type: 'boolean' }
                ]
            },
            {
                id: 'sales_invoices',
                name: 'Tax Invoices (GST)',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' },
                    { id: 'edit', label: 'Edit', type: 'boolean' },
                    { id: 'delete', label: 'Delete', type: 'boolean' },
                    { id: 'print', label: 'Print', type: 'boolean' }
                ]
            },
            {
                id: 'invoice_series',
                name: 'Invoice Series',
                actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage', type: 'boolean' }]
            }
        ]
    },
    {
        id: 'service',
        name: 'Service',
        submodules: [
            {
                id: 'complaints',
                name: 'Customer Complaints',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' },
                    { id: 'edit', label: 'Edit', type: 'boolean' }
                ]
            },
            {
                id: 'replacement_dashboard',
                name: 'Replacement Dashboard',
                actions: [{ id: 'view', label: 'View', type: 'boolean' }]
            },
            {
                id: 'replacement_dispatches',
                name: 'Replacement Dispatches',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' }
                ]
            }
        ]
    },
    {
        id: 'accounts',
        name: 'Accounts',
        submodules: [
            { id: 'receipt_entry', name: 'Receipt Entry', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }] },
            { id: 'payment_entry', name: 'Payment Entry', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }] },
            { id: 'expense_entry', name: 'Expense Voucher', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }] },
            { id: 'journal_entry', name: 'Journal Voucher', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }] },
            { id: 'vouchers', name: 'Voucher Register', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'edit', label: 'Edit', type: 'boolean' }] },
            { id: 'ledger_master', name: 'Ledger Master', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage', type: 'boolean' }] },
            { id: 'ledger_report', name: 'Ledger Report', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'outstanding', name: 'Outstanding Report', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] }
        ]
    },
    {
        id: 'reports',
        name: 'Reports',
        submodules: [
            { id: 'customer_master_report', name: 'Customer Master', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'followup_report', name: 'Follow-up Tracker Report', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'reminder_report', name: 'Open Reminders', actions: [{ id: 'view', label: 'View', type: 'boolean' }] }
        ]
    },
    {
        id: 'admin',
        name: 'Admin',
        submodules: [
            { id: 'company_profile', name: 'Company Profile', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'edit', label: 'Edit', type: 'boolean' }] },
            { id: 'whatsapp_settings', name: 'WhatsApp Settings', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'edit', label: 'Edit', type: 'boolean' }] },
            { id: 'user_management', name: 'User Management', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage', type: 'boolean' }] }
        ]
    }
];
