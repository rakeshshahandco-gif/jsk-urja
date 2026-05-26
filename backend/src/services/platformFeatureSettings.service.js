import { PlatformFeatureSettings } from '../models/platformFeatureSettings.model.js';
import { CompanyFeatureSettings } from '../models/companyFeatureSettings.model.js';
import { Company } from '../models/company.model.js';
import { deepMerge, mergeFeatureSettings } from './companyFeatureSettings.service.js';

const GLOBAL_KEY = 'global';

export async function getPlatformFeatureSettingsDoc() {
    let doc = await PlatformFeatureSettings.findOne({ key: GLOBAL_KEY });
    if (!doc) {
        doc = await PlatformFeatureSettings.create({ key: GLOBAL_KEY, settings: {} });
    }
    return doc;
}

/** Stored platform overrides only (not merged with code defaults). */
export async function getPlatformFeatureSettingsRaw() {
    const doc = await getPlatformFeatureSettingsDoc();
    return doc.settings || {};
}

/** Effective platform defaults (code + platform DB). */
export async function getPlatformFeatureSettings() {
    const raw = await getPlatformFeatureSettingsRaw();
    return mergeFeatureSettings(null, raw);
}

function stripIndustry(patch) {
    if (!patch || typeof patch !== 'object') return patch;
    const { industry, ...rest } = patch;
    return rest;
}

export async function updatePlatformFeatureSettings(patch, userId) {
    const doc = await getPlatformFeatureSettingsDoc();
    doc.settings = deepMerge(doc.settings || {}, stripIndustry(patch));
    if (userId) doc.updatedBy = userId;
    await doc.save();
    return mergeFeatureSettings(null, doc.settings);
}

/**
 * Push platform defaults to every company (keeps each company's industry block).
 */
export async function applyPlatformDefaultsToAllCompanies(userId) {
    const platformRaw = await getPlatformFeatureSettingsRaw();
    const companies = await Company.find({ isActive: { $ne: false } }).select('_id');
    let updated = 0;

    for (const c of companies) {
        let doc = await CompanyFeatureSettings.findOne({ companyId: c._id });
        const industry = doc?.settings?.industry;
        const next = deepMerge(platformRaw, industry ? { industry } : {});
        if (!doc) {
            doc = await CompanyFeatureSettings.create({
                companyId: c._id,
                settings: next,
                updatedBy: userId,
            });
        } else {
            doc.settings = next;
            if (userId) doc.updatedBy = userId;
            await doc.save();
        }
        updated += 1;
    }

    return { updated, settings: await getPlatformFeatureSettings() };
}
