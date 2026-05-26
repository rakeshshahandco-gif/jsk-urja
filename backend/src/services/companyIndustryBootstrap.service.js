import { Company } from '../models/company.model.js';
import { DEFAULT_JSK_INDUSTRY_CONFIG } from '../constants/industryTemplates.defaults.js';
import { mergeIndustryConfig } from './productionTemplate.service.js';


export function isJskUrjaCompany(company) {
    if (!company) return false;
    if (company.isDefault === true) return true;
    const name = `${company.companyName || ''} ${company.brandName || ''} ${company.legalName || ''}`.toUpperCase();
    if (name.includes('JSK') && (name.includes('URJA') || name.includes('INNOVATIVE'))) return true;
    return false;
}

/**
 * Ensures default industry metadata is present for JSK default company (no data migration).
 * Only patches missing industry keys on feature settings document when needed.
 */
export async function ensureJskIndustryDefaults(companyId, settingsDoc) {
    if (!companyId || !settingsDoc) return settingsDoc;

    const company = await Company.findById(companyId)
        .select('companyName brandName legalName isDefault')
        .lean();
    if (!isJskUrjaCompany(company)) return settingsDoc;

    const current = settingsDoc.settings?.industry || {};
    const merged = mergeIndustryConfig({
        ...DEFAULT_JSK_INDUSTRY_CONFIG,
        companyDisplayName: current.companyDisplayName || DEFAULT_JSK_INDUSTRY_CONFIG.companyDisplayName,
        industryTemplate: current.industryTemplate || DEFAULT_JSK_INDUSTRY_CONFIG.industryTemplate,
        productionProcessTemplate:
            current.productionProcessTemplate || DEFAULT_JSK_INDUSTRY_CONFIG.productionProcessTemplate,
        behaviorMode: current.behaviorMode || DEFAULT_JSK_INDUSTRY_CONFIG.behaviorMode,
    });

    const needsSave =
        !current.industryTemplate
        || !current.productionProcessTemplate
        || !current.behaviorMode;

    if (needsSave) {
        settingsDoc.settings = settingsDoc.settings || {};
        settingsDoc.settings.industry = merged;
        await settingsDoc.save();
    }

    return settingsDoc;
}
