import mongoose from 'mongoose';
import { Company } from '../models/company.model.js';
import { IndustryTemplate } from '../models/industryTemplate.model.js';
import { getIndustryModuleDefaults, normalizeIndustryTemplateCode } from '../constants/industryModuleDefaults.js';
import { ALL_MODULE_CODES } from '../constants/moduleRegistry.constants.js';
import { PHASE2_PILOT_MODULE_KEYS, moduleStatesToMap } from '../constants/moduleState.constants.js';
import { resolveModuleState } from '../constants/moduleAccessDecision.constants.js';

const companyCache = new Map();
/** Company-scoped. Short TTL in development so Platform Admin saves / local tests refresh quickly. */
const CACHE_TTL_MS = process.env.NODE_ENV === 'development' ? 1_000 : 30_000;

/** Cache key always includes companyId — never share Handloom/JSK state. */
function cacheKey(companyId) {
    return `companyModules:${String(companyId)}`;
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
function isHandloomIdentityCompany(company) {
    if (!company) return false;
    const name = `${company.companyName || ''} ${company.brandName || ''} ${company.legalName || ''} ${company.clientCode || ''}`.toUpperCase();
    if (name.includes('JSK') && (name.includes('URJA') || name.includes('INNOVATIVE'))) return false;
    return /HANDLOOM|HETPL/.test(name) || /TEXTILE/.test(String(company.companyName || '').toUpperCase());
}

export function resolveEffectiveModules(company, template) {
    const templateCode = template?.templateCode || '';
    const templateDefaults = getIndustryModuleDefaults(templateCode);
    const templateModuleSettings = template?.templateSettings?.moduleSettings || {};
    const normCode = normalizeIndustryTemplateCode(templateCode);
    const handloomCo = isHandloomIdentityCompany(company) || normCode === 'TEXTILE_HANDLOOM';

    // JSK / legacy preservation: until admin explicitly configures allocation, allow all modules.
    // Handloom / TEXTILE companies never use this "allow all" path when mis-tagged as unconfigured
    // electronics — they need textile_* codes for Product Master / sidebar.
    if (!handloomCo && company?.moduleGuardEnabled !== true && company?.moduleAllocationConfigured !== true) {
        const moduleStates = Array.isArray(company?.moduleStates) ? company.moduleStates : [];
        const moduleStatesByKey = moduleStatesToMap(moduleStates);
        const enabledModules = ALL_MODULE_CODES.filter((code) => moduleStatesByKey[code]?.state !== 'OFF');
        for (const [code, entry] of Object.entries(moduleStatesByKey)) {
            if ((entry.state === 'ON' || entry.state === 'LOCKED') && !enabledModules.includes(code)) {
                enabledModules.push(code);
            }
        }
        return {
            moduleGuardEnabled: false,
            enabledModules,
            disabledModules: [],
            moduleStates,
            moduleStatesByKey,
        };
    }

    const moduleGuardEnabled = handloomCo
        || company?.moduleGuardEnabled === true
        || company?.moduleAllocationConfigured === true
        || templateModuleSettings.enforceModuleGuard === true;

    const textileDefaults = getIndustryModuleDefaults('TEXTILE')?.enabledModules || [];
    const fromTemplate = templateModuleSettings.enabledModules?.length
        ? templateModuleSettings.enabledModules
        : (handloomCo ? textileDefaults : templateDefaults?.enabledModules);
    const fromCompany = company?.enabledModules?.length ? company.enabledModules : null;
    let base = fromCompany || fromTemplate || (handloomCo ? textileDefaults : [...ALL_MODULE_CODES]);

    // Handloom live bug: allocation saved without textile_* (or electronics list) while guard is on.
    if (handloomCo && textileDefaults.length && !base.includes('textile_product_master')) {
        base = [...new Set([...base, ...textileDefaults])];
    }

    const disabled = new Set([
        ...(company?.disabledModules || []),
        ...(templateModuleSettings.disabledModules || []),
    ]);

    const enabledModules = [...new Set(base.filter((code) => !disabled.has(code)))];
    const moduleStates = Array.isArray(company?.moduleStates) ? company.moduleStates : [];
    const moduleStatesByKey = moduleStatesToMap(moduleStates);

    // Apply OFF from moduleStates into effective enabled list (visibility / binary compat).
    // LOCKED modules stay in enabledModules so menus remain visible.
    const enabledWithStates = enabledModules.filter((code) => {
        const st = moduleStatesByKey[code]?.state;
        if (st === 'OFF') return false;
        return true;
    });
    for (const [code, entry] of Object.entries(moduleStatesByKey)) {
        if ((entry.state === 'ON' || entry.state === 'LOCKED') && !enabledWithStates.includes(code)) {
            enabledWithStates.push(code);
        }
    }

    return {
        moduleGuardEnabled: !!moduleGuardEnabled,
        enabledModules: enabledWithStates,
        disabledModules: [...disabled],
        moduleStates,
        moduleStatesByKey,
    };
}

export async function loadCompanyModuleContext(companyId) {
    if (!companyId || !mongoose.Types.ObjectId.isValid(String(companyId))) {
        return {
            moduleGuardEnabled: false,
            enabledModules: [...ALL_MODULE_CODES],
            disabledModules: [],
            moduleStates: [],
            moduleStatesByKey: {},
            company: null,
            template: null,
        };
    }

    const cached = getCached(companyId);
    if (cached) return cached;

    const company = await Company.findById(companyId)
        .select('companyName brandName legalName isDefault enabledModules disabledModules moduleStates moduleGuardEnabled moduleAllocationConfigured industryTemplateRef clientCode deploymentConfig')
        .lean();

    let template = null;
    if (company?.industryTemplateRef) {
        template = await IndustryTemplate.findById(company.industryTemplateRef)
            .select('templateCode templateName templateSettings')
            .lean();
    }
    // Handloom-named companies must resolve TEXTILE before ELECTRONICS_JSK default.
    if ((!template || normalizeIndustryTemplateCode(template.templateCode) === 'ELECTRONICS_JSK')
        && isHandloomIdentityCompany(company)) {
        const textile = await IndustryTemplate.findOne({ templateCode: 'TEXTILE', isActive: true })
            .select('templateCode templateName templateSettings')
            .lean();
        if (textile) template = textile;
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
    const resolved = resolveModuleState({
        moduleGuardEnabled: ctx.moduleGuardEnabled,
        enabledModules: ctx.enabledModules,
        moduleStates: ctx.moduleStates,
        moduleCode: code,
    });
    return resolved.state !== 'OFF';
}

export async function assertModuleEnabled(companyId, moduleCode) {
    const ok = await isModuleEnabled(companyId, moduleCode);
    if (!ok) {
        const err = new Error(`Module disabled: ${moduleCode}`);
        err.statusCode = 403;
        throw err;
    }
}

/** Pilot module snapshot for /dev/active-context (safe fields only). */
export function buildPilotModuleContextSnapshot(ctx) {
    return PHASE2_PILOT_MODULE_KEYS.map((moduleKey) => {
        const resolved = resolveModuleState({
            moduleGuardEnabled: ctx?.moduleGuardEnabled,
            enabledModules: ctx?.enabledModules || [],
            moduleStates: ctx?.moduleStates || [],
            moduleCode: moduleKey,
        });
        return {
            moduleKey,
            state: resolved.state,
            lockMode: resolved.lockMode,
            source: resolved.source,
            lockReason: resolved.lockReason || '',
        };
    });
}
