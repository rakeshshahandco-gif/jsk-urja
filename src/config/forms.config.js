import { PATHS } from '../routes/paths';

export const ALL_FORMS = [
    // Account Master
    { id: 'group-master', title: 'Group Master', path: PATHS.ACCOUNT_MASTER.GROUP_MASTER, icon: 'account-master', permission: 'accounts.group_master.view', module: 'Account Master' },
    { id: 'ledger-master', title: 'Ledger Master', path: PATHS.ACCOUNT_MASTER.LEDGER_MASTER, icon: 'account-master', permission: 'accounts.ledger_master.view', module: 'Account Master' },
    { id: 'financial-year-master', title: 'Financial Year Master', path: PATHS.ACCOUNT_MASTER.FINANCIAL_YEAR, icon: 'account-master', permission: 'accounts.financial_year.view', module: 'Account Master' },
    { id: 'series-master', title: 'Series Master', path: PATHS.ACCOUNT_MASTER.SERIES_MASTER, icon: 'account-master', permission: 'accounts.vouchers.view', module: 'Account Master' },

    // CRM
    { id: 'customer-master', title: 'Customer Master', path: PATHS.CUSTOMERS.LIST, icon: 'crm', permission: 'customers.customer_master.view', module: 'CRM' },
    { id: 'lead-inquiry', title: 'Lead / Inquiry', path: '/crm/leads', icon: 'crm', permission: 'customers', module: 'CRM' },
    { id: 'follow-up', title: 'Follow-up Tracker', path: '/followups', icon: 'tasks', permission: 'customers.follow_up.view', module: 'CRM' },
    { id: 'reminders', title: 'Reminder / Follow-up', path: '/reminders', icon: 'tasks', permission: 'customers.reminder_tasks.view', module: 'CRM' },
    { id: 'distributors', title: 'Distributor Master', path: '/distributors', icon: 'crm', permission: 'sales.sales_invoices.view', module: 'CRM' },
    { id: 'report-customer-master', title: 'Customer Master Report', path: PATHS.REPORTS.CUSTOMER_MASTER, icon: 'report', permission: 'reports.customer_master_report.view', module: 'CRM' },
    { id: 'report-followups', title: 'Follow-up Tracker Report', path: '/reports/followups', icon: 'report', permission: 'reports.followup_report.view', module: 'CRM' },
    { id: 'report-followup-dashboard', title: 'Follow-up Dashboard', path: '/reports/followup-dashboard', icon: 'report', permission: 'reports.followup_report.view', module: 'CRM' },
    { id: 'report-followup-tasks', title: 'Follow-up Task Report', path: '/reports/followup-task-report', icon: 'report', permission: 'reports.followup_report.view', module: 'CRM' },
    { id: 'report-reminders', title: 'Open Reminders Report', path: '/reports/open-reminders', icon: 'report', permission: 'reports.reminder_report.view', module: 'CRM' },
    { id: 'report-conversations', title: 'Conversation History', path: '/reports/conversation-history', icon: 'report', permission: 'reports', module: 'CRM' },
    { id: 'report-task-reminders', title: 'Task Reminders Report', path: '/reports/task-reminders', icon: 'report', permission: 'tasks', module: 'CRM' },
    { id: 'mis-sales-marketing', title: 'Sales & Marketing MIS', path: PATHS.MIS.SALES_DASHBOARD, icon: 'mis', permission: 'mis.sales_marketing.view', module: 'CRM' },
    { id: 'mis-sales-conversion', title: 'Sales Conversion Analysis', path: '/mis/sales-conversion', icon: 'mis', permission: 'mis.sales_conversion.view', module: 'CRM' },
    { id: 'report-incentive', title: 'Sales Incentive Report', path: '/reports/incentive', icon: 'mis', permission: 'sales', module: 'CRM' },

    // Sales
    { id: 'sales-order', title: 'Sales Order', path: PATHS.SALES.ORDERS, icon: 'sales', permission: 'sales.sales_orders.view', module: 'Sales' },
    { id: 'sales-invoice', title: 'Tax Invoice (GST)', path: PATHS.SALES.INVOICES, icon: 'sales', permission: 'sales.sales_invoices.view', module: 'Sales' },
    { id: 'estimate', title: 'Estimate / Internal Sale', path: PATHS.SALES.ESTIMATES, icon: 'sales', permission: 'sales.sales_invoices.view', module: 'Sales' },
    { id: 'eway-bill', title: 'E-Way Bill Tracking', path: PATHS.EWAY_BILL.LIST, icon: 'sales', permission: 'sales.sales_invoices.view', module: 'Sales' },
    { id: 'e-invoice', title: 'E-Invoice / IRN Tracking', path: PATHS.E_INVOICE.LIST, icon: 'sales', permission: 'sales.sales_invoices.view', module: 'Sales' },
    { id: 'logistics', title: 'Logistics & Courier Master', path: PATHS.TRANSPORTERS.LIST, icon: 'sales', permission: 'sales.sales_invoices.view', module: 'Sales' },
    { id: 'invoice-series', title: 'Invoice Series', path: PATHS.SALES.INVOICE_SERIES, icon: 'settings', permission: 'sales.invoice_series.view', module: 'Sales' },
    { id: 'bulk-renumber', title: 'Bulk Renumbering', path: PATHS.SALES.BULK_RENUMBER, icon: 'settings', permission: 'admin', module: 'Sales' },

    // Purchase
    { id: 'purchase-rfq', title: 'Purchase RFQ', path: PATHS.PURCHASE.RFQ, icon: 'purchase', permission: 'purchase.purchase_rfq.view', module: 'Purchase' },
    { id: 'supplier-quotations', title: 'Supplier Quotations', path: PATHS.PURCHASE.SUPPLIER_QUOTATIONS, icon: 'purchase', permission: 'purchase.supplier_quotation.view', module: 'Purchase' },
    { id: 'purchase-order', title: 'Purchase Order', path: PATHS.PURCHASE.ORDERS, icon: 'purchase', permission: 'purchase.purchase_orders.view', module: 'Purchase' },
    { id: 'purchase-invoice', title: 'Purchase Invoice', path: PATHS.PURCHASE.INVOICES, icon: 'purchase', permission: 'purchase.purchase_invoices.view', module: 'Purchase' },
    { id: 'supplier-master', title: 'Supplier Master', path: PATHS.PURCHASE.SUPPLIERS, icon: 'supplier', permission: 'purchase', module: 'Purchase' },
    { id: 'grn', title: 'Goods Receipt (GRN)', path: PATHS.PURCHASE.GRN, icon: 'purchase', permission: 'purchase.grn.view', module: 'Purchase' },

    // Inventory
    { id: 'item-master', title: 'Item Master', path: '/inventory/items', icon: 'inventory', permission: 'inventory.item_master.view', module: 'Inventory' },
    { id: 'item-group-master', title: 'Item Groups', path: '/inventory/item-groups', icon: 'inventory', permission: 'inventory.item_groups.view', module: 'Inventory' },
    { id: 'item-type-master', title: 'Item Types', path: '/inventory/item-types', icon: 'inventory', permission: 'inventory.item_types.view', module: 'Inventory' },
    { id: 'bom', title: 'Bill of Materials (BOM)', path: PATHS.INVENTORY.BOM.ROOT, icon: 'inventory', permission: 'inventory.bom.view', module: 'Inventory' },
    { id: 'raw-material-report', title: 'Raw Material Stock Report', path: '/inventory/stock/raw-material', icon: 'inventory', permission: 'inventory.raw_material_report.view', module: 'Inventory' },
    { id: 'finished-goods-report', title: 'Finished Goods Stock Report', path: '/inventory/stock/finished-goods', icon: 'inventory', permission: 'inventory.finished_goods_report.view', module: 'Inventory' },
    { id: 'stock-ledger', title: 'Stock Movement Ledger', path: '/inventory/stock/ledger', icon: 'inventory', permission: 'inventory.stock_ledger.view', module: 'Inventory' },

    // Production
    { id: 'work-order', title: 'Work Order', path: PATHS.PRODUCTION.WORK_ORDERS, icon: 'production', permission: 'production.production_planning.view', module: 'Production' },
    { id: 'production-entry', title: 'Production Entry', path: '/production/output/new', icon: 'production', permission: 'production.prod_output.add', module: 'Production' },
    { id: 'bom-consumption', title: 'BOM Consumption', path: '/production/consumption', icon: 'production', permission: 'production.prod_output.add', module: 'Production' },
    { id: 'finished-goods-inward', title: 'Finished Goods Inward', path: '/production/inward', icon: 'production', permission: 'production.prod_output.add', module: 'Production' },
    { id: 'qc-testing', title: 'QC / Testing', path: '/production/qc', icon: 'security', permission: 'production.prod_output.add', module: 'Production' },

    // Voucher Entry
    { id: 'receipt-voucher', title: 'Receipt Voucher', path: PATHS.ACCOUNTS.RECEIPT_ENTRY, icon: 'receipt', permission: 'accounts.receipt_entry.view', module: 'Voucher Entry' },
    { id: 'payment-voucher', title: 'Payment Voucher', path: PATHS.ACCOUNTS.PAYMENT_ENTRY, icon: 'receipt', permission: 'accounts.payment_entry.view', module: 'Voucher Entry' },
    { id: 'journal-voucher', title: 'Journal Voucher', path: PATHS.ACCOUNTS.JOURNAL_ENTRY, icon: 'receipt', permission: 'accounts.journal_entry.view', module: 'Voucher Entry' },
    { id: 'contra-voucher', title: 'Contra Voucher', path: PATHS.ACCOUNTS.CONTRA_ENTRY, icon: 'receipt', permission: 'accounts.vouchers.view', module: 'Voucher Entry' },
    { id: 'expense-voucher', title: 'Expense Voucher', path: PATHS.ACCOUNTS.EXPENSE_ENTRY, icon: 'receipt', permission: 'accounts.expense_entry.view', module: 'Voucher Entry' },
    { id: 'debit-note', title: 'Debit Note', path: PATHS.ACCOUNTS.DEBIT_NOTES, icon: 'credit', permission: 'accounts.debit_notes.view', module: 'Voucher Entry' },
    { id: 'credit-note', title: 'Credit Note', path: PATHS.ACCOUNTS.CREDIT_NOTES, icon: 'credit', permission: 'accounts.credit_notes.view', module: 'Voucher Entry' },
    { id: 'bill-wise-adjustment', title: 'Bill-wise Adjustment', path: PATHS.ACCOUNTS.BILL_WISE_ADJUSTMENT, icon: 'receipt', permission: 'accounts.vouchers.view', module: 'Voucher Entry' },
    { id: 'bank-reconciliation', title: 'Bank Reconciliation', path: PATHS.ACCOUNTS.BANK_RECONCILIATION, icon: 'accounts', permission: 'accounts.vouchers.view', module: 'Voucher Entry' },
    { id: 'pdc-register', title: 'PDC Register', path: PATHS.PDC.LIST, icon: 'time', permission: 'accounts.vouchers.view', module: 'Voucher Entry' },
    { id: 'narration-templates', title: 'Narration Templates', path: PATHS.NARRATION_TEMPLATES, icon: 'voucher', permission: 'accounts.vouchers.view', module: 'Voucher Entry' },

    // Accounts
    { id: 'voucher-register', title: 'Voucher Register', path: PATHS.ACCOUNTS.VOUCHER_LIST, icon: 'accounts', permission: 'accounts.vouchers.view', module: 'Accounts' },
    { id: 'ledger-report', title: 'Ledger Report', path: PATHS.ACCOUNTS.LEDGER_REPORT, icon: 'accounts', permission: 'accounts.ledger_report.view', module: 'Accounts' },
    { id: 'sales-register', title: 'Sales Register', path: PATHS.ACCOUNTS.SALES_REGISTER, icon: 'accounts', permission: 'accounts.sales_register.view', module: 'Accounts' },
    { id: 'purchase-register', title: 'Purchase Register', path: PATHS.ACCOUNTS.PURCHASE_REGISTER, icon: 'accounts', permission: 'accounts.purchase_register.view', module: 'Accounts' },
    { id: 'expense-register', title: 'Expense Register', path: PATHS.ACCOUNTS.EXPENSE_REGISTER, icon: 'accounts', permission: 'accounts.vouchers.view', module: 'Accounts' },
    { id: 'day-book', title: 'Day Book', path: PATHS.ACCOUNTS.DAY_BOOK, icon: 'accounts', permission: 'accounts.day_book.view', module: 'Accounts' },
    { id: 'cash-book', title: 'Cash Book', path: PATHS.ACCOUNTS.CASH_BOOK, icon: 'accounts', permission: 'accounts.cash_book.view', module: 'Accounts' },
    { id: 'bank-book', title: 'Bank Book', path: PATHS.ACCOUNTS.BANK_BOOK, icon: 'accounts', permission: 'accounts.bank_book.view', module: 'Accounts' },
    { id: 'bank-reconciliation-report', title: 'Bank Reconciliation', path: PATHS.ACCOUNTS.BANK_RECONCILIATION, icon: 'accounts', permission: 'accounts.vouchers.view', module: 'Accounts' },
    { id: 'outstanding-report', title: 'Outstanding Report', path: PATHS.ACCOUNTS.OUTSTANDING_REPORT, icon: 'accounts', permission: 'accounts.outstanding.view', module: 'Accounts' },
    { id: 'trial-balance', title: 'Trial Balance', path: '/mis/reports/trial-balance', icon: 'accounts', permission: 'mis.trial_balance.view', module: 'Accounts' },
    { id: 'profit-loss', title: 'Profit & Loss', path: '/mis/reports/profit-loss', icon: 'accounts', permission: 'mis.profit_loss.view', module: 'Accounts' },
    { id: 'balance-sheet', title: 'Balance Sheet', path: '/mis/reports/balance-sheet', icon: 'accounts', permission: 'mis.balance_sheet.view', module: 'Accounts' },
    { id: 'interest-payable-statement', title: 'Interest Payable Statement', path: PATHS.ACCOUNTS.INTEREST_PAYABLE, icon: 'accounts', permission: 'accounts.interest_payable_statement.view', module: 'Accounts' },
    { id: 'cash-flow-statement', title: 'Cash Flow Statement', path: PATHS.CASH_FLOW, icon: 'chart', permission: 'accounts.vouchers.view', module: 'Accounts' },
    { id: 'comparative-pl', title: 'Comparative P&L', path: PATHS.COMPARATIVE_PL, icon: 'chart', permission: 'accounts.vouchers.view', module: 'Accounts' },
    { id: 'comparative-bs', title: 'Comparative Balance Sheet', path: PATHS.COMPARATIVE_BS, icon: 'chart', permission: 'accounts.vouchers.view', module: 'Accounts' },
    { id: 'ageing-analysis', title: 'Ageing Analysis', path: PATHS.AGEING, icon: 'time', permission: 'accounts.vouchers.view', module: 'Accounts' },
    { id: 'msme-report', title: 'MSME Compliance Report', path: PATHS.MSME_REPORT, icon: 'security', permission: 'accounts.vouchers.view', module: 'Accounts' },
    { id: 'ratio-analysis', title: 'Ratio Analysis', path: PATHS.RATIO_ANALYSIS, icon: 'analytics', permission: 'accounts.vouchers.view', module: 'Accounts' },
    { id: 'fund-flow-statement', title: 'Fund Flow Statement', path: PATHS.FUND_FLOW, icon: 'chart', permission: 'accounts.vouchers.view', module: 'Accounts' },
    { id: 'cost-centre-pl', title: 'Cost Centre P&L', path: PATHS.COST_CENTERS.PL_REPORT, icon: 'chart', permission: 'accounts.vouchers.view', module: 'Accounts' },
    { id: 'accounting-audit-trail', title: 'Accounting Audit Trail', path: PATHS.ACCOUNTS.ACCOUNTING_AUDIT, icon: 'security', permission: 'accounts.vouchers.view', module: 'Accounts' },
    { id: 'period-lock-settings', title: 'Period Lock Settings', path: PATHS.ACCOUNTS.PERIOD_LOCK, icon: 'security', permission: 'accounts.vouchers.view', module: 'Accounts' },

    // Account Master (new additions)
    { id: 'cost-centres', title: 'Cost / Profit Centres', path: PATHS.COST_CENTERS.LIST, icon: 'account-master', permission: 'accounts.vouchers.view', module: 'Account Master' },
    { id: 'budget-master', title: 'Budget Master', path: PATHS.BUDGETS.LIST, icon: 'chart', permission: 'accounts.vouchers.view', module: 'Account Master' },

    // TDS
    { id: 'tds-compliance', title: 'TDS Dashboard', path: PATHS.TDS.DASHBOARD, icon: 'accounts', permission: 'tds.dashboard.view', module: 'TDS' },
    { id: 'tds-master', title: 'TDS Master / Sections', path: PATHS.TDS.MASTER, icon: 'settings', permission: 'tds.master.view', module: 'TDS' },
    { id: 'tds-deductions', title: 'TDS Deduction Register', path: PATHS.TDS.DEDUCTIONS, icon: 'receipt', permission: 'tds.deduction_register.view', module: 'TDS' },
    { id: 'tds-payable-register', title: 'TDS Payable Register', path: PATHS.TDS.PAYABLE_REGISTER, icon: 'receipt', permission: 'tds.payable_register.view', module: 'TDS' },
    { id: 'tds-challans', title: 'TDS Challan / Payment', path: PATHS.TDS.CHALLANS, icon: 'credit', permission: 'tds.challan.view', module: 'TDS' },
    { id: 'tds-returns', title: 'TDS Return / Filing', path: PATHS.TDS.RETURNS, icon: 'report', permission: 'tds.returns.view', module: 'TDS' },
    { id: 'tds-reports', title: 'TDS Reports', path: PATHS.TDS.REPORTS, icon: 'report', permission: 'tds.reports.view', module: 'TDS' },
    { id: 'form-26as', title: '26AS Reconciliation', path: PATHS.FORM_26AS.LIST, icon: 'security', permission: 'tds.reports.view', module: 'TDS' },

    // TCS (Tax Collected at Source)
    { id: 'tcs-dashboard', title: 'TCS Dashboard', path: PATHS.TCS.DASHBOARD, icon: 'accounts', permission: 'tds.dashboard.view', module: 'TCS' },
    { id: 'tcs-master', title: 'TCS Section Rates', path: PATHS.TCS.MASTER, icon: 'settings', permission: 'tds.master.view', module: 'TCS' },
    { id: 'tcs-deductions', title: 'TCS Deduction Register', path: PATHS.TCS.DEDUCTIONS, icon: 'receipt', permission: 'tds.deduction_register.view', module: 'TCS' },
    { id: 'tcs-challans', title: 'TCS Challan / Payment', path: PATHS.TCS.CHALLANS, icon: 'credit', permission: 'tds.challan.view', module: 'TCS' },
    { id: 'tcs-reports', title: 'TCS Reports', path: PATHS.TCS.REPORTS, icon: 'report', permission: 'tds.reports.view', module: 'TCS' },

    // Fixed Assets
    { id: 'fixed-assets-list', title: 'Asset Register', path: '/fixed-assets/list', icon: 'accounts', permission: 'accounts.fixed_assets.view', module: 'Fixed Assets' },
    { id: 'asset-categories', title: 'Asset Categories', path: '/fixed-assets/categories', icon: 'settings', permission: 'accounts.asset_categories.view', module: 'Fixed Assets' },
    { id: 'asset-locations', title: 'Asset Locations', path: '/fixed-assets/locations', icon: 'settings', permission: 'accounts.asset_locations.view', module: 'Fixed Assets' },
    { id: 'depreciation', title: 'Depreciation', path: PATHS.DEPRECIATION.ROOT, icon: 'accounts', permission: 'accounts.fixed_assets.view', module: 'Fixed Assets' },
    { id: 'depreciation-schedule', title: 'Depreciation Schedule', path: PATHS.DEPRECIATION.SCHEDULE, icon: 'chart', permission: 'accounts.fixed_assets.view', module: 'Fixed Assets' },

    // GST (all screens under /gst/* — module home + sidebar GST menu)
    { id: 'gstr1', title: 'GSTR-1 Compliance', path: PATHS.GST.GSTR1, icon: 'gst', permission: 'gst.gstr1.view', module: 'GST' },
    { id: 'gstr3b', title: 'GSTR-3B Compliance', path: PATHS.GST.GSTR3B, icon: 'gst', permission: 'gst.gstr3b.view', module: 'GST' },
    { id: 'gstr9', title: 'GSTR-9 Annual Return', path: PATHS.GST.GSTR9, icon: 'gst', permission: 'gst.gstr3b.view', module: 'GST' },
    { id: 'gst-recon', title: '2A / 2B Reconciliation', path: PATHS.GST.RECONCILIATION, icon: 'gst', permission: 'gst.gst_reconciliation.view', module: 'GST' },
    { id: 'gst-payable', title: 'GST Payable Summary', path: PATHS.GST.PAYABLE, icon: 'gst', permission: 'gst.gst_payable.view', module: 'GST' },
    { id: 'itc-register', title: 'ITC Register', path: PATHS.GST.ITC_REGISTER, icon: 'gst', permission: 'gst.itc_register.view', module: 'GST' },
    { id: 'hsn-summary', title: 'HSN Summary', path: PATHS.GST.HSN_SUMMARY, icon: 'gst', permission: 'gst.hsn_summary.view', module: 'GST' },
    { id: 'gst-ledger', title: 'GST Ledger', path: PATHS.GST.LEDGER, icon: 'gst', permission: 'gst.gst_ledger.view', module: 'GST' },

    // MIS Reports
    { id: 'sales-mis', title: 'Sales MIS Dashboard', path: PATHS.MIS.SALES_DASHBOARD, icon: 'mis', permission: 'mis.sales_marketing.view', module: 'MIS Reports' },
    { id: 'product-gp', title: 'Product-wise GP Analysis', path: PATHS.MIS.PRODUCT_GP, icon: 'mis', permission: 'mis.product_gp_analysis.view', module: 'MIS Reports' },
    { id: 'sales-conversion-analysis', title: 'Sales Conversion Analysis Dashboard', path: '/mis/sales-conversion', icon: 'mis', permission: 'mis.sales_conversion.view', module: 'MIS Reports' },
    { id: 'customer-gp', title: 'Customer-wise GP Analysis', path: '/mis/reports/customer-gp', icon: 'mis', permission: 'mis.product_gp_analysis.view', module: 'MIS Reports' },
    { id: 'stock-ageing-mis', title: 'Stock Ageing Report', path: '/inventory/stock/ageing', icon: 'inventory', permission: 'inventory.stock_ledger.view', module: 'MIS Reports' },
    { id: 'sample-conversion', title: 'Sample Conversion Tracking', path: PATHS.REPORTS.SAMPLE_CONVERSION, icon: 'mis', permission: 'reports', module: 'MIS Reports' },
    { id: 'replacement-cost', title: 'Replacement Cost Report', path: '/reports/replacement-cost', icon: 'mis', permission: 'reports', module: 'MIS Reports' },
    { id: 'consumable-cost', title: 'Consumable Cost Report', path: '/reports/consumable-cost', icon: 'mis', permission: 'reports', module: 'MIS Reports' },

    // Service
    { id: 'complaints', title: 'Customer Complaints', path: '/service/complaints', icon: 'settings', permission: 'service.complaints.view', module: 'Service' },
    { id: 'replacement-dashboard', title: 'Replacement Dashboard', path: '/service/replacement-dashboard', icon: 'mis', permission: 'service.replacement_dashboard.view', module: 'Service' },

    // Product R&D
    { id: 'prd-dashboard', title: 'R&D Dashboard', path: '/prd/dashboard', icon: 'inventory', permission: 'prd.dashboard.view', module: 'Product R&D' },
    { id: 'prd-projects', title: 'Product Development Master', path: '/prd/projects', icon: 'inventory', permission: 'prd.projects.view', module: 'Product R&D' },
    { id: 'prd-parameters', title: 'Test Parameter Master', path: '/prd/test-parameters', icon: 'settings', permission: 'prd.test_parameters.view', module: 'Product R&D' },

    // R&D Samples
    { id: 'rd-projects-samples', title: 'R&D Projects', path: '/rd-samples/projects', icon: 'inventory', permission: 'rd_samples.projects.view', module: 'R&D Samples' },
    { id: 'rd-sample-list', title: 'Sample Tracker', path: '/rd-samples/samples', icon: 'tasks', permission: 'rd_samples.samples.view', module: 'R&D Samples' },
    { id: 'rd-comparison', title: 'Sample Comparison', path: '/rd-samples/comparison', icon: 'mis', permission: 'rd_samples.samples.compare', module: 'R&D Samples' },

    // China Sourcing
    { id: 'china-dashboard', title: 'Dashboard', path: PATHS.CHINA_SUPPLIER.DASHBOARD, icon: 'mis', permission: 'reports', module: 'China Sourcing' },
    { id: 'china-products', title: 'Products (R&D)', path: PATHS.CHINA_SUPPLIER.PRODUCTS, icon: 'inventory', permission: 'reports', module: 'China Sourcing' },
    { id: 'china-contacts', title: 'Supplier Contacts', path: PATHS.CHINA_SUPPLIER.CONTACTS, icon: 'supplier', permission: 'reports', module: 'China Sourcing' },
    { id: 'china-groups', title: 'WeChat Groups', path: PATHS.CHINA_SUPPLIER.GROUPS, icon: 'messenger', permission: 'reports', module: 'China Sourcing' },
    { id: 'china-prices', title: 'Price Comparison', path: PATHS.CHINA_SUPPLIER.PRICES, icon: 'chart', permission: 'reports', module: 'China Sourcing' },
    { id: 'china-samples', title: 'Samples Tracking', path: PATHS.CHINA_SUPPLIER.SAMPLES, icon: 'time', permission: 'reports', module: 'China Sourcing' },
    { id: 'china-reports', title: 'Reports', path: PATHS.CHINA_SUPPLIER.REPORTS, icon: 'report', permission: 'reports', module: 'China Sourcing' },

    // HR Management
    { id: 'hr-dashboard', title: 'HR Dashboard', path: '/hr/dashboard', icon: 'mis', permission: 'hr.hr_dashboard.view', module: 'HR Management' },
    { id: 'employee-master', title: 'Employee Master', path: '/hr/employees', icon: 'crm', permission: 'hr.employee_master.view', module: 'HR Management' },
    { id: 'shift-master', title: 'Shift Master', path: '/hr/shifts', icon: 'settings', permission: 'hr.shift_master.view', module: 'HR Management' },
    { id: 'attendance', title: 'Attendance', path: '/hr/attendance', icon: 'tasks', permission: 'hr.attendance.view', module: 'HR Management' },
    { id: 'payroll', title: 'Payroll / Salary Working', path: '/hr/payroll', icon: 'accounts', permission: 'hr.payroll.view', module: 'HR Management' },
    { id: 'holiday-list', title: 'Holiday List', path: '/hr/holidays', icon: 'settings', permission: 'hr.hr_reports.view', module: 'HR Management' },

    // Task Management
    { id: 'manage-tasks', title: 'Task Hub', path: '/tasks/list', icon: 'tasks', permission: 'tasks.task_list.view', module: 'Task Management' },
    { id: 'task-groups', title: 'Task Groups', path: '/tasks/groups', icon: 'tasks', permission: 'tasks.task_groups.view', module: 'Task Management' },
    { id: 'messenger', title: 'Messenger', path: '/messenger', icon: 'messenger', permission: 'tasks', module: 'Task Management' },

    // WhatsApp
    { id: 'whatsapp-settings', title: 'WhatsApp Settings', path: '/whatsapp', icon: 'messenger', permission: 'whatsapp.whatsapp_settings.view', module: 'WhatsApp' },

    // Admin
    { id: 'company-profile', title: 'Company Profile', path: '/company-profile', icon: 'settings', permission: 'admin.company_profile.view', module: 'Admin' },
    { id: 'feature-compliance-settings', title: 'Feature / Compliance Settings', path: PATHS.SETTINGS.FEATURE_COMPLIANCE, icon: 'settings', permission: 'admin', module: 'Admin' },
    { id: 'platform-feature-defaults', title: 'Platform Default Settings', path: PATHS.SETTINGS.PLATFORM_FEATURE_DEFAULTS, icon: 'settings', permission: 'admin', module: 'Admin' },
    { id: 'user-management', title: 'User Management', path: '/admin/users', icon: 'crm', permission: 'admin.user_management.view', module: 'Admin' },
    { id: 'security-control', title: 'Security & Control', path: '/admin/security', icon: 'security', permission: 'admin.security_control.view', module: 'Admin' },
    { id: 'ledger-linking', title: 'Ledger Linking Utility', path: '/admin/ledger-linking', icon: 'settings', permission: 'admin.ledger_linking.view', module: 'Admin' },
    { id: 'system-diagnostic', title: 'System Master Diagnostic', path: '/admin/diagnostics', icon: 'settings', permission: 'admin', module: 'Admin' },
    { id: 'backup-restore', title: 'Backup & Restore', path: '/admin/backups', icon: 'settings', permission: 'admin', module: 'Admin' },
];
