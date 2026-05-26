/**
 * Maps sidebar menu item ids to company feature setting paths.
 * When disabled, menu item is hidden (settings page id is always shown to admins).
 */
export const MENU_FEATURE_BY_ID = {
    'sales-invoices': 'sales.enableSalesInvoice',
    'sales-orders': 'sales.enableSalesOrder',
    'eway-bills': 'gst.eWayBillRequired',
    'e-invoices': 'gst.eInvoiceRequired',

    'gst-menu': 'gst.gstApplicable',
    'gstr1-export': 'gst.gstr1Required',
    'gstr3b-compliance': 'gst.gstr3bRequired',
    'gstr9-annual': 'gst.gstr1Required',
    'gst-reconciliation': 'gst.gstr2a2bReconciliationRequired',
    'itc-register': 'gst.gstApplicable',
    'gst-payable': 'gst.gstApplicable',
    'hsn-summary': 'gst.gstApplicable',
    'gst-ledger': 'gst.gstApplicable',

    inventory: 'inventory.inventoryRequired',
    'item-master': 'inventory.inventoryRequired',
    'item-type-master': 'inventory.inventoryRequired',
    'item-group-master': 'inventory.inventoryRequired',
    'bom-master': 'manufacturing.bomRequired',
    'raw-material-report': 'inventory.inventoryRequired',
    'finished-goods-report': 'inventory.inventoryRequired',
    'stock-ledger': 'inventory.inventoryRequired',

    production: 'manufacturing.productionRequired',
    'prod-dashboard': 'manufacturing.productionRequired',
    'model-conversion': 'manufacturing.productionRequired',
    'comp-replacement': 'manufacturing.productionRequired',
    'prod-rejection': 'manufacturing.productionRequired',
    'prod-planning': 'manufacturing.productionRequired',

    'voucher-entry': 'accounting.accountingRequired',
    'accounting-reports': 'accounting.accountingRequired',
    'bill-wise-adjustment': 'accounting.billWiseAdjustmentRequired',
    'bank-reconciliation': 'accounting.bankReconciliationRequired',

    tds: 'tdsTcs.tdsRequired',
    'tds-dashboard': 'tdsTcs.tdsRequired',
    'tds-master': 'tdsTcs.tdsRequired',
    'tds-deduction-register': 'tdsTcs.tdsRequired',
    'tds-challan': 'tdsTcs.tdsChallanPaymentTracking',
    'form-26as': 'tdsTcs.tdsRequired',

    tcs: 'tdsTcs.tcsRequired',
    'tcs-dashboard': 'tdsTcs.tcsRequired',

    'saas-admin': 'saas.moduleControlEnabled',

    // Optional Kanban / Workflow layer (all default to false).
    // The parent submenu hides automatically when no child is visible,
    // so binding the parent to `workflow.enabled` is enough.
    'crm-kanban': 'workflow.enabled',
    'crm-kanban-sales-inquiry': 'workflow.salesInquiryKanbanEnabled',
    'crm-kanban-task': 'workflow.taskKanbanEnabled',
    'crm-kanban-purchase-rfq': 'workflow.purchaseRfqKanbanEnabled',
    'crm-kanban-production': 'workflow.productionKanbanEnabled',
    'crm-kanban-dispatch': 'workflow.dispatchKanbanEnabled',
    'crm-kanban-gst-tds': 'workflow.gstTdsKanbanEnabled',
    'crm-kanban-complaint': 'workflow.complaintKanbanEnabled',
    'crm-kanban-apk': 'workflow.apkKanbanEnabled',

    // Optional per-user UI customization (default OFF).
    'ui-preferences': 'ui.advancedCustomizationEnabled',
};

/** Never hide these menu ids based on feature flags */
export const MENU_FEATURE_ALWAYS_VISIBLE = new Set([
    'admin',
    'company-profile',
    'feature-compliance-settings',
    'user-management',
    'dashboard',
]);

