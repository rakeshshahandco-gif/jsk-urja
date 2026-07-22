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
        /** Textile / Handloom item image tab in Item Master (hidden for Electronics / JSK) */
        textileItemImagesRequired: true,
    },
    accounting: {
        accountingRequired: true,
        autoLedgerPosting: true,
        voucherApprovalRequired: true,
        billWiseAdjustmentRequired: true,
        bankReconciliationRequired: true,
        interestPayableStatementRequired: true,
        tallyVoucherShortcutsEnabled: false,
        enablePettyCash: false,
        enableScanEntry: false,
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
        enableRfqSupplierQuotation: false,
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
        brandedSplashEnabled: true,
        brandedLoaderEnabled: true,
    },
    // CRM extensions used by WhatsApp <-> Lead flow.
    // Defaults to true so the WhatsApp-driven lead capture and the product
    // catalog (used to share datasheets via WhatsApp) are usable out of the box.
    crm: {
        whatsappToLeadEnabled: true,
        productCatalogEnabled: true,
        leadVisibilityMode: 'own_only',
    },
    communication: {
        enableWhatsappBulk: false,
        /** WhatsApp AI Assistant - off by default; isolated from Chat/Bulk. */
        whatsappAiEnabled: false,
        enableEmail: false,
        enableEmailBulk: false,
    },
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

export function isAiSmartImportEnabled(settings) {
    const merged = mergeFeatureSettings(settings);
    return Boolean(merged.accounting?.enableAiSmartImport || merged.accounting?.enableScanEntry);
}

export function isFeatureEnabled(settings, path) {
    if (!path) return true;
    if (path === 'accounting.enableAiSmartImport') {
        return isAiSmartImportEnabled(settings);
    }
    if (path === 'communication.whatsappAiEnabled') {
        const mergedWa = mergeFeatureSettings(settings);
        return Boolean(mergedWa.communication?.whatsappAiEnabled);
    }
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
