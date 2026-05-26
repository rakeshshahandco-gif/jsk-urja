export const FEATURE_SETTINGS_TABS = [
    { id: 'industry', label: 'Industry / Production', platform: false },
    { id: 'sales', label: 'Sales', platform: true },
    { id: 'gst', label: 'GST', platform: true },
    { id: 'inventory', label: 'Inventory', platform: true },
    { id: 'accounting', label: 'Accounting', platform: true },
    { id: 'tdsTcs', label: 'TDS/TCS', platform: true },
    { id: 'manufacturing', label: 'Manufacturing', platform: true },
    { id: 'saas', label: 'SaaS/Permissions', platform: true },
    { id: 'workflow', label: 'Workflow / Kanban', platform: true },
    { id: 'ui', label: 'UI Customization', platform: true },
];

export const FEATURE_SETTINGS_FIELDS = {
    sales: [
        ['enableSalesInvoice', 'Enable Sales Invoice'],
        ['enableEstimate', 'Enable Estimate'],
        ['enableSalesOrder', 'Enable Sales Order'],
        ['enableDeliveryChallan', 'Enable Delivery Challan'],
        ['enableBarcodeQr', 'Enable Barcode / QR on invoice'],
        ['enableItemWiseBarcode', 'Enable item-wise barcode'],
        ['enablePublicInvoiceQrLink', 'Enable public invoice QR link'],
    ],
    gst: [
        ['gstApplicable', 'GST applicable'],
        ['eInvoiceRequired', 'E-Invoice required'],
        ['eWayBillRequired', 'E-Way Bill required'],
        ['gstr1Required', 'GSTR-1 required'],
        ['gstr3bRequired', 'GSTR-3B required'],
        ['gstr2a2bReconciliationRequired', 'GSTR-2A/2B reconciliation required'],
        ['exportLutRequired', 'Export/LUT required'],
        ['gstRefundModuleRequired', 'GST refund module required'],
    ],
    inventory: [
        ['inventoryRequired', 'Inventory required'],
        ['stockDeductionOnSales', 'Stock deduction on sales invoice'],
        ['stockAdditionOnPurchase', 'Stock addition on purchase'],
        ['batchSerialBarcodeTracking', 'Batch/serial/barcode tracking'],
        ['negativeStockAllowed', 'Negative stock allowed'],
        ['warehouseLocationTracking', 'Warehouse/location tracking'],
    ],
    accounting: [
        ['accountingRequired', 'Accounting required'],
        ['autoLedgerPosting', 'Auto ledger posting required'],
        ['voucherApprovalRequired', 'Voucher approval required'],
        ['billWiseAdjustmentRequired', 'Bill-wise adjustment required'],
        ['bankReconciliationRequired', 'Bank reconciliation required'],
        ['interestPayableStatementRequired', 'Interest payable statement required'],
    ],
    tdsTcs: [
        ['tdsRequired', 'TDS required'],
        ['tcsRequired', 'TCS required'],
        ['autoTdsDeduction', 'Auto TDS deduction'],
        ['tdsChallanPaymentTracking', 'TDS challan/payment tracking'],
    ],
    manufacturing: [
        ['bomRequired', 'BOM required'],
        ['productionRequired', 'Production required'],
        ['wipAccountingRequired', 'WIP accounting required'],
        ['qcRequired', 'QC required'],
    ],
    saas: [
        ['moduleControlEnabled', 'Module enable/disable company-wise'],
        ['companyFeatureAccessEnabled', 'Company-wise feature access'],
        ['subscriptionStatusActive', 'Subscription status active'],
    ],
    workflow: [
        ['enabled', 'Enable Kanban / Workflow (master toggle)'],
        ['salesInquiryKanbanEnabled', 'Enable Sales Inquiry Kanban'],
        ['taskKanbanEnabled', 'Enable Task Kanban'],
        ['purchaseRfqKanbanEnabled', 'Enable Purchase RFQ Kanban'],
        ['productionKanbanEnabled', 'Enable Production Workflow Kanban'],
        ['dispatchKanbanEnabled', 'Enable Dispatch Workflow Kanban'],
        ['gstTdsKanbanEnabled', 'Enable GST / TDS Workflow Kanban'],
        ['complaintKanbanEnabled', 'Enable Complaint Workflow Kanban'],
        ['apkKanbanEnabled', 'Enable APK Kanban View'],
    ],
    ui: [
        ['advancedCustomizationEnabled', 'Enable Advanced UI Customization (per-user themes, colors, density)'],
    ],
};

export const PLATFORM_FEATURE_TABS = FEATURE_SETTINGS_TABS.filter((t) => t.platform);
