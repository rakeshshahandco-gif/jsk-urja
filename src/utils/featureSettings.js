const DEFAULTS = {
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
    industry: {
        companyDisplayName: 'JSK URJA',
        industryTemplate: 'Electronics Manufacturer',
        productionProcessTemplate: 'JSK Electronics Standard Process',
        behaviorMode: 'legacy-compatible',
    },
    // Optional Kanban / Workflow layer. Defaults to FALSE so existing
    // customers see no change until admin explicitly enables in settings.
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
    // Optional Advanced UI Customization. When this master toggle is OFF (the
    // default) the existing UI renders byte-identical to today and no
    // per-user preferences are loaded. When ON, users can customize their own
    // UI in Profile -> UI Preferences (themes, colors, density, etc.).
    ui: {
        advancedCustomizationEnabled: false,
    },
    // CRM extensions used by WhatsApp <-> Lead flow.
    // Defaults to true so the WhatsApp-driven lead capture and the product
    // catalog (used to share datasheets via WhatsApp) are usable out of the box.
    crm: {
        whatsappToLeadEnabled: true,
        productCatalogEnabled: true,
    },
};

function deepMerge(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    const out = { ...base };
    for (const key of Object.keys(patch)) {
        const pv = patch[key];
        if (pv && typeof pv === 'object' && !Array.isArray(pv) && base[key] && typeof base[key] === 'object') {
            out[key] = deepMerge(base[key], pv);
        } else if (pv !== undefined) {
            out[key] = pv;
        }
    }
    return out;
}

export function mergeFeatureSettings(stored) {
    return deepMerge(DEFAULTS, stored || {});
}

export function isFeatureEnabled(settings, path) {
    if (!path) return true;
    const merged = mergeFeatureSettings(settings);
    const parts = String(path).split('.');
    let cur = merged;
    for (const p of parts) {
        if (cur == null || typeof cur !== 'object') return true;
        cur = cur[p];
    }
    if (cur === undefined || cur === null) return true;
    return Boolean(cur);
}

export { DEFAULTS as DEFAULT_FEATURE_SETTINGS };
