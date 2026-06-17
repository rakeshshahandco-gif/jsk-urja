import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { Company } from '../models/company.model.js';
import { IndustryTemplate } from '../models/industryTemplate.model.js';
import {
    clearModuleGuardCache,
    loadCompanyModuleContext,
    resolveEffectiveModules,
} from '../services/moduleGuard.service.js';
import { getIndustryModuleDefaults } from '../constants/industryModuleDefaults.js';
import { ALL_MODULE_CODES, MODULE_REGISTRY } from '../constants/moduleRegistry.constants.js';

export const getModuleRegistry = asyncHandler(async (req, res) => {
    res.status(200).json(new ApiResponse(200, {
        modules: MODULE_REGISTRY,
        allCodes: ALL_MODULE_CODES,
    }, 'Module registry'));
});

export const getCompanyModuleAllocation = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
        throw new ApiError(400, 'Invalid company id');
    }
    const company = await Company.findById(companyId)
        .populate('industryTemplateRef', 'templateName templateCode templateSettings')
        .lean();
    if (!company) throw new ApiError(404, 'Company not found');

    const ctx = await loadCompanyModuleContext(companyId);
    res.status(200).json(new ApiResponse(200, {
        company: {
            _id: company._id,
            companyName: company.companyName,
            clientCode: company.clientCode || '',
            industryTemplateRef: company.industryTemplateRef,
            enabledModules: company.enabledModules || [],
            disabledModules: company.disabledModules || [],
            moduleGuardEnabled: company.moduleGuardEnabled === true,
            moduleAllocationConfigured: company.moduleAllocationConfigured === true,
            deploymentConfig: company.deploymentConfig || {},
        },
        effective: {
            moduleGuardEnabled: ctx.moduleGuardEnabled,
            enabledModules: ctx.enabledModules,
            disabledModules: ctx.disabledModules,
        },
        templateModuleSettings: company.industryTemplateRef?.templateSettings?.moduleSettings || {},
    }, 'Company module allocation'));
});

export const updateCompanyModuleAllocation = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
        throw new ApiError(400, 'Invalid company id');
    }

    const company = await Company.findById(companyId);
    if (!company) throw new ApiError(404, 'Company not found');

    const {
        enabledModules,
        disabledModules,
        moduleGuardEnabled,
        moduleAllocationConfigured,
        clientCode,
        industryTemplateRef,
        deploymentConfig,
        applyTemplateDefaults,
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
    if (deploymentConfig && typeof deploymentConfig === 'object') {
        company.deploymentConfig = {
            ...(company.deploymentConfig?.toObject?.() || company.deploymentConfig || {}),
            ...deploymentConfig,
        };
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
    const enabled = !ctx.moduleGuardEnabled || ctx.enabledModules.includes(code);
    res.status(200).json(new ApiResponse(200, { moduleCode: code, enabled, moduleGuardEnabled: ctx.moduleGuardEnabled }, 'Module check'));
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
