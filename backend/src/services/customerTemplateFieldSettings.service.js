import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { IndustryTemplate } from '../models/industryTemplate.model.js';
import { CompanyTemplateOverride } from '../models/companyTemplateOverride.model.js';
import {
    CUSTOMER_MASTER_TEMPLATE_FIELDS,
    CUSTOMER_TEMPLATE_FIELD_KEYS,
    ELECTRONICS_LEGACY_TEMPLATE_CODE,
    mergeFieldRules,
} from '../constants/customerMasterTemplateFields.constants.js';
import { resolveCompanyIndustryTemplate } from './industryTemplate.service.js';

function getTemplateCustomerMaster(template) {
    return template?.templateSettings?.fieldSettings?.customerMaster || null;
}

function hasTemplateCustomerSettings(template) {
    const cm = getTemplateCustomerMaster(template);
    if (!cm || typeof cm !== 'object') return false;
    return Object.keys(cm).length > 0;
}

/** JSK / Electronics with no customerMaster rules → legacy feature-config behavior only. */
function shouldUseLegacyMode(template) {
    if (!template) return true;
    if (template.templateCode === ELECTRONICS_LEGACY_TEMPLATE_CODE && !hasTemplateCustomerSettings(template)) {
        return true;
    }
    return !hasTemplateCustomerSettings(template);
}

async function getCompanyCustomerOverride(companyId, templateId) {
    if (!companyId || !templateId) return null;
    const doc = await CompanyTemplateOverride.findOne({
        companyId,
        industryTemplateRef: templateId,
        isActive: true,
    }).lean();
    return doc?.overrideSettings?.fieldSettings?.customerMaster || null;
}

/**
 * @param {object} options
 * @param {string} [options.companyId]
 * @param {string} [options.templateId] - preview a specific template instead of company's assigned
 * @param {boolean} [options.includeLegacyFlags] - include resolved legacy feature hints
 */
export async function resolveEffectiveCustomerFieldSettings({ companyId, templateId = null } = {}) {
    let template;
    if (templateId) {
        template = await IndustryTemplate.findById(templateId).lean();
        if (!template) throw new ApiError(httpStatus.NOT_FOUND, 'Industry template not found');
    } else {
        template = await resolveCompanyIndustryTemplate(companyId);
    }

    const useLegacy = shouldUseLegacyMode(template);
    const templateRules = getTemplateCustomerMaster(template) || {};
    const overrideRules = companyId && template?._id
        ? await getCompanyCustomerOverride(companyId, template._id)
        : null;

    const fields = {};
    for (const def of CUSTOMER_MASTER_TEMPLATE_FIELDS) {
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
                documentType: def.documentType,
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
                    documentType: def.documentType,
                    group: def.group,
                };
            } else {
                const merged = mergeFieldRules(templateField || {}, overrideField || {});
                fields[def.key] = {
                    ...merged,
                    featureKey: def.featureKey,
                    label: def.label,
                    formField: def.formField,
                    documentType: def.documentType,
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
        fieldKeys: CUSTOMER_TEMPLATE_FIELD_KEYS,
    };
}

export async function updateTemplateCustomerFieldSettings(templateId, customerMaster, userId) {
    const template = await IndustryTemplate.findById(templateId);
    if (!template) throw new ApiError(httpStatus.NOT_FOUND, 'Industry template not found');

    template.templateSettings = template.templateSettings || {};
    template.templateSettings.fieldSettings = template.templateSettings.fieldSettings || {};
    template.templateSettings.fieldSettings.customerMaster = customerMaster || {};
    template.updatedBy = userId;
    await template.save();
    return template;
}

export async function upsertCompanyCustomerFieldOverride(companyId, customerMaster, userId) {
    const template = await resolveCompanyIndustryTemplate(companyId);
    if (!template?._id) throw new ApiError(httpStatus.BAD_REQUEST, 'Could not resolve industry template for company');

    const payload = {
        companyId,
        industryTemplateRef: template._id,
        overrideSettings: {
            fieldSettings: {
                customerMaster: customerMaster || {},
            },
        },
        isActive: true,
        updatedBy: userId,
    };

    const doc = await CompanyTemplateOverride.findOneAndUpdate(
        { companyId, industryTemplateRef: template._id },
        { $set: payload, $setOnInsert: { createdBy: userId } },
        { upsert: true, new: true },
    );
    return doc;
}

export async function getCompanyCustomerFieldOverride(companyId) {
    const template = await resolveCompanyIndustryTemplate(companyId);
    if (!template?._id) return { customerMaster: {}, templateId: null };
    const override = await getCompanyCustomerOverride(companyId, template._id);
    return {
        templateId: template._id,
        templateCode: template.templateCode,
        customerMaster: override || {},
    };
}

export function computeCustomerDueDays(creditPeriod, gracePeriodDays, gracePeriodVisible) {
    const credit = Math.max(0, Number(creditPeriod) || 0);
    const grace = Math.max(0, Number(gracePeriodDays) || 0);
    if (gracePeriodVisible && grace > 0) return credit + grace;
    return credit;
}

export { CUSTOMER_MASTER_TEMPLATE_FIELDS, CUSTOMER_TEMPLATE_FIELD_KEYS };
