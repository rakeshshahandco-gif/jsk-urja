import { PATHS } from '../routes/paths';

export const ROLES = {
    SUPERADMIN: 'superadmin',
    ADMIN: 'admin',
    MANAGER: 'manager',
    STAFF: 'staff',
    VIEWER: 'viewer',
};

export const menuConfig = [
    {
        id: 'crm',
        title: 'CRM',
        icon: 'BusinessIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF, ROLES.VIEWER],
        permission: 'customers', // Use customers as base permission for CRM
        children: [
            {
                id: 'crm-customers',
                title: 'Customers',
                icon: 'PeopleIcon',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF, ROLES.VIEWER],
                permission: 'customers',
                children: [
                    {
                        id: 'customer-list',
                        title: 'Customer Master',
                        path: PATHS.CUSTOMERS.LIST,
                        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF, ROLES.VIEWER],
                        permission: 'customers.customer_master.view',
                    },
                    {
                        id: 'reminder-tasks',
                        title: 'Reminder Tasks',
                        path: '/reminders',
                        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                        permission: 'customers.reminder_tasks.view',
                    },
                    {
                        id: 'follow-up-tracker',
                        title: 'Follow-up Dashboard',
                        path: '/followups',
                        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                        permission: 'customers.follow_up.view',
                    },
                ]
            },
            {
                id: 'crm-reports',
                title: 'Reports',
                icon: 'BarChartIcon',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF, ROLES.VIEWER],
                permission: 'reports',
                children: [
                    { id: 'report-customer-master', title: 'Customer Master Report', path: PATHS.REPORTS.CUSTOMER_MASTER, roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'reports.customer_master_report.view' },
                    { id: 'report-sales-marketing', title: 'Sales & Marketing MIS', path: '/mis/sales-marketing', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'mis.sales_marketing.view' },
                    { id: 'report-sales-conversion', title: 'Sales Conversion Analysis', path: '/mis/sales-conversion', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'mis.sales_conversion.view' },
                    { id: 'report-followup-tracker', title: 'Follow-up Tracker Report', path: '/reports/followups', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'reports.followup_report.view' },
                    { id: 'report-followup-dashboard', title: 'Follow-up Dashboard Report', path: '/reports/followup-dashboard', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'reports.followup_dashboard_report.view' },
                    { id: 'report-followup-task', title: 'Follow-up Task Report', path: '/reports/followup-task-report', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'reports.followup_task_report.view' },
                    { id: 'report-conversation-history', title: 'Conversation History', path: '/reports/conversation-history', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'reports.conversation_history_report.view' },
                    { id: 'report-task-reminders', title: 'Task Reminder Report', path: '/reports/task-reminders', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'reports.task_reminder_report.view' },
                    { id: 'report-open-reminders', title: 'Open Reminders', path: '/reports/open-reminders', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF, ROLES.VIEWER], permission: 'reports.reminder_report.view' },
                ]
            }
        ]
    },
    {
        id: 'tasks',
        title: 'Task Management',
        icon: 'AssignmentIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
        permission: 'tasks',
        children: [
            {
                id: 'task-list',
                title: 'Manage Tasks',
                path: '/tasks/list',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                permission: 'tasks.task_list.view',
            },
            {
                id: 'task-groups',
                title: 'Task Groups',
                path: PATHS.TASKS.GROUPS,
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                permission: 'tasks.task_groups.view',
            },
        ],
    },
    {
        id: 'messenger',
        title: 'Messenger',
        icon: '💬',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF, ROLES.VIEWER],
        path: PATHS.MESSENGER.ROOT,
        permission: 'messenger',
    },
    {
        id: 'inventory',

        title: 'Inventory',
        icon: 'InventoryIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
        permission: 'inventory',
        children: [
            {
                id: 'item-master',
                title: 'Item Master',
                path: '/inventory/items',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                permission: 'inventory.item_master.view',
            },
            {
                id: 'item-type-master',
                title: 'Item Types',
                path: '/inventory/item-types',
                roles: [ROLES.ADMIN, ROLES.MANAGER],
                permission: 'inventory.item_types.view',
            },
            {
                id: 'item-group-master',
                title: 'Item Groups',
                path: '/inventory/item-groups',
                roles: [ROLES.ADMIN, ROLES.MANAGER],
                permission: 'inventory.item_groups.view',
            },
            {
                id: 'bom-master',
                title: 'Bill of Materials (BOM)',
                path: PATHS.INVENTORY.BOM.ROOT,
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                permission: 'inventory.bom.view',
            },
            {
                id: 'raw-material-report',
                title: 'Raw Material Stock Report',
                path: '/inventory/stock/raw-material',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                permission: 'inventory.raw_material_report.view',
            },
            {
                id: 'finished-goods-report',
                title: 'Finished Goods Stock Report',
                path: '/inventory/stock/finished-goods',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                permission: 'inventory.finished_goods_report.view',
            },
            {
                id: 'stock-ledger',
                title: 'Stock Movement Ledger',
                path: '/inventory/stock/ledger',
                roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
                permission: 'inventory.stock_ledger.view',
            },
        ],
    },
    {
        id: 'production',
        title: 'Production',
        icon: 'FactoryIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
        permission: 'production',
        children: [
            { id: 'prod-dashboard', title: 'Dashboard', path: PATHS.PRODUCTION.DASHBOARD, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'production.prod_dashboard.view' },
            { id: 'model-conversion', title: 'Model Conversion / Rework', path: '/production/conversion/new', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'production.prod_output.add' },
            { id: 'comp-replacement', title: 'Component Replacement', path: '/production/component-replacements/new', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'production.comp_replacement.add' },
            { id: 'prod-rejection', title: 'Production Rejection', path: '/production/rejections/new', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'production.prod_rejection.add' },
            { id: 'prod-planning', title: 'Production Planning / MRP', path: PATHS.PRODUCTION.PLANNING.ROOT, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'production.production_planning.view' },
        ],
    },
    {
        id: 'purchase',
        title: 'Purchase',
        icon: 'ShoppingCartIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
        permission: 'purchase',
        children: [
            { id: 'suppliers', title: 'Suppliers', path: PATHS.PURCHASE.SUPPLIERS, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'purchase.suppliers.view' },
            { id: 'purchase-orders', title: 'Purchase Orders', path: PATHS.PURCHASE.ORDERS, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'purchase.purchase_orders.view' },
            { id: 'grn', title: 'Goods Receipt (GRN)', path: PATHS.PURCHASE.GRN, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'purchase.grn.view' },
            { id: 'purchase-invoices', title: 'Purchase Invoices', path: PATHS.PURCHASE.INVOICES, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'purchase.purchase_invoices.view' },
        ],
    },
    {
        id: 'sales',
        title: 'Sales',
        icon: 'ShoppingBagIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
        permission: 'sales',
        children: [
            { id: 'sales-orders', title: 'Sales Orders', path: PATHS.SALES.ORDERS, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'sales.sales_orders.view' },
            { id: 'sales-invoices', title: 'Tax Invoices (GST)', path: PATHS.SALES.INVOICES, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'sales.sales_invoices.view' },
            { id: 'eway-bills', title: 'E-Way Bill Tracking', path: PATHS.EWAY_BILL.LIST, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'sales.sales_invoices.view' },
            { id: 'logistics-master', title: 'Logistics & Courier Master', path: PATHS.TRANSPORTERS.LIST, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'sales.sales_invoices.view' },
            { id: 'invoice-series', title: 'Invoice Series', path: PATHS.SALES.INVOICE_SERIES, roles: [ROLES.ADMIN], permission: 'sales.invoice_series.view' },
            { id: 'credit-notes', title: 'Credit Notes', path: PATHS.SALES.CREDIT_NOTES, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'sales.sales_invoices.view' },
            { id: 'debit-notes', title: 'Debit Notes', path: PATHS.SALES.DEBIT_NOTES, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'sales.sales_invoices.view' },

            { id: 'bulk-renumber', title: 'Bulk Renumbering', path: PATHS.SALES.BULK_RENUMBER, roles: [ROLES.ADMIN], permission: 'sales.sales_invoices.view' },
            { id: 'sales-analysis', title: 'Sales MIS Dashboard', path: '/mis/sales-marketing', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'mis.sales_marketing.view' },
        ],
    },
    {
        id: 'service',
        title: 'Service',
        icon: 'SettingsIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
        permission: 'service',
        children: [
            { id: 'complaints', title: 'Customer Complaints', path: PATHS.SERVICE.COMPLAINTS, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'service.complaints.view' },
            { id: 'replacement-dashboard', title: 'Replacement Dashboard', path: PATHS.SERVICE.REPLACEMENT_DASHBOARD, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'service.replacement_dashboard.view' },
        ],
    },
    {
        id: 'prd',
        title: 'Product R&D',
        icon: 'ScienceIcon', // We'll use ScienceIcon or similar mapped in SidebarItem
        roles: [ROLES.ADMIN, 'rd_manager', 'hardware_dev', 'firmware_dev', 'testing_eng', 'qa_head', 'production', 'management_viewer'],
        permission: 'prd',
        children: [
            { id: 'prd-dashboard', title: 'R&D Dashboard', path: PATHS.PRD.DASHBOARD, roles: [ROLES.ADMIN, 'rd_manager', 'hardware_dev', 'firmware_dev', 'testing_eng', 'qa_head', 'production', 'management_viewer'], permission: 'prd.dashboard.view' },
            { id: 'prd-projects', title: 'Product Development Master', path: PATHS.PRD.PROJECTS, roles: [ROLES.ADMIN, 'rd_manager', 'hardware_dev', 'firmware_dev', 'testing_eng', 'qa_head', 'production', 'management_viewer'], permission: 'prd.projects.view' },
            { id: 'prd-parameters', title: 'Test Parameter Master', path: PATHS.PRD.TEST_PARAMETERS, roles: [ROLES.ADMIN, 'rd_manager', 'qa_head'], permission: 'prd.test_parameters.view' },
        ],
    },
    {
        id: 'hr',
        title: 'HR Management',
        icon: 'BadgeIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER],
        permission: 'hr',
        children: [
            { id: 'hr-dashboard', title: 'HR Dashboard', path: '/hr/dashboard', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'hr.hr_dashboard.view' },
            { id: 'employee-master', title: 'Employee Master', path: '/hr/employees', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'hr.employee_master.view' },
            { id: 'shift-master', title: 'Shift Master', path: '/hr/shifts', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'hr.shift_master.view' },
            { id: 'attendance', title: 'Attendance', path: '/hr/attendance', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'hr.attendance.view' },
            { id: 'attendance-import', title: 'Attendance Import', path: '/hr/attendance/import', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'hr.attendance.import' },
            { id: 'leave-management', title: 'Leave Management', path: '/hr/leaves', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'hr.leave_management.view' },
            { id: 'payroll', title: 'Payroll / Salary Working', path: '/hr/payroll', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'hr.payroll.view' },
            { id: 'hr-reports', title: 'HR Reports', path: '/hr/reports', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'hr.hr_reports.view' },
            { id: 'holiday-list', title: '📅 Holiday List', path: '/hr/holidays', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'hr.hr_reports.view' },
        ],
    },
    {
        id: 'voucher-entry',
        title: 'Voucher Entry',
        icon: 'VoucherIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
        permission: 'accounts',
        children: [
            { id: 'receipt-entry', title: 'Receipt Entry', path: PATHS.ACCOUNTS.RECEIPT_ENTRY, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'accounts.receipt_entry.view' },
            { id: 'payment-entry', title: 'Payment Entry', path: PATHS.ACCOUNTS.PAYMENT_ENTRY, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'accounts.payment_entry.view' },
            { id: 'expense-entry', title: 'Expense Voucher', path: PATHS.ACCOUNTS.EXPENSE_ENTRY, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'accounts.expense_entry.view' },
            { id: 'journal-entry', title: 'Journal Voucher', path: PATHS.ACCOUNTS.JOURNAL_ENTRY, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'accounts.journal_entry.view' },
        ]
    },
    {
        id: 'accounts',
        title: 'Accounts',
        icon: 'AccountBalanceWalletIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
        permission: 'accounts',
        children: [
            { id: 'group-master', title: '🗂 Group Master', path: PATHS.ACCOUNTS.GROUP_MASTER, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'accounts.group_master.view' },
            { id: 'ledger-master', title: 'Ledger Master', path: PATHS.ACCOUNTS.LEDGER_MASTER, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'accounts.ledger_master.view' },
            { id: 'financial-year-master', title: '📅 Financial Year Master', path: PATHS.ACCOUNTS.FINANCIAL_YEAR, roles: [ROLES.ADMIN], permission: 'accounts.financial_year.view' },
            { id: 'voucher-type-master', title: '🎫 Series Master', path: PATHS.ACCOUNTS.VOUCHER_TYPE_MASTER, roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'accounts.vouchers.view' },
            { id: 'vouchers', title: 'Voucher Register', path: PATHS.ACCOUNTS.VOUCHER_LIST, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'accounts.vouchers.view' },
            { id: 'ledger-report', title: 'Ledger Report', path: PATHS.ACCOUNTS.LEDGER_REPORT, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF, ROLES.VIEWER], permission: 'accounts.ledger_report.view' },
            { id: 'sales-register', title: 'Sales Register', path: PATHS.ACCOUNTS.SALES_REGISTER, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'accounts.sales_register.view' },
            { id: 'purchase-register', title: 'Purchase Register', path: PATHS.ACCOUNTS.PURCHASE_REGISTER, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'accounts.purchase_register.view' },
            { id: 'expense-register', title: 'Expense Register', path: PATHS.ACCOUNTS.EXPENSE_REGISTER, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'accounts.vouchers.view' },
            { id: 'day-book', title: 'Day Book', path: PATHS.ACCOUNTS.DAY_BOOK, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'accounts.day_book.view' },
            { id: 'cash-book', title: 'Cash Book', path: PATHS.ACCOUNTS.CASH_BOOK, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'accounts.cash_book.view' },
            { id: 'bank-book', title: 'Bank Book', path: PATHS.ACCOUNTS.BANK_BOOK, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'accounts.bank_book.view' },
            { id: 'outstanding', title: 'Outstanding Report', path: PATHS.ACCOUNTS.OUTSTANDING_REPORT, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF, ROLES.VIEWER], permission: 'accounts.outstanding.view' },
        ]
    },
    {
        id: 'mis-reports',
        title: 'MIS Reports',
        icon: 'AssessmentIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER],
        permission: 'mis',
        children: [
            { id: 'mis-dashboard', title: '📊 MIS Dashboard', path: '/mis/dashboard', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'mis.dashboard.view' },
            { id: 'trial-balance-mis', title: '📋 Trial Balance', path: '/mis/reports/trial-balance', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'mis.trial_balance.view' },
            { id: 'profit-loss-mis', title: '📈 Profit & Loss A/c', path: '/mis/reports/profit-loss', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'mis.profit_loss.view' },
            { id: 'balance-sheet-mis', title: '⚖️ Balance Sheet', path: '/mis/reports/balance-sheet', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'mis.balance_sheet.view' },
            { id: 'gstr1-export', title: '📄 GSTR-1 Compliance', path: '/reports/gstr1', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'admin.company_profile.view' },
            { id: 'gstr3b-compliance', title: '📊 GSTR-3B Compliance', path: '/reports/gstr3b', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'admin.company_profile.view' },
        ]
    },
    {
        id: 'fixed-assets-parent',
        title: 'Fixed Assets',
        icon: 'AccountBalanceIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
        permission: 'accounts',
        children: [
            { id: 'fixed-assets-list', title: '🧾 Asset Register', path: PATHS.ACCOUNTS.FIXED_ASSETS, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'accounts.fixed_assets.view' },
            { id: 'asset-categories', title: '📂 Asset Categories', path: PATHS.ACCOUNTS.ASSET_CATEGORIES, roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'accounts.asset_categories.view' },
            { id: 'asset-locations', title: '📍 Asset Locations', path: PATHS.ACCOUNTS.ASSET_LOCATIONS, roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'accounts.asset_locations.view' },
        ]
    },
    {
        id: 'reports-parent',
        title: 'Reports',
        icon: 'BarChartIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER],
        permission: 'reports',
        children: [
            { id: 'report-purchase-comparison', title: 'Purchase Comparison Report', path: '/reports/purchase-comparison', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'reports.purchase_comparison_report.view' },
        ],
    },
    {
        id: 'rd-samples',
        title: 'R&D Samples',
        icon: 'ScienceIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER],
        permission: 'rd_samples',
        children: [
            { id: 'rd-projects', title: 'R&D Projects', path: '/rd-samples/projects', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'rd_samples.projects.view' },
            { id: 'rd-sample-list', title: 'Sample Tracker', path: '/rd-samples/samples', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'rd_samples.samples.view' },
            { id: 'rd-comparison', title: 'Sample Comparison', path: '/rd-samples/comparison', roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'rd_samples.samples.compare' },
        ],
    },
    {
        id: 'china-supplier',
        title: 'China Sourcing',
        icon: 'GlobeIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
        permission: 'wechat',
        children: [
            { id: 'cs-dashboard', title: 'Dashboard', path: PATHS.CHINA_SUPPLIER.DASHBOARD, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'wechat.contacts.view' },
            { id: 'cs-products', title: 'Products (R&D)', path: PATHS.CHINA_SUPPLIER.PRODUCTS, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'wechat.contacts.view' },
            { id: 'cs-contacts', title: 'Supplier Contacts', path: PATHS.CHINA_SUPPLIER.CONTACTS, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'wechat.contacts.view' },
            { id: 'cs-groups', title: 'WeChat Groups', path: PATHS.CHINA_SUPPLIER.GROUPS, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'wechat.contacts.view' },
            { id: 'cs-prices', title: 'Price Comparison', path: PATHS.CHINA_SUPPLIER.PRICES, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'wechat.contacts.view' },
            { id: 'cs-samples', title: 'Samples Tracking', path: PATHS.CHINA_SUPPLIER.SAMPLES, roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF], permission: 'wechat.contacts.view' },
            { id: 'cs-reports', title: 'Reports', path: PATHS.CHINA_SUPPLIER.REPORTS, roles: [ROLES.ADMIN, ROLES.MANAGER], permission: 'reports' },
        ],
    },
    {
        id: 'whatsapp',
        title: '💬 WhatsApp',
        icon: 'ChatIcon',
        roles: [ROLES.ADMIN, ROLES.MANAGER],
        path: PATHS.SETTINGS.WHATSAPP,
        permission: 'whatsapp.whatsapp_settings.view',
    },
    {
        id: 'admin',
        title: 'Admin',
        icon: 'SettingsIcon',
        roles: [ROLES.ADMIN],
        permission: 'admin',
        children: [
            { id: 'company-profile', title: 'Company Profile', path: PATHS.SETTINGS.COMPANY_PROFILE, roles: [ROLES.ADMIN], permission: 'admin.company_profile.view' },
            { id: 'user-management', title: 'User Management', path: '/admin/users', roles: [ROLES.ADMIN], permission: 'admin.user_management.view' },
            { id: 'system-diagnostic', title: 'System Master Diagnostic', path: '/admin/diagnostics', roles: [ROLES.ADMIN], permission: 'admin' },
            { id: 'backup-restore', title: 'Backup & Restore', path: '/admin/backups', roles: [ROLES.ADMIN], permission: 'admin' },
        ],
    },
];


