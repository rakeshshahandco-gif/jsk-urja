/**
 * Central Permission Registry
 * This is the single source of truth for all modules and their available permissions.
 * Adding a module here will automatically reflect in the User Management UI.
 */
export const PERMISSION_REGISTRY = [
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
            { id: 'outstanding', name: 'Outstanding Report', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'credit_notes', name: 'Credit Notes', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }, { id: 'edit', label: 'Edit', type: 'boolean' }, { id: 'delete', label: 'Delete', type: 'boolean' }, { id: 'print', label: 'Print', type: 'boolean' }] },
            { id: 'debit_notes', name: 'Debit Notes', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }, { id: 'edit', label: 'Edit', type: 'boolean' }, { id: 'delete', label: 'Delete', type: 'boolean' }, { id: 'print', label: 'Print', type: 'boolean' }] }
        ]
    },
    {
        id: 'admin',
        name: 'Admin',
        submodules: [
            { id: 'company_profile', name: 'Company Profile', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'edit', label: 'Edit', type: 'boolean' }] },
            { id: 'financial_year', name: 'Financial Year Master', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage', type: 'boolean' }] },
            { id: 'user_management', name: 'User Management', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage', type: 'boolean' }] }
        ]
    },
    {
        id: 'whatsapp',
        name: '💬 WhatsApp',
        submodules: [
            { id: 'whatsapp_settings', name: 'WhatsApp Connection & Settings', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'edit', label: 'Edit', type: 'boolean' }, { id: 'connect', label: 'Connect/Disconnect', type: 'boolean' }] },
            { id: 'whatsapp_send', name: 'Send via WhatsApp', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'send', label: 'Send', type: 'boolean' }] }
        ]
    },
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
        id: 'production_rework',
        name: 'Failure & Rework',
        submodules: [
            {
                id: 'failure_entries',
                name: 'Production Failure Entries',
                actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }]
            },
            {
                id: 'rework_job_cards',
                name: 'Rework Job Cards',
                actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }, { id: 'edit', label: 'Edit', type: 'boolean' }]
            },
            {
                id: 'material_issues',
                name: 'Rework Material Issues',
                actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }]
            },
            {
                id: 'rework_outputs',
                name: 'Rework Output Entry',
                actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }]
            },
            {
                id: 'retest_confirmations',
                name: 'Retest Confirmations',
                actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage', type: 'boolean' }]
            },
            {
                id: 'production_scrap',
                name: 'Production Scrap',
                actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }]
            }
        ]
    },
    {
        id: 'fixed_assets',
        name: 'Fixed Assets',
        submodules: [
            { id: 'asset_register', name: 'Asset Register', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }, { id: 'edit', label: 'Edit', type: 'boolean' }, { id: 'delete', label: 'Delete', type: 'boolean' }] },
            { id: 'asset_categories', name: 'Asset Categories', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage', type: 'boolean' }] },
            { id: 'asset_locations', name: 'Asset Locations', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage', type: 'boolean' }] },
            { id: 'asset_transfers', name: 'Asset Transfers', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }] },
            { id: 'asset_maintenance', name: 'Asset Maintenance', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }] },
            { id: 'asset_disposals', name: 'Asset Disposals', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }] }
        ]
    },
    {
        id: 'hr',
        name: 'HR Management',
        submodules: [
            { id: 'hr_dashboard', name: 'HR Dashboard', actions: [{ id: 'view', label: 'View', type: 'boolean' }] },
            { 
                id: 'employee_master', 
                name: 'Employee Master', 
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' }, 
                    { id: 'add', label: 'Add', type: 'boolean' }, 
                    { id: 'edit', label: 'Edit', type: 'boolean' }, 
                    { id: 'delete', label: 'Delete', type: 'boolean' }
                ] 
            },
            { 
                id: 'shift_master', 
                name: 'Shift Master', 
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' }, 
                    { id: 'manage', label: 'Manage', type: 'boolean' }
                ] 
            },
            { 
                id: 'attendance', 
                name: 'Attendance Management', 
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' }, 
                    { id: 'add', label: 'Manual Entry', type: 'boolean' }, 
                    { id: 'import', label: 'Machine Import', type: 'boolean' }
                ] 
            },
            { 
                id: 'leave_management', 
                name: 'Leave Management', 
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' }, 
                    { id: 'apply', label: 'Apply Leave', type: 'boolean' }, 
                    { id: 'approve', label: 'Approve Leave', type: 'boolean' }
                ] 
            },
            { 
                id: 'payroll', 
                name: 'Payroll & Salary', 
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' }, 
                    { id: 'process', label: 'Process Payroll', type: 'boolean' }, 
                    { id: 'finalize', label: 'Finalize & Lock', type: 'boolean' }
                ] 
            },
            { 
                id: 'hr_reports', 
                name: 'HR Reports', 
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' }, 
                    { id: 'export', label: 'Export', type: 'boolean' }
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
        id: 'messenger',
        name: 'Messenger',
        submodules: [
            { id: 'chat', name: 'Direct Messaging', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'send', label: 'Send Messages', type: 'boolean' }] },
            { id: 'groups', name: 'Group Conversations', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage Groups', type: 'boolean' }] },
            { id: 'broadcast', name: 'Broadcast Lists', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'send', label: 'Send Broadcast', type: 'boolean' }] }
        ]
    },
    {
        id: 'mis',
        name: 'MIS',
        submodules: [
            { id: 'dashboard', name: 'MIS Dashboard', actions: [{ id: 'view', label: 'View', type: 'boolean' }] },
            { id: 'trial_balance', name: 'Trial Balance', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'profit_loss', name: 'Profit & Loss', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'balance_sheet', name: 'Balance Sheet', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'sales_marketing', name: 'Sales MIS Dashboard', actions: [{ id: 'view', label: 'View', type: 'boolean' }] },
            { id: 'product_gp_analysis', name: 'Product-wise GP Analysis', actions: [{ id: 'view', label: 'View', type: 'boolean' }] },
            { id: 'sales_conversion', name: 'Sales Conversion', actions: [{ id: 'view', label: 'View', type: 'boolean' }] }
        ]
    },
    {
        id: 'prd',
        name: 'Product R&D',
        submodules: [
            { id: 'dashboard', name: 'R&D Dashboard', actions: [{ id: 'view', label: 'View', type: 'boolean' }] },
            { id: 'projects', name: 'Product Development Master', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }, { id: 'edit', label: 'Edit', type: 'boolean' }, { id: 'delete', label: 'Delete', type: 'boolean' }] },
            { id: 'test_parameters', name: 'Test Parameter Master', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage', type: 'boolean' }] }
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
            },
            {
                id: 'production_planning',
                name: 'Production Planning / MRP',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' },
                    { id: 'edit', label: 'Edit', type: 'boolean' },
                    { id: 'delete', label: 'Delete', type: 'boolean' },
                    { id: 'calculate', label: 'Calculate', type: 'boolean' },
                    { id: 'approve', label: 'Approve', type: 'boolean' },
                    { id: 'export', label: 'Export', type: 'boolean' }
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
        id: 'reports',
        name: 'Reports',
        submodules: [
            { id: 'customer_master_report', name: 'Customer Master', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'followup_report', name: 'Follow-up Tracker Report', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'reminder_report', name: 'Open Reminders', actions: [{ id: 'view', label: 'View', type: 'boolean' }] }
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
            },
            {
                id: 'repair_job_cards',
                name: 'Repair Job Cards',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' },
                    { id: 'edit', label: 'Edit', type: 'boolean' }
                ]
            },
            {
                id: 'repaired_stock_inwards',
                name: 'Repaired Stock Inward',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' }
                ]
            },
            {
                id: 'scrap_entries',
                name: 'Scrap Entries (Service)',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Add', type: 'boolean' }
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
    }
];
