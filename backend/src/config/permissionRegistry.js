/**
 * Central Permission Registry
 * This is the single source of truth for all modules and their available permissions.
 * Adding a module here will automatically reflect in the User Management UI.
 */

const STANDARD_ACTIONS = [
    { id: 'view', label: 'View', type: 'boolean' },
    { id: 'add', label: 'Create', type: 'boolean' },
    { id: 'edit', label: 'Edit', type: 'boolean' },
    { id: 'delete', label: 'Delete', type: 'boolean' }
];

const EXTENDED_ACTIONS = [
    ...STANDARD_ACTIONS,
    { id: 'print', label: 'Print', type: 'boolean' },
    { id: 'export', label: 'Export', type: 'boolean' },
    { id: 'cancel', label: 'Cancel', type: 'boolean' },
    { id: 'approve', label: 'Approve', type: 'boolean' }
];

export const PERMISSION_REGISTRY = [
    {
        id: 'home',
        name: 'Home',
        submodules: [
            { id: 'dashboard', name: 'Home Page', actions: [{ id: 'view', label: 'View Home', type: 'boolean' }] },
            { id: 'add_form', name: 'Add Form', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage', type: 'boolean' }] },
            { id: 'home_cards', name: 'Customize Home Cards', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'edit', label: 'Change Colour', type: 'boolean' }] },
            { id: 'theme', name: 'Customize Theme', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'edit', label: 'Change Theme', type: 'boolean' }] }
        ]
    },
    {
        id: 'crm',
        name: 'CRM',
        submodules: [
            { id: 'customer_master', name: 'Customer Master', actions: [...EXTENDED_ACTIONS, { id: 'import', label: 'Import', type: 'boolean' }] },
            { id: 'leads', name: 'Inquiry / Lead', actions: [...STANDARD_ACTIONS, { id: 'convert_whatsapp', label: 'Convert WhatsApp Chat to Lead', type: 'boolean' }, { id: 'share_asset', label: 'Share Catalog / Datasheet', type: 'boolean' }] },
            { id: 'product_catalog', name: 'Product Catalog', actions: [...STANDARD_ACTIONS, { id: 'share', label: 'Share to WhatsApp', type: 'boolean' }] },
            { id: 'follow_up', name: 'Follow-up Dashboard', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'talk', label: 'Talk With Customer', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] }
        ]
    },
    {
        id: 'tasks',
        name: 'Task Management',
        submodules: [
            { id: 'task_list', name: 'Manage Tasks', actions: STANDARD_ACTIONS },
            { id: 'task_groups', name: 'Task Groups', actions: [...STANDARD_ACTIONS, { id: 'manage', label: 'Manage Items', type: 'boolean' }] },
            { id: 'reminders', name: 'Reminders', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage', type: 'boolean' }] }
        ]
    },
    {
        id: 'reports',
        name: 'General Reports',
        submodules: [
            { id: 'customer_master_report', name: 'Customer Master Report', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'followup_report', name: 'Follow-up Tracker Report', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'reminder_report', name: 'Open Reminders Report', actions: [{ id: 'view', label: 'View', type: 'boolean' }] }
        ]
    },
    {
        id: 'sales',
        name: 'Sales',
        submodules: [
            { id: 'sales_orders', name: 'Sales Orders', actions: EXTENDED_ACTIONS },
            { id: 'sales_invoices', name: 'Tax Invoice GST', actions: [...EXTENDED_ACTIONS, { id: 'whatsapp', label: 'WhatsApp Send', type: 'boolean' }, { id: 'email', label: 'Email Send', type: 'boolean' }] },
            { id: 'internal_sales', name: 'Estimate / Internal Sale', actions: EXTENDED_ACTIONS },
            { id: 'eway_bills', name: 'E-Way Bill Tracking', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'logistics', name: 'Logistics & Courier Master', actions: STANDARD_ACTIONS }
        ]
    },
    {
        id: 'purchase',
        name: 'Purchase',
        submodules: [
            { id: 'purchase_orders', name: 'Purchase Order', actions: EXTENDED_ACTIONS },
            { id: 'purchase_invoices', name: 'Purchase Invoice', actions: EXTENDED_ACTIONS },
            { id: 'suppliers', name: 'Supplier Master', actions: [...STANDARD_ACTIONS, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'grn', name: 'Goods Receipt (GRN)', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }, { id: 'print', label: 'Print', type: 'boolean' }] }
        ]
    },
    {
        id: 'inventory',
        name: 'Inventory',
        submodules: [
            { id: 'item_master', name: 'Item Master', actions: [...STANDARD_ACTIONS, { id: 'export', label: 'Export', type: 'boolean' }, { id: 'import', label: 'Import', type: 'boolean' }] },
            { id: 'bom', name: 'BOM (Bill of Materials)', actions: [...EXTENDED_ACTIONS] },
            { id: 'raw_material_report', name: 'Raw Material Stock Report', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'finished_goods_report', name: 'Finished Goods Stock Report', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'stock_ledger', name: 'Stock Movement Ledger', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] }
        ]
    },
    {
        id: 'production',
        name: 'Production',
        submodules: [
            { id: 'work_orders', name: 'Work Order', actions: EXTENDED_ACTIONS },
            { id: 'production_entry', name: 'Production Entry', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }] },
            { id: 'production_planning', name: 'Production Planning / MRP', actions: [...STANDARD_ACTIONS, { id: 'calculate', label: 'Calculate', type: 'boolean' }, { id: 'approve', label: 'Approve', type: 'boolean' }] }
        ]
    },
    {
        id: 'voucher_entry',
        name: 'Voucher Entry',
        submodules: [
            { id: 'receipt_entry', name: 'Receipt Voucher', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }, { id: 'print', label: 'Print', type: 'boolean' }] },
            { id: 'payment_entry', name: 'Payment Voucher', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }, { id: 'print', label: 'Print', type: 'boolean' }] },
            { id: 'journal_entry', name: 'Journal Voucher', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }] },
            { id: 'expense_entry', name: 'Expense Voucher', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }] },
            { id: 'debit_notes', name: 'Debit Note', actions: EXTENDED_ACTIONS },
            { id: 'credit_notes', name: 'Credit Note', actions: EXTENDED_ACTIONS }
        ]
    },
    {
        id: 'account_master',
        name: 'Account Master',
        submodules: [
            { id: 'group_master', name: 'Group Master', actions: STANDARD_ACTIONS },
            { id: 'ledger_master', name: 'Ledger Master', actions: STANDARD_ACTIONS },
            { id: 'financial_year', name: 'Financial Year Master', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage', type: 'boolean' }] },
            { id: 'series_master', name: 'Series Master', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage', type: 'boolean' }] }
        ]
    },
    {
        id: 'accounts_reports',
        name: 'Accounts',
        submodules: [
            { id: 'vouchers', name: 'Voucher Register', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'ledger_report', name: 'Ledger Report', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'sales_register', name: 'Sales Register', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'purchase_register', name: 'Purchase Register', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'expense_register', name: 'Expense Register', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'day_book', name: 'Day Book', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'cash_book', name: 'Cash Book', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'bank_book', name: 'Bank Book', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'outstanding', name: 'Outstanding Report', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] }
        ]
    },
    {
        id: 'tds',
        name: 'TDS',
        submodules: [
            { id: 'dashboard', name: 'TDS Dashboard', actions: [{ id: 'view', label: 'View', type: 'boolean' }] },
            { id: 'master', name: 'TDS Master / Section Rates', actions: STANDARD_ACTIONS },
            { id: 'ledger_mapping', name: 'TDS Ledger Mapping', actions: STANDARD_ACTIONS },
            { id: 'deduction_register', name: 'TDS Deduction Register', actions: [{ id: 'view', label: 'View', type: 'boolean' }] },
            { id: 'payable_register', name: 'TDS Payable Register', actions: [{ id: 'view', label: 'View', type: 'boolean' }] },
            { id: 'challan', name: 'TDS Challan / Payment', actions: [...STANDARD_ACTIONS] },
            { id: 'returns', name: 'TDS Return / Filing Data', actions: [...STANDARD_ACTIONS, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'reports', name: 'TDS Reports', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'settings', name: 'TDS Settings', actions: STANDARD_ACTIONS },
        ],
    },
    {
        id: 'gst',
        name: 'GST',
        submodules: [
            { id: 'gstr1', name: 'GSTR-1', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'gstr3b', name: 'GSTR-3B', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'gst_reconciliation', name: '2A / 2B Reconciliation', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'import', label: 'Import', type: 'boolean' }] },
            { id: 'gst_payable', name: 'GST Payable Summary', actions: [{ id: 'view', label: 'View', type: 'boolean' }] },
            { id: 'itc_register', name: 'ITC Register', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'hsn_summary', name: 'HSN Summary', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'gst_ledger', name: 'GST Ledger', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
        ]
    },
    {
        id: 'mis',
        name: 'MIS Reports',
        submodules: [
            { id: 'dashboard', name: 'Sales MIS Dashboard', actions: [{ id: 'view', label: 'View', type: 'boolean' }] },
            { id: 'sales_marketing', name: 'Sales & Marketing MIS', actions: [{ id: 'view', label: 'View', type: 'boolean' }] },
            { id: 'director_dashboard', name: 'Director MIS Dashboard', actions: [{ id: 'view', label: 'View', type: 'boolean' }] },
            { id: 'product_gp', name: 'Product-wise GP Analysis', actions: [{ id: 'view', label: 'View', type: 'boolean' }] },
            { id: 'sales_conversion', name: 'Sales Conversion Analysis Dashboard', actions: [{ id: 'view', label: 'View', type: 'boolean' }] }
        ]
    },
    {
        id: 'admin',
        name: 'Admin',
        submodules: [
            { id: 'user_management', name: 'User Management', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Create User', type: 'boolean' }, { id: 'edit', label: 'Edit User', type: 'boolean' }, { id: 'delete', label: 'Delete User', type: 'boolean' }, { id: 'password', label: 'Change Password', type: 'boolean' }, { id: 'rights', label: 'Manage Rights', type: 'boolean' }] },
            { id: 'role_management', name: 'Role Management', actions: STANDARD_ACTIONS },
            { id: 'security_control', name: 'Security & Control', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'edit', label: 'Manage', type: 'boolean' }, { id: 'approve', label: 'Approve', type: 'boolean' }] },
            { id: 'ledger_linking', name: 'Ledger Linking Utility', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'apply', label: 'Apply Linking', type: 'boolean' }] },
            { id: 'company_settings', name: 'Company Settings', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'edit', label: 'Edit', type: 'boolean' }] },
            { id: 'company_profile', name: 'Company Profile', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'edit', label: 'Edit', type: 'boolean' }] },
            { id: 'system_settings', name: 'System Settings', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'edit', label: 'Edit', type: 'boolean' }] }
        ]
    }
];
