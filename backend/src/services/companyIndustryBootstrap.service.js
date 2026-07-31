import { Company } from '../models/company.model.js';
import { DEFAULT_JSK_INDUSTRY_CONFIG } from '../constants/industryTemplates.defaults.js';
import {
    applyJskProtectedCommunicationFlags,
    ensureProtectedModuleCodes,
} from '../constants/protectedCrmModules.constants.js';
import { mergeIndustryConfig } from './productionTemplate.service.js';
import { clearModuleGuardCache } from './moduleGuard.service.js';


export function isJskUrjaCompany(company) {
    if (!company) return false;
    if (company.isDefault === true) return true;
    const name = `${company.companyName || ''} ${company.brandName || ''} ${company.legalName || ''}`.toUpperCase();
    if (name.includes('JSK') && (name.includes('URJA') || name.includes('INNOVATIVE'))) return true;
    return false;
}

/**
 * Ensures default industry metadata is present for JSK default company (no data migration).
 * Also permanently re-enables protected WhatsApp Communication / AI / Settings flags
 * and module allocation for JSK URJA (never deletes WhatsApp data or sessions).
 */
export async function ensureJskIndustryDefaults(companyId, settingsDoc) {
    if (!companyId || !settingsDoc) return settingsDoc;

    const company = await Company.findById(companyId)
        .select('companyName brandName legalName isDefault enabledModules');
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

    const prevComm = JSON.stringify(settingsDoc.settings?.communication || {});
    settingsDoc.settings = settingsDoc.settings || {};
    settingsDoc.settings = applyJskProtectedCommunicationFlags(settingsDoc.settings);
    const commChanged = JSON.stringify(settingsDoc.settings.communication || {}) !== prevComm;

    const needsIndustrySave =
        !current.industryTemplate
        || !current.productionProcessTemplate
        || !current.behaviorMode;

    if (needsIndustrySave) {
        settingsDoc.settings.industry = merged;
    }

    if (needsIndustrySave || commChanged) {
        await settingsDoc.save();
    }

    // Keep protected WhatsApp module codes allocated for JSK (additive only).
    const nextModules = ensureProtectedModuleCodes(company.enabledModules || []);
    const modulesChanged = nextModules.length !== (company.enabledModules || []).length
        || nextModules.some((c) => !(company.enabledModules || []).includes(c));
    if (modulesChanged) {
        company.enabledModules = nextModules;
        await company.save();
        clearModuleGuardCache(companyId);
    }

    return settingsDoc;
}
