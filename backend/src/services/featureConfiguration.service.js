import {
    getCompanyFeatureSettings,
    getCompanyFeatureSettingsDoc,
    deepMerge,
    isFeatureEnabled as legacyIsFeatureEnabled,
} from './companyFeatureSettings.service.js';
import { CUSTOMER_LEGACY_SYNC } from '../constants/customerFeatureSync.constants.js';

export { CUSTOMER_LEGACY_SYNC };

const mk = (featureKey, featureName, module, category, defaultEnabled, legacyPath = null, industry = null) => ({
    featureKey,
    featureName,
    module,
    category,
    industry,
    defaultEnabled: !!defaultEnabled,
    required: false,
    ...(legacyPath ? { legacyPath } : {}),
});

export const FEATURE_CONFIG_CATEGORIES = [
    { id: 'module', label: 'Module Configuration' },
    { id: 'compliance', label: 'Compliance Configuration' },
    { id: 'customer', label: 'Customer Master' },
    { id: 'supplier', label: 'Supplier Master' },
    { id: 'industry', label: 'Industry Fields' },
];

export const FEATURE_CONFIGURATION_REGISTRY = [
    mk('module.crm', 'CRM', 'crm', 'module', true),
    mk('module.tasks', 'Task Management', 'tasks', 'module', true),
    mk('module.whatsapp', 'WhatsApp', 'whatsapp', 'module', true),
    mk('module.sales', 'Sales', 'sales', 'module', true, 'sales.enableSalesInvoice'),
    mk('module.purchase', 'Purchase', 'purchase', 'module', true),
    mk('module.inventory', 'Inventory', 'inventory', 'module', true, 'inventory.inventoryRequired'),
    mk('module.accounts', 'Accounts', 'accounts', 'module', true, 'accounting.accountingRequired'),
    mk('module.gst', 'GST', 'gst', 'module', true, 'gst.gstApplicable'),
    mk('module.tds', 'TDS', 'tds', 'module', true, 'tdsTcs.tdsRequired'),
    mk('module.production', 'Production', 'production', 'module', true, 'manufacturing.productionRequired'),
    mk('module.hr', 'HR', 'hr', 'module', true),
    mk('module.barcode', 'Barcode', 'sales', 'module', true, 'sales.enableBarcodeQr'),
    mk('module.ocrScanEntry', 'OCR / Scan Entry', 'documents', 'module', false, 'accounting.enableAiSmartImport'),
    mk('module.attachments', 'Attachment Module', 'documents', 'module', false, 'purchase.enableDocumentAttachments'),
    mk('module.export', 'Export Module', 'sales', 'module', true, 'gst.exportLutRequired'),
    mk('compliance.gst', 'GST', 'gst', 'compliance', true, 'gst.gstApplicable'),
    mk('compliance.tds', 'TDS', 'tds', 'compliance', true, 'tdsTcs.tdsRequired'),
    mk('compliance.tcs', 'TCS', 'tcs', 'compliance', true, 'tdsTcs.tcsRequired'),
    mk('compliance.eInvoice', 'E-Invoice', 'gst', 'compliance', true, 'gst.eInvoiceRequired'),
    mk('compliance.eWayBill', 'E-Way Bill', 'gst', 'compliance', true, 'gst.eWayBillRequired'),
    mk('compliance.msme', 'MSME Compliance', 'accounts', 'compliance', true),
    mk('compliance.posh', 'POSH Compliance', 'hr', 'compliance', false),
    mk('compliance.pf', 'PF', 'hr', 'compliance', false),
    mk('compliance.esic', 'ESIC', 'hr', 'compliance', false),
    mk('compliance.pt', 'PT', 'hr', 'compliance', false),
    mk('compliance.labour', 'Labour Compliance', 'hr', 'compliance', false),
    mk('compliance.fire', 'Fire Compliance', 'hr', 'compliance', false),
    mk('compliance.iso', 'ISO Compliance', 'hr', 'compliance', false),
    mk('customer.customerType', 'Customer Type', 'customer', 'customer', false, 'customer.enableCustomerType'),
    mk('customer.creditPeriod', 'Credit Period', 'customer', 'customer', false, 'customer.enableCreditPeriod'),
    mk('customer.gracePeriod', 'Grace Period', 'customer', 'customer', false, 'customer.enableGracePeriod'),
    mk('customer.creditLimit', 'Credit Limit', 'customer', 'customer', false, 'customer.enableCreditLimit'),
    mk('customer.collectionPerson', 'Collection Person', 'customer', 'customer', false, 'customer.enableCollectionPerson'),
    mk('customer.salesPerson', 'Sales Person', 'customer', 'customer', true),
    mk('customer.tcsApplicable', 'TCS Applicable', 'customer', 'customer', false, 'customer.enableTcsApplicable'),
    mk('customer.tcsRate', 'TCS Rate', 'customer', 'customer', false, 'customer.enableTcsApplicable'),
    mk('customer.panNumber', 'PAN Number', 'customer', 'customer', true),
    mk('customer.gstNumber', 'GST Number', 'customer', 'customer', true, 'customer.enableGstNumber'),
    mk('customer.gstRegistrationType', 'GST Registration Type', 'customer', 'customer', true, 'customer.enableGstRegistrationType'),
    mk('customer.gstState', 'GST State', 'customer', 'customer', false, 'customer.enableGstState'),
    mk('customer.placeOfSupply', 'Place of Supply', 'customer', 'customer', false, 'customer.enablePlaceOfSupply'),
    mk('customer.tanNumber', 'TAN Number', 'customer', 'customer', false, 'customer.enableTanNumber'),
    mk('customer.cinNumber', 'CIN Number', 'customer', 'customer', false, 'customer.enableCinNumber'),
    mk('customer.iecNumber', 'IEC Number', 'customer', 'customer', false, 'customer.enableIecNumber'),
    mk('customer.msmeNumber', 'MSME / UDYAM Number', 'customer', 'customer', true, 'customer.enableMsmeNumber'),
    mk('customer.bankDetails', 'Bank Details', 'customer', 'customer', false, 'customer.enableBankDetails'),
    mk('customer.exportDetails', 'Export Details', 'customer', 'customer', false, 'customer.enableExportDetails'),
    mk('customer.documentsKyc', 'Documents / KYC Tab', 'customer', 'customer', false, 'customer.enableDocumentsKyc'),
    mk('customer.tcsThreshold', 'TCS Threshold', 'customer', 'customer', false, 'customer.enableTcsApplicable'),
    mk('customer.riskCategory', 'Risk Category', 'customer', 'customer', false, 'customer.enableRiskCategory'),
    mk('customer.paymentTerms', 'Payment Terms', 'customer', 'customer', false, 'customer.enablePaymentTerms'),
    mk('customer.interestApplicable', 'Interest Applicable', 'customer', 'customer', false, 'customer.enableInterestApplicable'),
    mk('customer.interestedProducts', 'Interested Products', 'customer', 'customer', true),
    mk('customer.industrySpecificFields', 'Industry Specific Fields', 'customer', 'customer', false),
    mk('supplier.supplierType', 'Supplier Type', 'supplier', 'supplier', true),
    mk('supplier.creditDays', 'Credit Days', 'supplier', 'supplier', true),
    mk('supplier.gracePeriod', 'Grace Period', 'supplier', 'supplier', false),
    mk('supplier.tdsApplicable', 'TDS Applicable', 'supplier', 'supplier', true),
    mk('supplier.panNumber', 'PAN Number', 'supplier', 'supplier', true),
    mk('supplier.msmeNumber', 'MSME Number', 'supplier', 'supplier', true),
    mk('supplier.bankDetails', 'Bank Details', 'supplier', 'supplier', true),
    mk('supplier.contactPerson', 'Contact Person', 'supplier', 'supplier', true),
    mk('supplier.vendorCategory', 'Vendor Category', 'supplier', 'supplier', false),
    mk('supplier.complianceDocuments', 'Compliance Documents', 'supplier', 'supplier', false),
    mk('industry.smartLighting.consultant', 'Consultant', 'customer', 'industry', false, null, 'Smart Lighting'),
    mk('industry.smartLighting.projectName', 'Project Name', 'customer', 'industry', false, null, 'Smart Lighting'),
    mk('industry.textile.brokerName', 'Broker Name', 'customer', 'industry', false, null, 'Textile'),
    mk('industry.exporter.country', 'Country', 'customer', 'industry', false, null, 'Exporter'),
    mk('industry.exporter.iecNumber', 'IEC Number', 'customer', 'industry', false, null, 'Exporter'),
];

export const REGISTRY_BY_KEY = Object.fromEntries(FEATURE_CONFIGURATION_REGISTRY.map((r) => [r.featureKey, r]));

export const DEFAULT_FEATURE_ENGINE = { overrides: {}, customDefinitions: [], industryFieldValues: {} };

function getByPath(obj, path) {
    if (!path) return undefined;
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = cur[p];
    }
    return cur;
}

/** Map legacy customer.enableX → customer.x for sync */
export function getFeatureRegistry() {
    return FEATURE_CONFIGURATION_REGISTRY;
}

export function buildEffectiveOverrides(mergedSettings) {
    const engine = mergedSettings?.featureEngine || DEFAULT_FEATURE_ENGINE;
    const overrides = { ...(engine.overrides || {}) };

    for (const def of FEATURE_CONFIGURATION_REGISTRY) {
        if (overrides[def.featureKey] !== undefined) continue;
        if (def.legacyPath) {
            const legacyVal = getByPath(mergedSettings, def.legacyPath);
            if (legacyVal !== undefined) {
                overrides[def.featureKey] = !!legacyVal;
                continue;
            }
        }
        overrides[def.featureKey] = def.defaultEnabled;
    }

    for (const custom of engine.customDefinitions || []) {
        if (custom?.featureKey && overrides[custom.featureKey] === undefined) {
            overrides[custom.featureKey] = custom.defaultEnabled !== false;
        }
    }

    // Feature / Compliance → Customer tab wins over stale featureEngine overrides
    for (const [legacyKey, featureKey] of Object.entries(CUSTOMER_LEGACY_SYNC)) {
        const legacyVal = mergedSettings?.customer?.[legacyKey];
        if (legacyVal !== undefined) overrides[featureKey] = !!legacyVal;
    }

    return overrides;
}

export function resolveFeatureEnabled(mergedSettings, featureKey) {
    if (!featureKey) return true;
    const overrides = buildEffectiveOverrides(mergedSettings);
    if (Object.prototype.hasOwnProperty.call(overrides, featureKey)) {
        return Boolean(overrides[featureKey]);
    }
    const def = REGISTRY_BY_KEY[featureKey];
    if (def?.legacyPath) {
        const v = getByPath(mergedSettings, def.legacyPath);
        if (v !== undefined) return Boolean(v);
    }
    if (def) return Boolean(def.defaultEnabled);
    return legacyIsFeatureEnabled(mergedSettings, featureKey);
}

export async function getCompanyFeatureConfiguration(companyId) {
    const merged = await getCompanyFeatureSettings(companyId);
    const doc = await getCompanyFeatureSettingsDoc(companyId);
    const engine = deepMerge(DEFAULT_FEATURE_ENGINE, doc.settings?.featureEngine || {});
    const overrides = buildEffectiveOverrides(merged);
    return {
        registry: FEATURE_CONFIGURATION_REGISTRY,
        categories: FEATURE_CONFIG_CATEGORIES,
        featureEngine: engine,
        overrides,
        mergedSettings: merged,
    };
}

export async function saveCompanyFeatureConfiguration(companyId, payload, userId) {
    const doc = await getCompanyFeatureSettingsDoc(companyId);
    const current = doc.settings?.featureEngine || {};
    const nextEngine = {
        ...current,
        overrides: payload.overrides != null ? payload.overrides : current.overrides,
        customDefinitions: payload.customDefinitions != null ? payload.customDefinitions : current.customDefinitions,
        industryFieldValues: payload.industryFieldValues != null ? payload.industryFieldValues : current.industryFieldValues,
    };
    doc.settings = deepMerge(doc.settings || {}, { featureEngine: nextEngine });

    const customerPatch = {};
    for (const [legacyKey, featureKey] of Object.entries(CUSTOMER_LEGACY_SYNC)) {
        if (payload.overrides && payload.overrides[featureKey] !== undefined) {
            customerPatch[legacyKey] = !!payload.overrides[featureKey];
        }
    }
    if (Object.keys(customerPatch).length) {
        doc.settings.customer = deepMerge(doc.settings.customer || {}, customerPatch);
    }

    if (userId) doc.updatedBy = userId;
    await doc.save();
    return getCompanyFeatureConfiguration(companyId);
}
