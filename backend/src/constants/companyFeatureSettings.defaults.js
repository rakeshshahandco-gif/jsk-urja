/**
 * Default feature flags — all enabled so existing companies keep current behavior.
 */
export const DEFAULT_COMPANY_FEATURE_SETTINGS = {
    sales: {
        enableSalesInvoice: true,
        enableEstimate: true,
        enableSalesOrder: true,
        enableDeliveryChallan: true,
        enableBarcodeQr: true,
        enableItemWiseBarcode: true,
        enablePublicInvoiceQrLink: true,
    },
    gst: {
        gstApplicable: true,
        eInvoiceRequired: true,
        eWayBillRequired: true,
        gstr1Required: true,
        gstr3bRequired: true,
        gstr2a2bReconciliationRequired: true,
        exportLutRequired: true,
        gstRefundModuleRequired: true,
    },
    inventory: {
        inventoryRequired: true,
        stockDeductionOnSales: true,
        stockAdditionOnPurchase: true,
        batchSerialBarcodeTracking: true,
        negativeStockAllowed: true,
        warehouseLocationTracking: true,
    },
    accounting: {
        accountingRequired: true,
        autoLedgerPosting: true,
        voucherApprovalRequired: true,
        billWiseAdjustmentRequired: true,
        bankReconciliationRequired: true,
        interestPayableStatementRequired: true,
        /** Tally-style F5 Payment / F6 Receipt panel on voucher entry screens (off = unchanged UI). */
        tallyVoucherShortcutsEnabled: false,
        /** Petty Cash module (entry, import, reports, settings). Off = hidden menus and API blocked. */
        enablePettyCash: false,
        /** Scan Entry / Invoice Import (legacy; treated as ON when enableAiSmartImport is ON). */
        enableScanEntry: false,
        /** AI Smart Import & Scan Entry (OCR, Tally/GSTR batch import hub). Off = hidden menus and API blocked. */
        enableAiSmartImport: false,
    },
    tdsTcs: {
        tdsRequired: true,
        tcsRequired: true,
        autoTdsDeduction: true,
        tdsChallanPaymentTracking: true,
    },
    manufacturing: {
        bomRequired: true,
        productionRequired: true,
        wipAccountingRequired: true,
        qcRequired: true,
    },
    purchase: {
        /** When false, RFQ menus/API are hidden; existing PO/GRN flow unchanged. */
        enableRfqSupplierQuotation: false,
        /** Document scan & attachment module — when false, system works exactly as before. */
        enableDocumentAttachments: false,
        enableMobileScanBills: false,
        enableOcrScanEntry: false,
    },
    saas: {
        moduleControlEnabled: true,
        userLimit: 0,
        subscriptionStatusActive: true,
        companyFeatureAccessEnabled: true,
    },
    // Optional Kanban / Workflow layer. All keys default to FALSE so existing
    // companies see ZERO change. Admin must explicitly enable in
    // Settings -> Feature & Compliance -> Workflow / Kanban.
    workflow: {
        enabled: false,
        taskKanbanEnabled: false,
        salesInquiryKanbanEnabled: false,
        purchaseRfqKanbanEnabled: false,
        productionKanbanEnabled: false,
        dispatchKanbanEnabled: false,
        gstTdsKanbanEnabled: false,
        complaintKanbanEnabled: false,
        apkKanbanEnabled: false,
    },
    // Optional Advanced UI Customization layer (per-user themes, colors,
    // sidebar/header style, dark mode, density, dashboard personalization).
    // Master toggle defaults to FALSE so existing companies see ZERO change.
    // When OFF: no CSS variables applied, no user preferences loaded, the
    // original CRM UI renders byte-identical to before.
    // When ON: each user can customize their own UI from User Profile -> UI
    // Preferences. One user's changes never affect another user.
    ui: {
        advancedCustomizationEnabled: false,
        /** Full-screen JSK logo popup on app load (per company). Off = no splash. */
        brandedSplashEnabled: true,
        /** JSK logo on loading spinners across modules. Off = plain loading text. */
        brandedLoaderEnabled: true,
    },
    crm: {
        whatsappToLeadEnabled: true,
        productCatalogEnabled: true,
        /** own_only = sales users see only their leads; all = users with Lead View can see all when permitted */
        leadVisibilityMode: 'own_only',
    },
    /** Customer Master → Accounts / Credit field visibility (all industries). Off = hidden on form. */
    featureEngine: {
        overrides: {},
        customDefinitions: [],
        industryFieldValues: {},
    },
    customer: {
        enableCreditPeriod: false,
        enableGracePeriod: false,
        enableCustomerType: false,
        enableTcsApplicable: false,
        enableCreditLimit: false,
        enablePaymentTerms: false,
        enableInterestApplicable: false,
        enableCollectionPerson: false,
        enableRiskCategory: false,
        enableGstNumber: true,
        enableGstRegistrationType: true,
        enableGstState: false,
        enablePlaceOfSupply: false,
        enablePanNumber: true,
        enableTanNumber: false,
        enableMsmeNumber: true,
        enableIecNumber: false,
        enableCinNumber: false,
        enableBankDetails: false,
        enableExportDetails: false,
        enableDocumentsKyc: false,
    },
};
