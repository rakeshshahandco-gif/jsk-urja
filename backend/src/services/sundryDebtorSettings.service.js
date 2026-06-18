import { DEFAULT_SUNDRY_DEBTOR_SETTINGS } from '../constants/sundryDebtorSettings.defaults.js';
import { DEFAULT_COMPANY_FEATURE_SETTINGS } from '../constants/companyFeatureSettings.defaults.js';
import { SundryDebtorSettings } from '../models/sundryDebtorSettings.model.js';
import {
    getCompanyFeatureSettings,
    updateCompanyFeatureSettings,
    deepMerge,
} from './companyFeatureSettings.service.js';

function mergeSettings(doc) {
    return { ...DEFAULT_SUNDRY_DEBTOR_SETTINGS, ...(doc || {}) };
}

/** Read customer credit flags: company feature settings → legacy sundry-debtor collection. */
export async function getSundryDebtorSettings(companyId) {
    const fromFeatures = (await getCompanyFeatureSettings(companyId))?.customer
        || DEFAULT_COMPANY_FEATURE_SETTINGS.customer;
    const legacy = await SundryDebtorSettings.findOne({ companyId }).lean();
    if (!legacy) {
        return mergeSettings(fromFeatures);
    }
    const { _id, companyId: cid, createdAt, updatedAt, updatedBy, __v, ...flags } = legacy;
    return mergeSettings(deepMerge(fromFeatures, flags));
}

/** Write customer credit flags into company feature settings (all industries). */
export async function saveSundryDebtorSettings(companyId, payload, userId) {
    const customerPatch = {};
    for (const key of Object.keys(DEFAULT_SUNDRY_DEBTOR_SETTINGS)) {
        if (payload[key] !== undefined) {
            customerPatch[key] = !!payload[key];
        }
    }
    await updateCompanyFeatureSettings(companyId, { customer: customerPatch }, userId);
    return getSundryDebtorSettings(companyId);
}
