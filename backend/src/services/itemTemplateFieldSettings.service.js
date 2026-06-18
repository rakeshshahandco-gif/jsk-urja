import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { IndustryTemplate } from '../models/industryTemplate.model.js';
import { CompanyTemplateOverride } from '../models/companyTemplateOverride.model.js';
import {
    ITEM_MASTER_TEMPLATE_FIELDS,
    ITEM_TEMPLATE_FIELD_KEYS,
    mergeFieldRules,
} from '../constants/itemMasterTemplateFields.constants.js';
import {
    getTemplateDefaultFieldVisible,
    getTemplateDefaultFieldRequired,
    shouldUseItemMasterLegacyMode,
} from '../constants/itemMasterTemplateDefaults.js';
import { resolveCompanyIndustryTemplate } from './industryTemplate.service.js';

function getTemplateItemMaster(template) {
    return template?.templateSettings?.fieldSettings?.itemMaster || null;
}

function shouldUseLegacyMode(template) {
    return shouldUseItemMasterLegacyMode(template);
}

function getExplicitFieldVisible(templateField, overrideField) {
    if (overrideField && overrideField.visible !== undefined && overrideField.visible !== null) {
        return overrideField.visible === true;
    }
    if (templateField && templateField.visible !== undefined && templateField.visible !== null) {
        return templateField.visible === true;
    }
    return null;
}

function getExplicitFieldRequired(templateField, overrideField) {
    if (overrideField && overrideField.required !== undefined && overrideField.required !== null) {
        return !!overrideField.required;
    }
    if (templateField && templateField.required !== undefined && templateField.required !== null) {
        return !!templateField.required;
    }
    return null;
}

function resolveFieldEntry(def, { template, templateField, overrideField, useLegacy }) {
    const base = {
        featureKey: def.featureKey,
        label: def.label,
        formField: def.formField,
        group: def.group,
        defaultValue: def.hasDefault ? def.defaultValue : undefined,
    };
    if (useLegacy) {
        return { ...base, visible: null, required: false, readOnly: false };
    }
    const explicitVisible = getExplicitFieldVisible(templateField, overrideField);
    const visible = explicitVisible !== null
        ? explicitVisible
        : getTemplateDefaultFieldVisible(template.templateCode, def);
    const hasRule = templateField !== undefined || overrideField !== undefined;
    const merged = hasRule ? mergeFieldRules(templateField || {}, overrideField || {}) : null;
    let required = getExplicitFieldRequired(templateField, overrideField);
    if (required === null) {
        required = getTemplateDefaultFieldRequired(template.templateCode, def);
    }
    // Textile specification fields are always optional on Textile template
    if (template.templateCode === 'TEXTILE' && def.group === 'textile') {
        required = false;
    }
    // Textile images upload after item save — not a form field on create
    if (def.key === 'textileItemImages') {
        required = false;
    }
    return {
        ...base,
        visible,
        required,
        readOnly: merged?.readOnly || false,
        defaultValue: merged?.defaultValue !== undefined ? merged.defaultValue : base.defaultValue,
    };
}

async function getCompanyItemOverride(companyId, templateId) {
    if (!companyId || !templateId) return null;
    const doc = await CompanyTemplateOverride.findOne({
        companyId,
        industryTemplateRef: templateId,
        isActive: true,
    }).lean();
    return doc?.overrideSettings?.fieldSettings?.itemMaster || null;
}

export async function resolveEffectiveItemFieldSettings({ companyId, templateId = null } = {}) {
    let template;
    if (templateId) {
        template = await IndustryTemplate.findById(templateId).lean();
        if (!template) throw new ApiError(httpStatus.NOT_FOUND, 'Industry template not found');
    } else {
        template = await resolveCompanyIndustryTemplate(companyId);
    }

    const useLegacy = shouldUseLegacyMode(template);
    const templateRules = getTemplateItemMaster(template) || {};
    const overrideRules = companyId && template?._id
        ? await getCompanyItemOverride(companyId, template._id)
        : null;

    const fields = {};
    for (const def of ITEM_MASTER_TEMPLATE_FIELDS) {
        fields[def.key] = resolveFieldEntry(def, {
            template,
            templateField: templateRules[def.key],
            overrideField: overrideRules?.[def.key],
            useLegacy,
        });
    }

    return {
        useLegacy,
        templateId: template?._id,
        templateCode: template?.templateCode,
        templateName: template?.templateName,
        companyId: companyId || null,
        hasCompanyOverride: !!(overrideRules && Object.keys(overrideRules).length),
        fields,
        fieldKeys: ITEM_TEMPLATE_FIELD_KEYS,
    };
}

export async function updateTemplateItemFieldSettings(templateId, itemMaster, userId) {
    const template = await IndustryTemplate.findById(templateId);
    if (!template) throw new ApiError(httpStatus.NOT_FOUND, 'Industry template not found');

    template.templateSettings = template.templateSettings || {};
    template.templateSettings.fieldSettings = template.templateSettings.fieldSettings || {};
    template.templateSettings.fieldSettings.itemMaster = itemMaster || {};
    template.updatedBy = userId;
    await template.save();
    return template;
}

export async function upsertCompanyItemFieldOverride(companyId, itemMaster, userId) {
    const template = await resolveCompanyIndustryTemplate(companyId);
    if (!template?._id) throw new ApiError(httpStatus.BAD_REQUEST, 'Could not resolve industry template for company');

    const payload = {
        companyId,
        industryTemplateRef: template._id,
        overrideSettings: {
            fieldSettings: {
                itemMaster: itemMaster || {},
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
        existing.overrideSettings.fieldSettings.itemMaster = itemMaster || {};
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

export async function getCompanyItemFieldOverride(companyId) {
    const template = await resolveCompanyIndustryTemplate(companyId);
    if (!template?._id) return { itemMaster: {}, templateId: null };
    const override = await getCompanyItemOverride(companyId, template._id);
    return {
        templateId: template._id,
        templateCode: template.templateCode,
        itemMaster: override || {},
    };
}

export { ITEM_MASTER_TEMPLATE_FIELDS, ITEM_TEMPLATE_FIELD_KEYS };
