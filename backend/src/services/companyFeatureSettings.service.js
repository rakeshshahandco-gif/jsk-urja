import { CompanyFeatureSettings } from '../models/companyFeatureSettings.model.js';
import { DEFAULT_COMPANY_FEATURE_SETTINGS } from '../constants/companyFeatureSettings.defaults.js';
import { mergeIndustryConfig } from './productionTemplate.service.js';
import { ensureJskIndustryDefaults } from './companyIndustryBootstrap.service.js';
import { getPlatformFeatureSettingsRaw } from './platformFeatureSettings.service.js';

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
    let doc = await CompanyFeatureSettings.findOne({ companyId }).lean();
    if (!doc) {
        const created = await CompanyFeatureSettings.create({
            companyId,
            settings: deepMerge({}, platformRaw),
        });
        await ensureJskIndustryDefaults(companyId, created);
        doc = created.toObject();
    } else {
        const live = await CompanyFeatureSettings.findById(doc._id);
        if (live) await ensureJskIndustryDefaults(companyId, live);
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

export async function updateCompanyFeatureSettings(companyId, patch, userId) {
    const platformRaw = await getPlatformFeatureSettingsRaw();
    const doc = await getCompanyFeatureSettingsDoc(companyId);
    doc.settings = deepMerge(doc.settings || {}, patch);
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
    { prefix: '/stock', feature: 'inventory.inventoryRequired' },
];

export function featureForApiPath(path) {
    const p = path || '';
    const hit = API_FEATURE_ROUTE_MAP.find((r) => p.startsWith(r.prefix));
    return hit?.feature || null;
}
