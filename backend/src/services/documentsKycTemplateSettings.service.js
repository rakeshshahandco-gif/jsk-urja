import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { IndustryTemplate } from '../models/industryTemplate.model.js';
import { CompanyTemplateOverride } from '../models/companyTemplateOverride.model.js';
import { ELECTRONICS_LEGACY_TEMPLATE_CODE } from '../constants/customerMasterTemplateFields.constants.js';
import { resolveCompanyIndustryTemplate } from './industryTemplate.service.js';
import {
    CUSTOMER_DOCUMENT_DEFINITIONS,
    SUPPLIER_DOCUMENT_DEFINITIONS,
    buildDocumentRulesMap,
} from '../constants/documentsKycTemplate.constants.js';

function getTemplateDocumentSettings(template) {
    return template?.templateSettings?.documentSettings || null;
}

function hasTemplateDocumentSettings(template) {
    const ds = getTemplateDocumentSettings(template);
    if (!ds || typeof ds !== 'object') return false;
    const customerKeys = Object.keys(ds.customerDocuments || {});
    const supplierKeys = Object.keys(ds.supplierDocuments || {});
    return customerKeys.length > 0 || supplierKeys.length > 0;
}

function shouldUseLegacyMode(template) {
    if (!template) return true;
    if (template.templateCode === ELECTRONICS_LEGACY_TEMPLATE_CODE && !hasTemplateDocumentSettings(template)) {
        return true;
    }
    return !hasTemplateDocumentSettings(template);
}

async function getCompanyDocumentOverride(companyId, templateId) {
    if (!companyId || !templateId) return null;
    const doc = await CompanyTemplateOverride.findOne({
        companyId,
        industryTemplateRef: templateId,
        isActive: true,
    }).lean();
    return doc?.overrideSettings?.documentSettings || null;
}

export async function resolveEffectiveDocumentsKycSettings({ companyId, templateId = null } = {}) {
    let template;
    if (templateId) {
        template = await IndustryTemplate.findById(templateId).lean();
        if (!template) throw new ApiError(httpStatus.NOT_FOUND, 'Industry template not found');
    } else {
        template = await resolveCompanyIndustryTemplate(companyId);
    }

    const useLegacy = shouldUseLegacyMode(template);
    const templateDocSettings = getTemplateDocumentSettings(template) || {};
    const overrideDocSettings = companyId && template?._id
        ? await getCompanyDocumentOverride(companyId, template._id)
        : null;

    const customerDocuments = buildDocumentRulesMap(
        CUSTOMER_DOCUMENT_DEFINITIONS,
        templateDocSettings.customerDocuments || {},
        overrideDocSettings?.customerDocuments || {},
        useLegacy,
    );

    const supplierDocuments = buildDocumentRulesMap(
        SUPPLIER_DOCUMENT_DEFINITIONS,
        templateDocSettings.supplierDocuments || {},
        overrideDocSettings?.supplierDocuments || {},
        useLegacy,
    );

    return {
        useLegacy,
        templateId: template?._id,
        templateCode: template?.templateCode,
        templateName: template?.templateName,
        companyId: companyId || null,
        hasCompanyOverride: !!(
            overrideDocSettings
            && (
                Object.keys(overrideDocSettings.customerDocuments || {}).length
                || Object.keys(overrideDocSettings.supplierDocuments || {}).length
            )
        ),
        customerDocuments,
        supplierDocuments,
    };
}

export async function updateTemplateDocumentsKycSettings(templateId, { customerDocuments, supplierDocuments }, userId) {
    const template = await IndustryTemplate.findById(templateId);
    if (!template) throw new ApiError(httpStatus.NOT_FOUND, 'Industry template not found');

    template.templateSettings = template.templateSettings || {};
    template.templateSettings.documentSettings = template.templateSettings.documentSettings || {};
    if (customerDocuments !== undefined) {
        template.templateSettings.documentSettings.customerDocuments = customerDocuments || {};
    }
    if (supplierDocuments !== undefined) {
        template.templateSettings.documentSettings.supplierDocuments = supplierDocuments || {};
    }
    template.updatedBy = userId;
    await template.save();
    return template;
}

export async function upsertCompanyDocumentsKycOverride(companyId, { customerDocuments, supplierDocuments }, userId) {
    const template = await resolveCompanyIndustryTemplate(companyId);
    if (!template?._id) throw new ApiError(httpStatus.BAD_REQUEST, 'Could not resolve industry template for company');

    const payload = {
        companyId,
        industryTemplateRef: template._id,
        overrideSettings: {
            documentSettings: {
                customerDocuments: customerDocuments || {},
                supplierDocuments: supplierDocuments || {},
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
        existing.overrideSettings.documentSettings = {
            customerDocuments: customerDocuments || {},
            supplierDocuments: supplierDocuments || {},
        };
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

export async function getCompanyDocumentsKycOverride(companyId) {
    const template = await resolveCompanyIndustryTemplate(companyId);
    if (!template?._id) {
        return { customerDocuments: {}, supplierDocuments: {}, templateId: null };
    }
    const override = await getCompanyDocumentOverride(companyId, template._id);
    return {
        templateId: template._id,
        templateCode: template.templateCode,
        customerDocuments: override?.customerDocuments || {},
        supplierDocuments: override?.supplierDocuments || {},
    };
}

export {
    CUSTOMER_DOCUMENT_DEFINITIONS,
    SUPPLIER_DOCUMENT_DEFINITIONS,
};
