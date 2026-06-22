export const FEATURE_SETTINGS_TABS = [
    { id: 'customer', label: 'Customer', platform: true },
    { id: 'industry', label: 'Industry / Production', platform: false },
    { id: 'sales', label: 'Sales', platform: true },
    { id: 'gst', label: 'GST', platform: true },
    { id: 'inventory', label: 'Inventory', platform: true },
    { id: 'accounting', label: 'Accounting', platform: true },
    { id: 'tdsTcs', label: 'TDS/TCS', platform: true },
    { id: 'manufacturing', label: 'Manufacturing', platform: true },
    { id: 'saas', label: 'SaaS/Permissions', platform: true },
    { id: 'purchase', label: 'Purchase', platform: true },
    { id: 'workflow', label: 'Workflow / Kanban', platform: true },
    { id: 'ui', label: 'UI Customization', platform: true },
    { id: 'crm', label: 'CRM', platform: true },
    { id: 'communication', label: 'Communication', platform: true },
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
        ['tallyVoucherShortcutsEnabled', 'Tally-style voucher shortcuts (F4–F7, Ctrl+F8/F9, Alt+E) on entry screens'],
        ['enablePettyCash', 'Enable Petty Cash (entry, import, reports, settings)'],
        ['enableScanEntry', 'Enable AI Smart Import & Scan Entry'],
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
    purchase: [
        ['enableRfqSupplierQuotation', 'Enable Purchase RFQ / Supplier Quotation'],
        ['enableDocumentAttachments', 'Attachment & Proof Storage'],
        ['enableMobileScanBills', 'Mobile Scan Bills'],
        ['enableOcrScanEntry', 'OCR Scan Entry (future)'],
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
        ['brandedSplashEnabled', 'Show JSK URJA logo splash on app open'],
        ['brandedLoaderEnabled', 'Show JSK URJA logo on loading screens'],
    ],
    crm: [
        ['whatsappToLeadEnabled', 'Enable WhatsApp to Lead / Inquiry module'],
        ['productCatalogEnabled', 'Enable Product Catalog for CRM'],
    ],
    communication: [
        ['enableWhatsappBulk', 'Enable WhatsApp Bulk Messaging Utility (campaigns, matter master, blacklist)'],
        ['enableEmail', 'Enable Platform Email (SMTP settings, communication history)'],
        ['enableEmailBulk', 'Enable Email Bulk Messaging Utility (campaigns, templates, blacklist)'],
    ],
    customer: [
        ['enableCreditPeriod', 'Enable Credit Period'],
        ['enableGracePeriod', 'Enable Grace Period'],
        ['enableCustomerType', 'Enable Customer Type'],
        ['enableTcsApplicable', 'Enable TCS Applicable'],
        ['enableCreditLimit', 'Enable Credit Limit'],
        ['enablePaymentTerms', 'Enable Payment Terms'],
        ['enableInterestApplicable', 'Enable Interest Applicable'],
        ['enableCollectionPerson', 'Enable Collection Person'],
        ['enableRiskCategory', 'Enable Risk Category'],
        ['enableGstNumber', 'Enable GST No'],
        ['enableGstRegistrationType', 'Enable GST Registration Type'],
        ['enableGstState', 'Enable GST State'],
        ['enablePlaceOfSupply', 'Enable Place of Supply'],
        ['enablePanNumber', 'Enable PAN No'],
        ['enableTanNumber', 'Enable TAN No'],
        ['enableMsmeNumber', 'Enable MSME / UDYAM No'],
        ['enableIecNumber', 'Enable IEC Number'],
        ['enableCinNumber', 'Enable CIN Number'],
        ['enableBankDetails', 'Enable Banking Details Tab'],
        ['enableExportDetails', 'Enable Export Details Tab'],
        ['enableDocumentsKyc', 'Enable Documents / KYC Tab'],
    ],
};

/** Grouped toggles for Customer Master Settings page (KYC / tax / banking). */
export const CUSTOMER_FIELD_SECTIONS = [
    {
        id: 'credit',
        title: 'Accounts / Credit (Basic tab)',
        fields: [
            ['enableCreditPeriod', 'Enable Credit Period'],
            ['enableGracePeriod', 'Enable Grace Period'],
            ['enableCustomerType', 'Enable Customer Type'],
            ['enableTcsApplicable', 'Enable TCS Applicable'],
            ['enableCreditLimit', 'Enable Credit Limit'],
            ['enablePaymentTerms', 'Enable Payment Terms'],
            ['enableInterestApplicable', 'Enable Interest Applicable'],
            ['enableCollectionPerson', 'Enable Collection Person'],
            ['enableRiskCategory', 'Enable Risk Category'],
        ],
    },
    {
        id: 'gstTax',
        title: 'GST & Tax Details tab',
        fields: [
            ['enableGstNumber', 'Enable GST No'],
            ['enableGstRegistrationType', 'Enable GST Registration Type'],
            ['enableGstState', 'Enable GST State'],
            ['enablePlaceOfSupply', 'Enable Place of Supply'],
            ['enablePanNumber', 'Enable PAN No'],
            ['enableTanNumber', 'Enable TAN No'],
            ['enableMsmeNumber', 'Enable MSME / UDYAM No'],
            ['enableIecNumber', 'Enable IEC Number'],
            ['enableCinNumber', 'Enable CIN Number'],
        ],
    },
    {
        id: 'bankingExport',
        title: 'Banking & Export tabs',
        fields: [
            ['enableBankDetails', 'Enable Banking Details Tab'],
            ['enableExportDetails', 'Enable Export Details Tab'],
        ],
    },
    {
        id: 'documents',
        title: 'Documents / KYC tab',
        fields: [
            ['enableDocumentsKyc', 'Enable Documents / KYC Tab'],
        ],
    },
];

/** Select fields for CRM tab (non-toggle). */
export const FEATURE_SETTINGS_SELECTS = {
    crm: [
        {
            key: 'leadVisibilityMode',
            label: 'Lead Visibility Mode',
            options: [
                { value: 'own_only', label: 'Only Own Leads (default for sales users)' },
                { value: 'all', label: 'All Leads (with Lead View permission)' },
            ],
        },
    ],
};

export const PLATFORM_FEATURE_TABS = FEATURE_SETTINGS_TABS.filter((t) => t.platform);
