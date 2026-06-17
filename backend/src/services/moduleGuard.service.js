import mongoose from 'mongoose';
import { Company } from '../models/company.model.js';
import { IndustryTemplate } from '../models/industryTemplate.model.js';
import { getIndustryModuleDefaults, normalizeIndustryTemplateCode } from '../constants/industryModuleDefaults.js';
import { ALL_MODULE_CODES } from '../constants/moduleRegistry.constants.js';

const companyCache = new Map();
const CACHE_TTL_MS = 30_000;

function cacheKey(companyId) {
    return String(companyId);
}

function getCached(companyId) {
    const hit = companyCache.get(cacheKey(companyId));
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
        companyCache.delete(cacheKey(companyId));
        return null;
    }
    return hit.data;
}

function setCached(companyId, data) {
    companyCache.set(cacheKey(companyId), { at: Date.now(), data });
}

export function clearModuleGuardCache(companyId) {
    if (companyId) companyCache.delete(cacheKey(companyId));
    else companyCache.clear();
}

export function isJskLegacyCompany(company, templateCode) {
    if (!company) return false;
    const code = normalizeIndustryTemplateCode(templateCode);
    if (code === 'ELECTRONICS_JSK' || company.isDefault === true) return true;
    const name = `${company.companyName || ''} ${company.brandName || ''} ${company.legalName || ''}`.toUpperCase();
    return name.includes('JSK') && (name.includes('URJA') || name.includes('INNOVATIVE'));
}

/**
 * Resolve effective enabled module codes for a company.
 * @returns {{ moduleGuardEnabled: boolean, enabledModules: string[], disabledModules: string[] }}
 */
export function resolveEffectiveModules(company, template) {
    const templateCode = template?.templateCode || '';
    const templateDefaults = getIndustryModuleDefaults(templateCode);
    const templateModuleSettings = template?.templateSettings?.moduleSettings || {};

    // JSK / legacy preservation: until admin explicitly configures allocation, allow all modules.
    if (company?.moduleGuardEnabled !== true && company?.moduleAllocationConfigured !== true) {
        return {
            moduleGuardEnabled: false,
            enabledModules: [...ALL_MODULE_CODES],
            disabledModules: [],
        };
    }

    const moduleGuardEnabled = company?.moduleGuardEnabled === true
        || company?.moduleAllocationConfigured === true
        || templateModuleSettings.enforceModuleGuard === true;

    const fromTemplate = templateModuleSettings.enabledModules?.length
        ? templateModuleSettings.enabledModules
        : templateDefaults?.enabledModules;
    const fromCompany = company?.enabledModules?.length ? company.enabledModules : null;
    const base = fromCompany || fromTemplate || [...ALL_MODULE_CODES];

    const disabled = new Set([
        ...(company?.disabledModules || []),
        ...(templateModuleSettings.disabledModules || []),
    ]);

    const enabledModules = [...new Set(base.filter((code) => !disabled.has(code)))];

    return {
        moduleGuardEnabled: true,
        enabledModules,
        disabledModules: [...disabled],
    };
}

export async function loadCompanyModuleContext(companyId) {
    if (!companyId || !mongoose.Types.ObjectId.isValid(String(companyId))) {
        return {
            moduleGuardEnabled: false,
            enabledModules: [...ALL_MODULE_CODES],
            disabledModules: [],
            company: null,
            template: null,
        };
    }

    const cached = getCached(companyId);
    if (cached) return cached;

    const company = await Company.findById(companyId)
        .select('companyName brandName legalName isDefault enabledModules disabledModules moduleGuardEnabled moduleAllocationConfigured industryTemplateRef clientCode deploymentConfig')
        .lean();

    let template = null;
    if (company?.industryTemplateRef) {
        template = await IndustryTemplate.findById(company.industryTemplateRef)
            .select('templateCode templateName templateSettings')
            .lean();
    }
    if (!template) {
        template = await IndustryTemplate.findOne({ isDefaultTemplate: true, isActive: true })
            .select('templateCode templateName templateSettings')
            .lean();
    }

    const resolved = resolveEffectiveModules(company, template);
    const data = { ...resolved, company, template };
    setCached(companyId, data);
    return data;
}

/**
 * Common guard: is a module enabled for this company?
 * When moduleGuardEnabled is false (JSK legacy), always returns true.
 */
export async function isModuleEnabled(companyId, moduleCode) {
    const code = String(moduleCode || '').trim().toLowerCase();
    if (!code) return false;

    const ctx = await loadCompanyModuleContext(companyId);
    if (!ctx.moduleGuardEnabled) return true;
    return ctx.enabledModules.includes(code);
}

export async function assertModuleEnabled(companyId, moduleCode) {
    const ok = await isModuleEnabled(companyId, moduleCode);
    if (!ok) {
        const err = new Error(`Module disabled: ${moduleCode}`);
        err.statusCode = 403;
        throw err;
    }
}
