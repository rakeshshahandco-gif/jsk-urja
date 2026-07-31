/**
 * Canonical Data Extractor company enablement.
 * Company Module Allocation (enabledModules / moduleStates) is the master ON/OFF switch.
 * ExtractorSettings.moduleEnabled is kept in sync for UI/API compatibility and must not
 * silently block an allocated company via a default-OFF settings flag.
 */
import mongoose from 'mongoose';
import { ExtractorSettings } from '../../models/extractorSettings.model.js';
import { ApiError } from '../../utils/ApiError.js';
import {
    clearModuleGuardCache,
    isModuleEnabled,
    loadCompanyModuleContext,
} from '../moduleGuard.service.js';
import { resolveModuleState } from '../../constants/moduleAccessDecision.constants.js';
import { MODULE_STATE } from '../../constants/moduleState.constants.js';

export const DATA_EXTRACTOR_MODULE_CODE = 'data_extractor';

/** Accepted aliases that may appear in older UIs or docs. */
const DATA_EXTRACTOR_ALIASES = new Set([
    'data_extractor',
    'dataextractor',
    'data-extractor',
    'market_finder',
    'marketfinder',
    'market-finder',
    'extractor',
]);

export function normalizeDataExtractorModuleKey(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
}

export function isDataExtractorModuleKey(raw) {
    const n = normalizeDataExtractorModuleKey(raw);
    if (!n) return false;
    if (DATA_EXTRACTOR_ALIASES.has(n)) return true;
    const compact = n.replace(/_/g, '');
    return compact === 'dataextractor' || compact === 'marketfinder';
}

function listHasDataExtractor(modules = []) {
    return (modules || []).some((m) => isDataExtractorModuleKey(m));
}

/**
 * Master allocation check for Data Extractor / Market Finder.
 * @returns {Promise<{ enabled: boolean, reason: string, source: string, companyId: string }>}
 */
export async function getDataExtractorEnablement(companyId) {
    if (!companyId || !mongoose.Types.ObjectId.isValid(String(companyId))) {
        return {
            enabled: false,
            reason: 'invalid_company',
            source: 'validation',
            companyId: String(companyId || ''),
        };
    }

    const ctx = await loadCompanyModuleContext(companyId);
    const enabledModules = ctx.enabledModules || [];
    const rawCompanyModules = ctx.company?.enabledModules || [];
    const moduleStates = ctx.moduleStates || [];
    const moduleGuardEnabled = !!ctx.moduleGuardEnabled;

    const resolved = resolveModuleState({
        moduleGuardEnabled,
        enabledModules,
        moduleStates,
        moduleCode: DATA_EXTRACTOR_MODULE_CODE,
    });

    // Explicit moduleStates OFF for data_extractor wins.
    if (resolved.state === MODULE_STATE.OFF && resolved.source === 'moduleStates') {
        return {
            enabled: false,
            reason: 'module_state_off',
            source: resolved.source,
            companyId: String(companyId),
        };
    }

    // Explicit presence in allocation list (including aliases on filtered or raw company record)
    if (listHasDataExtractor(enabledModules) || listHasDataExtractor(rawCompanyModules)) {
        return {
            enabled: true,
            reason: 'allocated',
            source: 'enabledModules',
            companyId: String(companyId),
        };
    }

    if (resolved.state === MODULE_STATE.OFF) {
        return {
            enabled: false,
            reason: 'module_state_off',
            source: resolved.source,
            companyId: String(companyId),
        };
    }

    // Guard on and not in list → OFF
    if (moduleGuardEnabled) {
        const ok = await isModuleEnabled(companyId, DATA_EXTRACTOR_MODULE_CODE);
        return {
            enabled: ok,
            reason: ok ? 'module_guard_on' : 'not_allocated',
            source: resolved.source,
            companyId: String(companyId),
        };
    }

    // Guard off: if the company has an allocation list at all, require data_extractor in it.
    // Pure legacy empty/unconfigured lists keep previous open behaviour via isModuleEnabled.
    const company = ctx.company;
    const allocationConfigured = company?.moduleAllocationConfigured === true
        || (Array.isArray(company?.enabledModules) && company.enabledModules.length > 0);

    if (allocationConfigured) {
        return {
            enabled: false,
            reason: 'not_in_enabledModules',
            source: 'enabledModules_absent',
            companyId: String(companyId),
        };
    }

    const legacyOk = await isModuleEnabled(companyId, DATA_EXTRACTOR_MODULE_CODE);
    return {
        enabled: legacyOk,
        reason: legacyOk ? 'legacy_guard_off' : 'legacy_blocked',
        source: resolved.source,
        companyId: String(companyId),
    };
}

export async function isDataExtractorEnabledForCompany(companyId) {
    const result = await getDataExtractorEnablement(companyId);
    return result.enabled === true;
}

/**
 * Keep ExtractorSettings.moduleEnabled aligned with Company Module Allocation.
 * Does not wipe other settings fields. Does not touch CRM leads or campaigns.
 */
export async function syncExtractorSettingsWithAllocation(companyId, { userId = null } = {}) {
    const enablement = await getDataExtractorEnablement(companyId);
    const desired = enablement.enabled === true;

    let settings = await ExtractorSettings.findOne({ companyId });
    if (!settings) {
        settings = await ExtractorSettings.create({
            companyId,
            moduleEnabled: desired,
            ...(userId ? { updatedBy: userId } : {}),
        });
        return settings.toObject ? settings.toObject() : settings;
    }

    if (settings.moduleEnabled !== desired) {
        settings.moduleEnabled = desired;
        if (userId) settings.updatedBy = userId;
        await settings.save();
    }

    return settings.toObject ? settings.toObject() : settings;
}

export async function assertDataExtractorEnabledForCompany(companyId) {
    const enablement = await getDataExtractorEnablement(companyId);
    if (!enablement.enabled) {
        throw new ApiError(
            403,
            'Data Extractor module is not enabled for this company. Enable it in Super Admin → Company Module Allocation.',
        );
    }
    // Ensure settings row exists and mirrors allocation (safe defaults).
    const settings = await syncExtractorSettingsWithAllocation(companyId);
    return { enablement, settings };
}

/** Call after Company Module Allocation saves. */
export async function onCompanyDataExtractorAllocationChanged(companyId, userId = null) {
    clearModuleGuardCache(companyId);
    return syncExtractorSettingsWithAllocation(companyId, { userId });
}
