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

    'petty-cash-group': 'accounting.enablePettyCash',
    'petty-cash-entry': 'accounting.enablePettyCash',
    'petty-cash-import': 'accounting.enablePettyCash',
    'petty-cash-reports': 'accounting.enablePettyCash',
    'petty-cash-settings': 'accounting.enablePettyCash',

    // Parent whatsapp-root / whatsapp-communication-group: no feature flag — visibility follows children.
    'communication-bulk-campaigns': 'communication.enableWhatsappBulk',
    'communication-bulk-matter': 'communication.enableWhatsappBulk',
    'communication-bulk-blacklist': 'communication.enableWhatsappBulk',
    'communication-bulk-history': 'communication.enableWhatsappBulk',
    'communication-bulk-number-health': 'communication.enableWhatsappBulk',
    'communication-bulk-settings': 'communication.enableWhatsappBulk',
    'communication-whatsapp-ai-group': 'communication.whatsappAiEnabled',
    'communication-whatsapp-ai-dashboard': 'communication.whatsappAiEnabled',
    'communication-whatsapp-ai-inbox': 'communication.whatsappAiEnabled',
    'communication-whatsapp-ai-active': 'communication.whatsappAiEnabled',
    'communication-whatsapp-ai-waiting': 'communication.whatsappAiEnabled',
    'communication-whatsapp-ai-lead-drafts': 'communication.whatsappAiEnabled',
    'communication-whatsapp-ai-reply-drafts': 'communication.whatsappAiEnabled',
    'communication-whatsapp-ai-knowledge': 'communication.whatsappAiEnabled',
    'communication-whatsapp-ai-documents': 'communication.whatsappAiEnabled',
    'communication-whatsapp-ai-rules': 'communication.whatsappAiEnabled',
    'communication-whatsapp-ai-settings': 'communication.whatsappAiEnabled',
    'communication-whatsapp-ai-audit': 'communication.whatsappAiEnabled',

    'communication-email-settings': 'communication.enableEmail',
    'communication-history': 'communication.enableEmail',
    'communication-email-bulk-group': 'communication.enableEmailBulk',
    'communication-email-bulk-campaigns': 'communication.enableEmailBulk',
    'communication-email-bulk-templates': 'communication.enableEmailBulk',
    'communication-email-bulk-blacklist': 'communication.enableEmailBulk',
    'communication-email-bulk-history': 'communication.enableEmailBulk',
    'communication-email-bulk-settings': 'communication.enableEmailBulk',

    'scan-entry-group': 'accounting.enableAiSmartImport',
    'scan-entry-drafts': 'accounting.enableAiSmartImport',
    'scan-entry-bulk': 'accounting.enableAiSmartImport',
    'scan-entry-reports': 'accounting.enableAiSmartImport',
    'scan-entry-keywords': 'accounting.enableAiSmartImport',
    'smart-import-hub': 'accounting.enableAiSmartImport',

    tds: 'tdsTcs.tdsRequired',
    'tds-dashboard': 'tdsTcs.tdsRequired',
    'tds-master': 'tdsTcs.tdsRequired',
    'tds-deduction-register': 'tdsTcs.tdsRequired',
    'tds-challan': 'tdsTcs.tdsChallanPaymentTracking',
    'form-26as': 'tdsTcs.tdsRequired',

    tcs: 'tdsTcs.tcsRequired',
    'tcs-dashboard': 'tdsTcs.tcsRequired',

    'super-admin': 'saas.moduleControlEnabled',
    /** @deprecated — use super-admin */
    'saas-admin': 'saas.moduleControlEnabled',

    // Optional Kanban / Workflow layer (all default to false).
    // The parent submenu hides automatically when no child is visible,
    // so binding the parent to `workflow.enabled` is enough.
    'crm-kanban': 'workflow.enabled',
    'crm-kanban-sales-inquiry': 'workflow.salesInquiryKanbanEnabled',
    'crm-kanban-task': 'workflow.taskKanbanEnabled',
    'crm-kanban-purchase-rfq': 'workflow.purchaseRfqKanbanEnabled',
    'purchase-rfq': 'purchase.enableRfqSupplierQuotation',
    'supplier-quotations': 'purchase.enableRfqSupplierQuotation',
    'quotation-comparison': 'purchase.enableRfqSupplierQuotation',
    'purchase-rfq-reports': 'purchase.enableRfqSupplierQuotation',
    /** Show Documents when AI/Scan import is on (not only Attachment & Proof on Purchase tab). */
    'documents-menu': 'accounting.enableAiSmartImport',
    'scan-bills': 'purchase.enableDocumentAttachments',
    'missing-attachments': 'purchase.enableDocumentAttachments',
    'mobile-scan-bills': 'purchase.enableMobileScanBills',
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
    'companies-list',
    'company-profile',
    'feature-configuration',
    'feature-compliance-settings',
    'industry-template-master',
    'company-module-allocation',
    'workflow-master',
    'platform-feature-defaults',
    'user-management',
    'dashboard',
]);

