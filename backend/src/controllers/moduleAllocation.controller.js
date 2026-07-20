import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { Company } from '../models/company.model.js';
import { IndustryTemplate } from '../models/industryTemplate.model.js';
import { AuditLog } from '../models/auditLog.model.js';
import { normalizeLoginSlug } from '../utils/loginSlug.utils.js';
import {
    clearModuleGuardCache,
    loadCompanyModuleContext,
    resolveEffectiveModules,
} from '../services/moduleGuard.service.js';
import { getIndustryModuleDefaults } from '../constants/industryModuleDefaults.js';
import { ALL_MODULE_CODES, MODULE_REGISTRY } from '../constants/moduleRegistry.constants.js';
import { canUserAccessCompany } from '../services/companyUserAccess.service.js';
import { isPlatformAdminUser } from '../constants/platformAccess.constants.js';
import {
    MODULE_STATE,
    MODULE_LOCK_MODE,
    MODULE_STATE_VALUES,
    MODULE_LOCK_MODE_VALUES,
    PHASE2_PILOT_MODULE_KEYS,
    isPilotModuleKey,
    moduleStatesToMap,
} from '../constants/moduleState.constants.js';
import { resolveModuleState } from '../constants/moduleAccessDecision.constants.js';

const MODULE_STATE_AUDIT_CAP = 100;

function normalizeModuleStatesPayload(rawList, { user }) {
    if (!Array.isArray(rawList)) return null;
    const now = new Date();
    const next = [];
    for (const raw of rawList) {
        const moduleKey = String(raw?.moduleKey || '').trim().toLowerCase();
        if (!moduleKey) continue;
        if (!isPilotModuleKey(moduleKey)) {
            throw new ApiError(
                400,
                `Module state updates are limited to Phase 2 pilot modules: ${PHASE2_PILOT_MODULE_KEYS.join(', ')}`,
            );
        }
        const state = String(raw?.state || '').trim().toUpperCase();
        if (!MODULE_STATE_VALUES.includes(state)) {
            throw new ApiError(400, `Invalid module state for ${moduleKey}. Use ON, LOCKED, or OFF.`);
        }
        let lockMode = raw?.lockMode ? String(raw.lockMode).trim().toUpperCase() : null;
        if (state === MODULE_STATE.LOCKED) {
            if (!lockMode) lockMode = MODULE_LOCK_MODE.READ_ONLY;
            if (!MODULE_LOCK_MODE_VALUES.includes(lockMode)) {
                throw new ApiError(400, `Invalid lockMode for ${moduleKey}. Use READ_ONLY, NEW_ENTRY_BLOCKED, or FULL_LOCK.`);
            }
        } else {
            lockMode = null;
        }
        next.push({
            moduleKey,
            state,
            lockMode,
            lockReason: String(raw?.lockReason || '').trim().slice(0, 500),
            remarks: String(raw?.remarks || '').trim().slice(0, 1000),
            changedBy: user?._id || null,
            changedAt: now,
        });
    }
    return next;
}

function syncEnabledModulesFromStates(company, stateEntries) {
    let enabled = [...new Set((company.enabledModules || []).map((m) => String(m).toLowerCase()))];
    let disabled = [...new Set((company.disabledModules || []).map((m) => String(m).toLowerCase()))];
    for (const entry of stateEntries) {
        if (entry.state === MODULE_STATE.OFF) {
            enabled = enabled.filter((m) => m !== entry.moduleKey);
            if (!disabled.includes(entry.moduleKey)) disabled.push(entry.moduleKey);
        } else {
            if (!enabled.includes(entry.moduleKey)) enabled.push(entry.moduleKey);
            disabled = disabled.filter((m) => m !== entry.moduleKey);
        }
    }
    company.enabledModules = enabled;
    company.disabledModules = disabled;
}

export const getModuleRegistry = asyncHandler(async (req, res) => {
    res.status(200).json(new ApiResponse(200, {
        modules: MODULE_REGISTRY,
        allCodes: ALL_MODULE_CODES,
        phase2PilotModules: PHASE2_PILOT_MODULE_KEYS,
        moduleStates: MODULE_STATE_VALUES,
        lockModes: MODULE_LOCK_MODE_VALUES,
    }, 'Module registry'));
});

export const getCompanyModuleAllocation = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
        throw new ApiError(400, 'Invalid company id');
    }
    const company = await Company.findById(companyId)
        .populate('industryTemplateRef', 'templateName templateCode templateSettings')
        .populate('moduleStates.changedBy', 'name username email')
        .lean();
    if (!company) throw new ApiError(404, 'Company not found');

    const ctx = await loadCompanyModuleContext(companyId);
    const resolvedPilot = PHASE2_PILOT_MODULE_KEYS.map((moduleKey) => {
        const resolved = resolveModuleState({
            moduleGuardEnabled: ctx.moduleGuardEnabled,
            enabledModules: ctx.enabledModules,
            moduleStates: ctx.moduleStates,
            moduleCode: moduleKey,
        });
        const stored = (company.moduleStates || []).find((e) => String(e.moduleKey).toLowerCase() === moduleKey);
        return {
            moduleKey,
            state: resolved.state,
            lockMode: resolved.lockMode,
            source: resolved.source,
            lockReason: stored?.lockReason || resolved.lockReason || '',
            remarks: stored?.remarks || '',
            changedBy: stored?.changedBy || null,
            changedAt: stored?.changedAt || null,
        };
    });

    res.status(200).json(new ApiResponse(200, {
        company: {
            _id: company._id,
            companyName: company.companyName,
            clientCode: company.clientCode || '',
            loginSlug: company.loginSlug || '',
            loginTagline: company.loginTagline || '',
            loginPrimaryColor: company.loginPrimaryColor || '',
            industryTemplateRef: company.industryTemplateRef,
            enabledModules: company.enabledModules || [],
            disabledModules: company.disabledModules || [],
            moduleStates: company.moduleStates || [],
            moduleGuardEnabled: company.moduleGuardEnabled === true,
            moduleAllocationConfigured: company.moduleAllocationConfigured === true,
            configurationLocked: company.configurationLocked === true,
            configurationLockedAt: company.configurationLockedAt || null,
            configurationLockedBy: company.configurationLockedBy || null,
            configurationLockReason: company.configurationLockReason || '',
            deploymentConfig: company.deploymentConfig || {},
        },
        effective: {
            moduleGuardEnabled: ctx.moduleGuardEnabled,
            enabledModules: ctx.enabledModules,
            disabledModules: ctx.disabledModules,
            moduleStates: ctx.moduleStates || [],
            resolvedPilotModules: resolvedPilot,
        },
        templateModuleSettings: company.industryTemplateRef?.templateSettings?.moduleSettings || {},
    }, 'Company module allocation'));
});

/** Read-only effective modules for logged-in company users (module guard sidebar). */
export const getMyCompanyModuleEffective = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
        throw new ApiError(400, 'Invalid company id');
    }
    if (!isPlatformAdminUser(req.user) && !canUserAccessCompany(req.user, companyId)) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Access denied for this company');
    }
    const ctx = await loadCompanyModuleContext(companyId);
    const resolvedPilot = PHASE2_PILOT_MODULE_KEYS.map((moduleKey) => {
        const resolved = resolveModuleState({
            moduleGuardEnabled: ctx.moduleGuardEnabled,
            enabledModules: ctx.enabledModules,
            moduleStates: ctx.moduleStates,
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
    res.status(200).json(new ApiResponse(200, {
        effective: {
            moduleGuardEnabled: ctx.moduleGuardEnabled,
            enabledModules: ctx.enabledModules,
            disabledModules: ctx.disabledModules,
            moduleStates: ctx.moduleStates || [],
            resolvedPilotModules: resolvedPilot,
        },
        templateCode: ctx.template?.templateCode || null,
    }, 'Effective company modules'));
});

export const updateCompanyModuleAllocation = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
        throw new ApiError(400, 'Invalid company id');
    }

    if (!isPlatformAdminUser(req.user)) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Only Platform Admin may change company module allocation');
    }

    const company = await Company.findById(companyId);
    if (!company) throw new ApiError(404, 'Company not found');

    if (company.configurationLocked === true) {
        throw new ApiError(
            httpStatus.FORBIDDEN,
            'Company configuration is locked. Unlock as Super Admin before changing industry template, modules, branding, or deployment mapping.',
        );
    }

    const {
        enabledModules,
        disabledModules,
        moduleGuardEnabled,
        moduleAllocationConfigured,
        clientCode,
        loginSlug,
        loginTagline,
        loginPrimaryColor,
        industryTemplateRef,
        deploymentConfig,
        applyTemplateDefaults,
        moduleStates: moduleStatesBody,
    } = req.body || {};

    if (industryTemplateRef !== undefined) {
        if (!industryTemplateRef) {
            company.industryTemplateRef = null;
        } else if (!mongoose.Types.ObjectId.isValid(String(industryTemplateRef))) {
            throw new ApiError(400, 'Invalid industry template id');
        } else {
            const tpl = await IndustryTemplate.findById(industryTemplateRef).lean();
            if (!tpl || !tpl.isActive) throw new ApiError(400, 'Industry template not found or inactive');
            company.industryTemplateRef = tpl._id;
        }
    }

    if (applyTemplateDefaults && company.industryTemplateRef) {
        const tpl = await IndustryTemplate.findById(company.industryTemplateRef).lean();
        const defaults = getIndustryModuleDefaults(tpl?.templateCode);
        const templateModules = tpl?.templateSettings?.moduleSettings?.enabledModules;
        if (templateModules?.length) {
            company.enabledModules = [...templateModules];
        } else if (defaults?.enabledModules?.length) {
            company.enabledModules = [...defaults.enabledModules];
        }
        if (defaults?.enforceModuleGuard && moduleGuardEnabled === undefined) {
            company.moduleGuardEnabled = true;
        }
    }

    if (Array.isArray(enabledModules)) {
        company.enabledModules = [...new Set(enabledModules.map((m) => String(m).trim().toLowerCase()).filter(Boolean))];
    }
    if (Array.isArray(disabledModules)) {
        company.disabledModules = [...new Set(disabledModules.map((m) => String(m).trim().toLowerCase()).filter(Boolean))];
    }
    if (typeof moduleGuardEnabled === 'boolean') {
        company.moduleGuardEnabled = moduleGuardEnabled;
    }
    if (typeof moduleAllocationConfigured === 'boolean') {
        company.moduleAllocationConfigured = moduleAllocationConfigured;
    }
    if (clientCode !== undefined) {
        company.clientCode = String(clientCode || '').trim();
    }
    if (loginSlug !== undefined) {
        company.loginSlug = normalizeLoginSlug(loginSlug);
    }
    if (loginTagline !== undefined) {
        company.loginTagline = String(loginTagline || '').trim();
    }
    if (loginPrimaryColor !== undefined) {
        company.loginPrimaryColor = String(loginPrimaryColor || '').trim();
    }
    if (deploymentConfig && typeof deploymentConfig === 'object') {
        company.deploymentConfig = {
            ...(company.deploymentConfig?.toObject?.() || company.deploymentConfig || {}),
            ...deploymentConfig,
        };
    }

    const previousMap = moduleStatesToMap(company.moduleStates || []);
    const normalizedStates = normalizeModuleStatesPayload(moduleStatesBody, {
        user: req.user,
    });

    if (normalizedStates) {
        const byKey = { ...previousMap };
        const auditRows = [];
        for (const entry of normalizedStates) {
            const prev = byKey[entry.moduleKey];
            const prevState = prev?.state || '';
            const prevLock = prev?.lockMode || '';
            const changed = prevState !== entry.state
                || prevLock !== (entry.lockMode || '')
                || (prev?.lockReason || '') !== entry.lockReason
                || (prev?.remarks || '') !== entry.remarks;

            byKey[entry.moduleKey] = {
                moduleKey: entry.moduleKey,
                state: entry.state,
                lockMode: entry.lockMode,
                lockReason: entry.lockReason,
                remarks: entry.remarks,
                changedBy: entry.changedBy,
                changedAt: entry.changedAt,
            };

            if (changed) {
                auditRows.push({
                    moduleKey: entry.moduleKey,
                    previousState: prevState,
                    newState: entry.state,
                    previousLockMode: prevLock,
                    newLockMode: entry.lockMode || '',
                    lockReason: entry.lockReason,
                    remarks: entry.remarks,
                    changedBy: req.user?._id || null,
                    changedByName: req.user?.name || req.user?.username || '',
                    changedAt: entry.changedAt,
                });
            }
        }

        company.moduleStates = Object.values(byKey).map((e) => ({
            moduleKey: e.moduleKey,
            state: e.state,
            lockMode: e.lockMode,
            lockReason: e.lockReason,
            remarks: e.remarks,
            changedBy: e.changedBy,
            changedAt: e.changedAt,
        }));

        syncEnabledModulesFromStates(company, normalizedStates);

        if (auditRows.length) {
            const existing = Array.isArray(company.moduleStateAudit) ? [...company.moduleStateAudit] : [];
            company.moduleStateAudit = [...existing, ...auditRows].slice(-MODULE_STATE_AUDIT_CAP);

            try {
                for (const row of auditRows) {
                    await AuditLog.create({
                        user: req.user._id,
                        action: 'UPDATE',
                        module: 'module_allocation',
                        resourceId: company._id,
                        description: `Module ${row.moduleKey}: ${row.previousState || '(none)'} → ${row.newState}`,
                        details: {
                            companyId: String(company._id),
                            moduleKey: row.moduleKey,
                            previousState: row.previousState,
                            newState: row.newState,
                            previousLockMode: row.previousLockMode,
                            newLockMode: row.newLockMode,
                            lockReason: row.lockReason,
                            remarks: row.remarks,
                            changedBy: String(req.user._id),
                            changedAt: row.changedAt,
                        },
                        ipAddress: req.ip,
                        userAgent: req.get?.('user-agent') || '',
                    });
                }
            } catch {
                // AuditLog must not block allocation save
            }
        }
    }

    company.updatedBy = req.user?._id;
    await company.save();
    clearModuleGuardCache(companyId);

    const template = company.industryTemplateRef
        ? await IndustryTemplate.findById(company.industryTemplateRef).select('templateCode templateSettings').lean()
        : null;
    const effective = resolveEffectiveModules(company.toObject(), template);

    res.status(200).json(new ApiResponse(200, {
        company,
        effective,
    }, 'Company module allocation updated'));
});

export const checkModuleEnabled = asyncHandler(async (req, res) => {
    const { companyId, moduleCode } = req.params;
    const ctx = await loadCompanyModuleContext(companyId);
    const code = String(moduleCode || '').trim().toLowerCase();
    const resolved = resolveModuleState({
        moduleGuardEnabled: ctx.moduleGuardEnabled,
        enabledModules: ctx.enabledModules,
        moduleStates: ctx.moduleStates,
        moduleCode: code,
    });
    const enabled = resolved.state !== MODULE_STATE.OFF;
    res.status(200).json(new ApiResponse(200, {
        moduleCode: code,
        enabled,
        state: resolved.state,
        lockMode: resolved.lockMode,
        source: resolved.source,
        moduleGuardEnabled: ctx.moduleGuardEnabled,
    }, 'Module check'));
});

export const updateIndustryTemplateModules = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, 'Invalid template id');

    const template = await IndustryTemplate.findById(id);
    if (!template) throw new ApiError(404, 'Industry template not found');

    const { moduleSettings } = req.body || {};
    if (!moduleSettings || typeof moduleSettings !== 'object') {
        throw new ApiError(400, 'moduleSettings object is required');
    }

    template.templateSettings = template.templateSettings || {};
    template.templateSettings.moduleSettings = {
        ...(template.templateSettings.moduleSettings || {}),
        ...moduleSettings,
    };
    if (Array.isArray(moduleSettings.enabledModules)) {
        template.templateSettings.moduleSettings.enabledModules = [
            ...new Set(moduleSettings.enabledModules.map((m) => String(m).trim().toLowerCase()).filter(Boolean)),
        ];
    }
    if (Array.isArray(moduleSettings.disabledModules)) {
        template.templateSettings.moduleSettings.disabledModules = [
            ...new Set(moduleSettings.disabledModules.map((m) => String(m).trim().toLowerCase()).filter(Boolean)),
        ];
    }

    template.updatedBy = req.user?._id;
    await template.save();

    res.status(200).json(new ApiResponse(200, template, 'Industry template module settings updated'));
});

function appendLockHistory(company, action, user, reason) {
    const entry = {
        action,
        at: new Date(),
        by: user?._id || null,
        byName: String(user?.name || user?.email || '').trim(),
        reason: String(reason || '').trim(),
    };
    const hist = Array.isArray(company.configurationLockHistory) ? company.configurationLockHistory : [];
    hist.push(entry);
    company.configurationLockHistory = hist.slice(-50);
}

export const lockCompanyConfiguration = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) throw new ApiError(400, 'Invalid company id');
    const company = await Company.findById(companyId);
    if (!company) throw new ApiError(404, 'Company not found');

    const reason = String(req.body?.reason || req.body?.lockReason || 'Company configuration locked by Super Admin').trim();
    company.configurationLocked = true;
    company.configurationLockedAt = new Date();
    company.configurationLockedBy = req.user?._id || null;
    company.configurationLockReason = reason;
    appendLockHistory(company, 'lock', req.user, reason);
    company.updatedBy = req.user?._id;
    await company.save();
    clearModuleGuardCache(companyId);

    res.status(200).json(new ApiResponse(200, {
        companyId: company._id,
        configurationLocked: true,
        configurationLockedAt: company.configurationLockedAt,
        configurationLockReason: company.configurationLockReason,
    }, 'Company configuration locked'));
});

export const unlockCompanyConfiguration = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) throw new ApiError(400, 'Invalid company id');
    const company = await Company.findById(companyId);
    if (!company) throw new ApiError(404, 'Company not found');

    const reason = String(req.body?.reason || req.body?.lockReason || 'Unlocked by Super Admin').trim();
    company.configurationLocked = false;
    company.configurationLockedAt = null;
    company.configurationLockedBy = null;
    company.configurationLockReason = '';
    appendLockHistory(company, 'unlock', req.user, reason);
    company.updatedBy = req.user?._id;
    await company.save();
    clearModuleGuardCache(companyId);

    res.status(200).json(new ApiResponse(200, {
        companyId: company._id,
        configurationLocked: false,
    }, 'Company configuration unlocked'));
});
