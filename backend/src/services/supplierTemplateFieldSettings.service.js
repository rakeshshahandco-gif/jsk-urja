import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { IndustryTemplate } from '../models/industryTemplate.model.js';
import { CompanyTemplateOverride } from '../models/companyTemplateOverride.model.js';
import {
    SUPPLIER_MASTER_TEMPLATE_FIELDS,
    SUPPLIER_TEMPLATE_FIELD_KEYS,
    mergeFieldRules,
} from '../constants/supplierMasterTemplateFields.constants.js';
import { ELECTRONICS_LEGACY_TEMPLATE_CODE } from '../constants/customerMasterTemplateFields.constants.js';
import { resolveCompanyIndustryTemplate } from './industryTemplate.service.js';

function getTemplateSupplierMaster(template) {
    return template?.templateSettings?.fieldSettings?.supplierMaster || null;
}

function hasTemplateSupplierSettings(template) {
    const sm = getTemplateSupplierMaster(template);
    if (!sm || typeof sm !== 'object') return false;
    return Object.keys(sm).length > 0;
}

function shouldUseLegacyMode(template) {
    if (!template) return true;
    if (template.templateCode === ELECTRONICS_LEGACY_TEMPLATE_CODE && !hasTemplateSupplierSettings(template)) {
        return true;
    }
    return !hasTemplateSupplierSettings(template);
}

async function getCompanySupplierOverride(companyId, templateId) {
    if (!companyId || !templateId) return null;
    const doc = await CompanyTemplateOverride.findOne({
        companyId,
        industryTemplateRef: templateId,
        isActive: true,
    }).lean();
    return doc?.overrideSettings?.fieldSettings?.supplierMaster || null;
}

export async function resolveEffectiveSupplierFieldSettings({ companyId, templateId = null } = {}) {
    let template;
    if (templateId) {
        template = await IndustryTemplate.findById(templateId).lean();
        if (!template) throw new ApiError(httpStatus.NOT_FOUND, 'Industry template not found');
    } else {
        template = await resolveCompanyIndustryTemplate(companyId);
    }

    const useLegacy = shouldUseLegacyMode(template);
    const templateRules = getTemplateSupplierMaster(template) || {};
    const overrideRules = companyId && template?._id
        ? await getCompanySupplierOverride(companyId, template._id)
        : null;

    const fields = {};
    for (const def of SUPPLIER_MASTER_TEMPLATE_FIELDS) {
        const templateField = templateRules[def.key];
        const overrideField = overrideRules?.[def.key];
        if (useLegacy) {
            fields[def.key] = {
                visible: null,
                required: false,
                readOnly: false,
                defaultValue: def.hasDefault ? def.defaultValue : undefined,
                featureKey: def.featureKey,
                label: def.label,
                formField: def.formField,
                group: def.group,
            };
        } else {
            const hasRule = templateField !== undefined || overrideField !== undefined;
            if (!hasRule) {
                fields[def.key] = {
                    visible: null,
                    required: false,
                    readOnly: false,
                    defaultValue: def.hasDefault ? def.defaultValue : undefined,
                    featureKey: def.featureKey,
                    label: def.label,
                    formField: def.formField,
                    group: def.group,
                };
            } else {
                const merged = mergeFieldRules(templateField || {}, overrideField || {});
                fields[def.key] = {
                    ...merged,
                    featureKey: def.featureKey,
                    label: def.label,
                    formField: def.formField,
                    group: def.group,
                };
            }
        }
    }

    return {
        useLegacy,
        templateId: template?._id,
        templateCode: template?.templateCode,
        templateName: template?.templateName,
        companyId: companyId || null,
        hasCompanyOverride: !!(overrideRules && Object.keys(overrideRules).length),
        fields,
        fieldKeys: SUPPLIER_TEMPLATE_FIELD_KEYS,
    };
}

export async function updateTemplateSupplierFieldSettings(templateId, supplierMaster, userId) {
    const template = await IndustryTemplate.findById(templateId);
    if (!template) throw new ApiError(httpStatus.NOT_FOUND, 'Industry template not found');

    template.templateSettings = template.templateSettings || {};
    template.templateSettings.fieldSettings = template.templateSettings.fieldSettings || {};
    template.templateSettings.fieldSettings.supplierMaster = supplierMaster || {};
    template.updatedBy = userId;
    await template.save();
    return template;
}

export async function upsertCompanySupplierFieldOverride(companyId, supplierMaster, userId) {
    const template = await resolveCompanyIndustryTemplate(companyId);
    if (!template?._id) throw new ApiError(httpStatus.BAD_REQUEST, 'Could not resolve industry template for company');

    const payload = {
        companyId,
        industryTemplateRef: template._id,
        overrideSettings: {
            fieldSettings: {
                supplierMaster: supplierMaster || {},
            },
        },
        isActive: true,
        updatedBy: userId,
    };

    const existing = await CompanyTemplateOverride.findOne({
        companyId,
        industryTemplateRef: template._id,
    });

    if (existing) {
        existing.overrideSettings = existing.overrideSettings || {};
        existing.overrideSettings.fieldSettings = existing.overrideSettings.fieldSettings || {};
        existing.overrideSettings.fieldSettings.supplierMaster = supplierMaster || {};
        existing.isActive = true;
        existing.updatedBy = userId;
        await existing.save();
        return existing;
    }

    return CompanyTemplateOverride.create({
        ...payload,
        createdBy: userId,
    });
}

export async function getCompanySupplierFieldOverride(companyId) {
    const template = await resolveCompanyIndustryTemplate(companyId);
    if (!template?._id) return { supplierMaster: {}, templateId: null };
    const override = await getCompanySupplierOverride(companyId, template._id);
    return {
        templateId: template._id,
        templateCode: template.templateCode,
        supplierMaster: override || {},
    };
}

export { SUPPLIER_MASTER_TEMPLATE_FIELDS, SUPPLIER_TEMPLATE_FIELD_KEYS };
