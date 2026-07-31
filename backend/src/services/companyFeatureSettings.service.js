import { CompanyFeatureSettings } from '../models/companyFeatureSettings.model.js';
import { DEFAULT_COMPANY_FEATURE_SETTINGS } from '../constants/companyFeatureSettings.defaults.js';
import {
    applyJskProtectedCommunicationFlags,
    JSK_PROTECTED_FEATURE_PATHS,
} from '../constants/protectedCrmModules.constants.js';
import { mergeIndustryConfig } from './productionTemplate.service.js';
import { ensureJskIndustryDefaults, isJskUrjaCompany } from './companyIndustryBootstrap.service.js';
import { getPlatformFeatureSettingsRaw } from './platformFeatureSettings.service.js';
import { CUSTOMER_LEGACY_SYNC } from '../constants/customerFeatureSync.constants.js';
import { Company } from '../models/company.model.js';
import { ApiError } from '../utils/ApiError.js';

export function deepMerge(...sources) {
    let out = {};
    for (const source of sources) {
        if (!source || typeof source !== 'object') continue;
        const next = { ...out };
        for (const key of Object.keys(source)) {
            const pv = source[key];
            if (pv && typeof pv === 'object' && !Array.isArray(pv) && out[key] && typeof out[key] === 'object') {
                next[key] = deepMerge(out[key], pv);
            } else if (pv !== undefined) {
                next[key] = pv;
            }
        }
        out = next;
    }
    return out;
}

/** Merge order: code defaults → platform overrides → company overrides */
export function mergeFeatureSettings(companyStored, platformStored = null) {
    const base = deepMerge(
        DEFAULT_COMPANY_FEATURE_SETTINGS,
        platformStored || {},
        companyStored || {},
    );
    base.industry = mergeIndustryConfig(companyStored?.industry ?? platformStored?.industry);
    return base;
}

export function isFeatureEnabled(settings, path) {
    if (!path) return true;
    if (path === 'accounting.enableAiSmartImport') {
        return isAiSmartImportEnabled(settings);
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

/** Master flag for AI Smart Import hub, scan-entry OCR, and batch imports (legacy enableScanEntry counts as ON). */
export function isAiSmartImportEnabled(settings) {
    const merged = mergeFeatureSettings(settings);
    return Boolean(merged.accounting?.enableAiSmartImport || merged.accounting?.enableScanEntry);
}

export function shouldDeductStockOnSales(settings) {
    const s = mergeFeatureSettings(settings);
    return Boolean(s.inventory?.inventoryRequired && s.inventory?.stockDeductionOnSales);
}

export function shouldPostSalesLedger(settings) {
    const s = mergeFeatureSettings(settings);
    return Boolean(s.accounting?.accountingRequired && s.accounting?.autoLedgerPosting);
}

export async function getCompanyFeatureSettings(companyId) {
    if (!companyId) return mergeFeatureSettings(null);
    const platformRaw = await getPlatformFeatureSettingsRaw();
    let doc = await CompanyFeatureSettings.findOne({ companyId });
    if (!doc) {
        doc = await CompanyFeatureSettings.create({
            companyId,
            settings: applyCustomerFeatureSync(deepMerge({}, platformRaw)),
        });
        await ensureJskIndustryDefaults(companyId, doc);
    } else {
        await ensureJskIndustryDefaults(companyId, doc);
        const prevJson = JSON.stringify(doc.settings);
        doc.settings = applyCustomerFeatureSync(deepMerge({}, doc.settings));
        if (JSON.stringify(doc.settings) !== prevJson) {
            await doc.save();
        }
    }
    return mergeFeatureSettings(doc.settings, platformRaw);
}

export async function getCompanyFeatureSettingsDoc(companyId) {
    const platformRaw = await getPlatformFeatureSettingsRaw();
    let doc = await CompanyFeatureSettings.findOne({ companyId });
    if (!doc) {
        doc = await CompanyFeatureSettings.create({
            companyId,
            settings: deepMerge({}, platformRaw),
        });
    }
    return doc;
}

/** Ensure customer.* keys exist and featureEngine overrides match Feature / Compliance → Customer tab. */
function applyCustomerFeatureSync(settings) {
    if (!settings || typeof settings !== 'object') return settings;
    const defaultsCustomer = DEFAULT_COMPANY_FEATURE_SETTINGS.customer || {};
    settings.customer = deepMerge(defaultsCustomer, settings.customer || {});

    const overrides = { ...(settings.featureEngine?.overrides || {}) };
    for (const [legacyKey, featureKey] of Object.entries(CUSTOMER_LEGACY_SYNC)) {
        if (settings.customer[legacyKey] !== undefined) {
            overrides[featureKey] = !!settings.customer[legacyKey];
        }
    }
    settings.featureEngine = deepMerge(settings.featureEngine || {}, { overrides });
    return settings;
}

export async function updateCompanyFeatureSettings(companyId, patch, userId) {
    const platformRaw = await getPlatformFeatureSettingsRaw();
    const doc = await getCompanyFeatureSettingsDoc(companyId);
    const company = await Company.findById(companyId)
        .select('companyName brandName legalName isDefault')
        .lean();
    const allowDisable = patch?.allowDisableProtectedModules === true
        || patch?.settings?.allowDisableProtectedModules === true;
    const cleanPatch = { ...(patch || {}) };
    delete cleanPatch.allowDisableProtectedModules;
    if (cleanPatch.settings && typeof cleanPatch.settings === 'object') {
        cleanPatch.settings = { ...cleanPatch.settings };
        delete cleanPatch.settings.allowDisableProtectedModules;
    }

    // Callers may pass either a full settings object or a nested { settings } body.
    const settingsPatch = cleanPatch.settings && typeof cleanPatch.settings === 'object'
        && !cleanPatch.sales && !cleanPatch.communication
        ? cleanPatch.settings
        : cleanPatch;

    if (isJskUrjaCompany(company) && !allowDisable) {
        for (const path of JSK_PROTECTED_FEATURE_PATHS) {
            const [section, key] = String(path).split('.');
            const nextVal = settingsPatch?.[section]?.[key];
            if (nextVal === false) {
                throw new ApiError(
                    403,
                    `Protected feature ${path} cannot be disabled for JSK URJA without explicit owner approval (allowDisableProtectedModules).`,
                );
            }
        }
    }

    doc.settings = deepMerge(doc.settings || {}, settingsPatch);
    doc.settings = applyCustomerFeatureSync(doc.settings);
    if (isJskUrjaCompany(company) && !allowDisable) {
        doc.settings = applyJskProtectedCommunicationFlags(doc.settings);
    }

    if (userId) doc.updatedBy = userId;
    await doc.save();
    return mergeFeatureSettings(doc.settings, platformRaw);
}

/** Route prefix → feature path for API gate */
export const API_FEATURE_ROUTE_MAP = [
    { prefix: '/e-invoices', feature: 'gst.eInvoiceRequired' },
    { prefix: '/eway-bills', feature: 'gst.eWayBillRequired' },
    { prefix: '/gst-reports', feature: 'gst.gstApplicable' },
    { prefix: '/gst-reconciliation', feature: 'gst.gstr2a2bReconciliationRequired' },
    { prefix: '/tds', feature: 'tdsTcs.tdsRequired' },
    { prefix: '/tcs', feature: 'tdsTcs.tcsRequired' },
    { prefix: '/bank-reconciliation', feature: 'accounting.bankReconciliationRequired' },
    { prefix: '/bill-wise-adjustments', feature: 'accounting.billWiseAdjustmentRequired' },
    { prefix: '/petty-cash', feature: 'accounting.enablePettyCash' },
    { prefix: '/whatsapp-bulk', feature: 'communication.enableWhatsappBulk' },
    { prefix: '/whatsapp-ai', feature: 'communication.whatsappAiEnabled' },
    { prefix: '/email-settings', feature: 'communication.enableEmail' },
    { prefix: '/email-bulk', feature: 'communication.enableEmailBulk' },
    { prefix: '/communication-history', feature: 'communication.enableEmail' },
    { prefix: '/scan-entry', feature: 'accounting.enableAiSmartImport' },
    { prefix: '/smart-import', feature: 'accounting.enableAiSmartImport' },
    { prefix: '/import-center', feature: 'accounting.enableAiSmartImport' },
    { prefix: '/stock', feature: 'inventory.inventoryRequired' },
];

export function featureForApiPath(path) {
    const p = path || '';
    const hit = API_FEATURE_ROUTE_MAP.find((r) => p.startsWith(r.prefix));
    return hit?.feature || null;
}
