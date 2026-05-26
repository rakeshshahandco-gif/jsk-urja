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
    },
};
