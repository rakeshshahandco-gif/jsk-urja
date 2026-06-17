import mongoose from 'mongoose';
import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { IndustryTemplate } from '../models/industryTemplate.model.js';
import { Company } from '../models/company.model.js';
import {
    DEFAULT_INDUSTRY_TEMPLATES,
    EMPTY_TEMPLATE_SETTINGS,
} from '../constants/industryTemplateMaster.defaults.js';
import { getIndustryModuleDefaults } from '../constants/industryModuleDefaults.js';

function buildTemplateSettingsForSeed(templateCode) {
    const defaults = getIndustryModuleDefaults(templateCode);
    const base = { ...EMPTY_TEMPLATE_SETTINGS };
    if (defaults) {
        base.moduleSettings = {
            ...base.moduleSettings,
            enabledModules: [...(defaults.enabledModules || [])],
            enforceModuleGuard: defaults.enforceModuleGuard === true,
        };
    }
    return base;
}

export async function ensureDefaultIndustryTemplates() {
    for (const seed of DEFAULT_INDUSTRY_TEMPLATES) {
        const existing = await IndustryTemplate.findOne({ templateCode: seed.templateCode });
        if (!existing) {
            await IndustryTemplate.create({
                ...seed,
                templateSettings: buildTemplateSettingsForSeed(seed.templateCode),
            });
        }
    }

    const activeDefaultCount = await IndustryTemplate.countDocuments({
        isDefaultTemplate: true,
        isActive: true,
    });
    if (activeDefaultCount === 0) {
        await IndustryTemplate.updateOne(
            { templateCode: 'ELECTRONICS_JSK' },
            { $set: { isDefaultTemplate: true } },
        );
    } else if (activeDefaultCount > 1) {
        const defaults = await IndustryTemplate.find({ isDefaultTemplate: true, isActive: true })
            .sort({ updatedAt: -1 })
            .select('_id')
            .lean();
        const keepId = defaults[0]?._id;
        if (keepId) {
            await IndustryTemplate.updateMany(
                { _id: { $ne: keepId }, isDefaultTemplate: true },
                { $set: { isDefaultTemplate: false } },
            );
        }
    }
}

export async function getDefaultIndustryTemplate() {
    await ensureDefaultIndustryTemplates();
    return IndustryTemplate.findOne({ isDefaultTemplate: true, isActive: true }).lean()
        || IndustryTemplate.findOne({ templateCode: 'ELECTRONICS_JSK' }).lean();
}

/**
 * Resolves effective industry template for a company without mutating company records.
 * If company.industryTemplateRef is null, returns default Electronics Manufacturing template.
 */
export async function resolveCompanyIndustryTemplate(companyId) {
    await ensureDefaultIndustryTemplates();

    if (!companyId) {
        return getDefaultIndustryTemplate();
    }

    const company = await Company.findById(companyId)
        .select('industryTemplateRef')
        .lean();

    if (!company) {
        return getDefaultIndustryTemplate();
    }

    if (company.industryTemplateRef) {
        const assigned = await IndustryTemplate.findById(company.industryTemplateRef).lean();
        if (assigned) return assigned;
    }

    return getDefaultIndustryTemplate();
}

export async function listIndustryTemplates(filter = {}) {
    await ensureDefaultIndustryTemplates();
    const query = {};
    if (filter.isActive !== undefined) query.isActive = filter.isActive;
    return IndustryTemplate.find(query).sort({ isDefaultTemplate: -1, templateName: 1 }).lean();
}

export async function getIndustryTemplateById(id) {
    await ensureDefaultIndustryTemplates();
    return IndustryTemplate.findById(id).lean();
}

async function clearOtherDefaultFlags(exceptId = null) {
    const query = exceptId ? { _id: { $ne: exceptId } } : {};
    await IndustryTemplate.updateMany(query, { $set: { isDefaultTemplate: false } });
}

export async function createIndustryTemplate(payload, userId) {
    await ensureDefaultIndustryTemplates();

    const templateCode = payload.templateCode?.trim().toUpperCase();
    const exists = await IndustryTemplate.findOne({
        $or: [
            { templateCode },
            { templateName: payload.templateName?.trim() },
        ],
    });
    if (exists) {
        throw new ApiError(httpStatus.CONFLICT, 'Template name or code already exists');
    }

    if (payload.isDefaultTemplate) {
        await clearOtherDefaultFlags();
    }

    return IndustryTemplate.create({
        templateName: payload.templateName.trim(),
        templateCode,
        description: payload.description?.trim() || '',
        isActive: payload.isActive !== false,
        isDefaultTemplate: !!payload.isDefaultTemplate,
        templateSettings: payload.templateSettings || { ...EMPTY_TEMPLATE_SETTINGS },
        createdBy: userId,
        updatedBy: userId,
    });
}

export async function updateIndustryTemplate(id, payload, userId) {
    const templateId = String(id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(templateId)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid industry template id');
    }

    const template = await IndustryTemplate.findById(templateId);
    if (!template) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Industry template not found');
    }

    if (payload.templateName !== undefined) template.templateName = payload.templateName.trim();
    if (payload.templateCode !== undefined) {
        const code = payload.templateCode.trim().toUpperCase();
        const dup = await IndustryTemplate.findOne({ templateCode: code, _id: { $ne: templateId } });
        if (dup) {
            throw new ApiError(httpStatus.CONFLICT, 'Template code already exists');
        }
        template.templateCode = code;
    }
    if (payload.description !== undefined) template.description = payload.description.trim();
    if (payload.isActive !== undefined) template.isActive = payload.isActive;
    if (payload.isDefaultTemplate === true) {
        await clearOtherDefaultFlags(templateId);
        template.isDefaultTemplate = true;
    } else if (payload.isDefaultTemplate === false && template.isDefaultTemplate) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot remove default flag from the default template. Set another template as default first.');
    }

    template.updatedBy = userId;
    await template.save();
    return template;
}

export async function toggleIndustryTemplateActive(id, userId) {
    const template = await IndustryTemplate.findById(id);
    if (!template) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Industry template not found');
    }
    if (template.isDefaultTemplate && template.isActive) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot deactivate the default industry template');
    }
    template.isActive = !template.isActive;
    template.updatedBy = userId;
    await template.save();
    return template;
}
