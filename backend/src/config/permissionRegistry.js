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
        id: 'customers',
        name: 'Customers',
        submodules: [
            { id: 'customer_master', name: 'Customer Master', actions: [...EXTENDED_ACTIONS, { id: 'import', label: 'Import', type: 'boolean' }] },
            {
                id: 'customer_documents',
                name: 'Customer Documents / KYC',
                actions: [
                    { id: 'view', label: 'View Customer Documents', type: 'boolean' },
                    { id: 'upload', label: 'Upload Customer Documents', type: 'boolean' },
                    { id: 'delete', label: 'Delete Customer Documents', type: 'boolean' },
                    { id: 'download', label: 'Download Customer Documents', type: 'boolean' },
                    { id: 'scan', label: 'Scan Customer Documents', type: 'boolean' },
                ],
            },
            { id: 'reminder_tasks', name: 'Reminder Tasks', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'manage', label: 'Manage', type: 'boolean' }] },
            { id: 'follow_up', name: 'Follow-up Dashboard', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'talk', label: 'Talk With Customer', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
        ],
    },
    {
        id: 'crm',
        name: 'CRM',
        submodules: [
            { id: 'customer_master', name: 'Customer Master', actions: [...EXTENDED_ACTIONS, { id: 'import', label: 'Import', type: 'boolean' }] },
            {
                id: 'customer_documents',
                name: 'Customer Documents / KYC',
                actions: [
                    { id: 'view', label: 'View Customer Documents', type: 'boolean' },
                    { id: 'upload', label: 'Upload Customer Documents', type: 'boolean' },
                    { id: 'delete', label: 'Delete Customer Documents', type: 'boolean' },
                    { id: 'download', label: 'Download Customer Documents', type: 'boolean' },
                    { id: 'scan', label: 'Scan Customer Documents', type: 'boolean' },
                ],
            },
            {
                id: 'leads',
                name: 'Inquiry / Lead',
                actions: [
                    { id: 'view', label: 'Lead View Own', type: 'boolean' },
                    { id: 'view_all', label: 'Lead View All', type: 'boolean' },
                    { id: 'add', label: 'Lead Create', type: 'boolean' },
                    { id: 'edit', label: 'Lead Edit Own', type: 'boolean' },
                    { id: 'edit_all', label: 'Lead Edit All', type: 'boolean' },
                    { id: 'delete', label: 'Delete', type: 'boolean' },
                    { id: 'assign', label: 'Lead Assign / Reassign', type: 'boolean' },
                    { id: 'report_view', label: 'Lead Report View Own', type: 'boolean' },
                    { id: 'report_view_all', label: 'Lead Report View All', type: 'boolean' },
                    { id: 'create_task', label: 'Lead Create Task', type: 'boolean' },
                    { id: 'convert_whatsapp', label: 'Convert WhatsApp Chat to Lead', type: 'boolean' },
                    { id: 'share_asset', label: 'Share Catalog / Datasheet', type: 'boolean' },
                ],
            },
            { id: 'product_catalog', name: 'Product Catalog', actions: [...STANDARD_ACTIONS, { id: 'share', label: 'Share to WhatsApp', type: 'boolean' }] },
            { id: 'follow_up', name: 'Follow-up Dashboard', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'talk', label: 'Talk With Customer', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] }
        ]
    },
    {
        id: 'whatsapp',
        name: 'WhatsApp',
        submodules: [
            { id: 'whatsapp_settings', name: 'WhatsApp Settings & Chat', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'edit', label: 'Edit', type: 'boolean' }] },
        ],
    },
    {
        id: 'whatsapp_bulk',
        name: 'WhatsApp Bulk Messaging',
        submodules: [
            { id: 'campaigns', name: 'Bulk Campaigns', actions: [...STANDARD_ACTIONS, { id: 'send', label: 'Send / Control Campaign', type: 'boolean' }, { id: 'export', label: 'Export History', type: 'boolean' }] },
            { id: 'matter_master', name: 'Matter Master', actions: STANDARD_ACTIONS },
            { id: 'blacklist', name: 'Blacklist / Opt-out', actions: STANDARD_ACTIONS },
            { id: 'settings', name: 'Bulk Messaging Settings', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'edit', label: 'Edit', type: 'boolean' }] },
        ],
    },
    {
        id: 'email',
        name: 'Platform Email',
        submodules: [
            { id: 'settings', name: 'Email SMTP Settings', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'edit', label: 'Edit', type: 'boolean' }, { id: 'test', label: 'Test Connection', type: 'boolean' }] },
            { id: 'communication_history', name: 'Communication History', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
        ],
    },
    {
        id: 'email_bulk',
        name: 'Email Bulk Messaging',
        submodules: [
            { id: 'campaigns', name: 'Bulk Campaigns', actions: [...STANDARD_ACTIONS, { id: 'send', label: 'Send / Control Campaign', type: 'boolean' }, { id: 'export', label: 'Export History', type: 'boolean' }] },
            { id: 'templates', name: 'Email Templates', actions: STANDARD_ACTIONS },
            { id: 'blacklist', name: 'Blacklist / Opt-out', actions: STANDARD_ACTIONS },
            { id: 'settings', name: 'Bulk Email Settings', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'edit', label: 'Edit', type: 'boolean' }] },
        ],
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
            {
                id: 'customer_kyc_reports',
                name: 'Customer KYC / Document Reports',
                actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }],
            },
            {
                id: 'supplier_kyc_reports',
                name: 'Supplier KYC / Document Reports',
                actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }],
            },
            { id: 'followup_report', name: 'Follow-up Tracker Report', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'lead_report', name: 'Lead Report', actions: [{ id: 'view', label: 'View Own', type: 'boolean' }, { id: 'view_all', label: 'View All', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
            { id: 'reminder_report', name: 'Open Reminders Report', actions: [{ id: 'view', label: 'View', type: 'boolean' }] }
        ]
    },
    {
        id: 'sales',
        name: 'Sales',
        submodules: [
            { id: 'sales_orders', name: 'Sales Orders', actions: EXTENDED_ACTIONS },
            {
                id: 'sales_invoices',
                name: 'Tax Invoice GST',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'add', label: 'Create', type: 'boolean' },
                    { id: 'edit', label: 'Edit', type: 'boolean' },
                    { id: 'delete', label: 'Sales Invoice Delete', type: 'boolean' },
                    { id: 'print', label: 'Print', type: 'boolean' },
                    { id: 'export', label: 'Export', type: 'boolean' },
                    { id: 'cancel', label: 'Sales Invoice Cancel', type: 'boolean' },
                    { id: 'approve', label: 'Approve', type: 'boolean' },
                    { id: 'whatsapp', label: 'WhatsApp Send', type: 'boolean' },
                    { id: 'email', label: 'Email Send', type: 'boolean' },
                ],
            },
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
            {
                id: 'supplier_documents',
                name: 'Supplier Documents / KYC',
                actions: [
                    { id: 'view', label: 'View Supplier Documents', type: 'boolean' },
                    { id: 'upload', label: 'Upload Supplier Documents', type: 'boolean' },
                    { id: 'delete', label: 'Delete Supplier Documents', type: 'boolean' },
                    { id: 'download', label: 'Download Supplier Documents', type: 'boolean' },
                    { id: 'scan', label: 'Scan Supplier Documents', type: 'boolean' },
                ],
            },
            { id: 'grn', name: 'Goods Receipt (GRN)', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'add', label: 'Add', type: 'boolean' }, { id: 'print', label: 'Print', type: 'boolean' }] },
            { id: 'purchase_rfq', name: 'Purchase RFQ', actions: [...STANDARD_ACTIONS, { id: 'cancel', label: 'Cancel', type: 'boolean' }] },
            { id: 'supplier_quotation', name: 'Supplier Quotation Entry', actions: STANDARD_ACTIONS },
            { id: 'quotation_comparison', name: 'Quotation Comparison', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'edit', label: 'Edit Selection', type: 'boolean' }] },
            { id: 'quotation_approve', name: 'Quotation Approve', actions: [{ id: 'approve', label: 'Approve', type: 'boolean' }] },
            { id: 'convert_rfq_to_po', name: 'Convert RFQ to Purchase Order', actions: [{ id: 'add', label: 'Convert', type: 'boolean' }] },
        ]
    },
    {
        id: 'documents',
        name: 'Documents',
        submodules: [
            { id: 'scan_bills', name: 'Scan Bills', actions: [...STANDARD_ACTIONS, { id: 'scan', label: 'Scan & Attach', type: 'boolean' }] },
            { id: 'missing_attachments', name: 'Missing Attachments Report', actions: [{ id: 'view', label: 'View', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }] },
        ]
    },
    {
        id: 'inventory',
        name: 'Inventory',
        submodules: [
            { id: 'item_master', name: 'Item Master', actions: [...STANDARD_ACTIONS, { id: 'export', label: 'Export', type: 'boolean' }, { id: 'import', label: 'Import', type: 'boolean' }] },
            { id: 'item_images', name: 'Item Images (Textile)', actions: [
                { id: 'view', label: 'View', type: 'boolean' },
                { id: 'upload', label: 'Upload', type: 'boolean' },
                { id: 'delete', label: 'Delete', type: 'boolean' },
                { id: 'download', label: 'Download', type: 'boolean' },
            ] },
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
            { id: 'production_planning', name: 'Production Planning / MRP', actions: [...STANDARD_ACTIONS, { id: 'calculate', label: 'Calculate', type: 'boolean' }, { id: 'approve', label: 'Approve', type: 'boolean' }] },
            { id: 'workflow_production', name: 'Workflow Production', actions: EXTENDED_ACTIONS },
            { id: 'textile_production', name: 'Textile / Handloom Production', actions: EXTENDED_ACTIONS },
            { id: 'textile_job_work_rates', name: 'Textile Job Work Rate Master', actions: EXTENDED_ACTIONS },
            { id: 'textile_conversion', name: 'Textile Conversion & Transformation', actions: EXTENDED_ACTIONS },
            { id: 'textile_dyeing_challan', name: 'Textile Dyeing Challan & Return', actions: EXTENDED_ACTIONS },
            { id: 'textile_process_route', name: 'Textile Process Route Master', actions: EXTENDED_ACTIONS },
            { id: 'textile_production_workflow', name: 'Textile Production Workflow', actions: EXTENDED_ACTIONS }
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
            { id: 'petty_cash', name: 'Petty Cash', actions: [...STANDARD_ACTIONS, { id: 'import', label: 'Import', type: 'boolean' }, { id: 'export', label: 'Export', type: 'boolean' }, { id: 'approve', label: 'Approve Import', type: 'boolean' }] },
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
        id: 'scan_entry',
        name: 'Scan Entry',
        submodules: [
            {
                id: 'scan_entry',
                name: 'Scan Entry / Invoice Import',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'upload', label: 'Upload', type: 'boolean' },
                    { id: 'review', label: 'Review', type: 'boolean' },
                    { id: 'post', label: 'Post', type: 'boolean' },
                    { id: 'reject', label: 'Reject', type: 'boolean' },
                    { id: 'delete', label: 'Delete', type: 'boolean' },
                    { id: 'admin_override_duplicate', label: 'Override Duplicate', type: 'boolean' },
                ],
            },
        ],
    },
    {
        id: 'import_utility',
        name: 'AI Smart Import Utility',
        submodules: [
            {
                id: 'import_utility',
                name: 'Import Utility / Scan Entry',
                actions: [
                    { id: 'view', label: 'View', type: 'boolean' },
                    { id: 'upload', label: 'Upload', type: 'boolean' },
                    { id: 'review', label: 'Review', type: 'boolean' },
                    { id: 'approve_post', label: 'Approve / Post', type: 'boolean' },
                    { id: 'reject', label: 'Reject', type: 'boolean' },
                    { id: 'duplicate_override', label: 'Duplicate Override', type: 'boolean' },
                    { id: 'create_draft_ledger', label: 'Create Draft Ledger', type: 'boolean' },
                    { id: 'approve_ledger', label: 'Approve Ledger', type: 'boolean' },
                    { id: 'create_draft_item', label: 'Create Draft Item', type: 'boolean' },
                    { id: 'map_item', label: 'Map Item', type: 'boolean' },
                    { id: 'delete', label: 'Delete', type: 'boolean' },
                ],
            },
        ],
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
