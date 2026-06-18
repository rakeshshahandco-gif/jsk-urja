import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import * as documentsKycTemplateSettingsService from '../services/documentsKycTemplateSettings.service.js';

export const getEffectiveDocumentsKycSettings = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    if (!companyId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'companyId is required');
    }
    const data = await documentsKycTemplateSettingsService.resolveEffectiveDocumentsKycSettings({ companyId });
    res.json({ success: true, data });
});

export const previewDocumentsKycSettings = asyncHandler(async (req, res) => {
    const { companyId, templateId } = req.query;
    if (!companyId && !templateId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'companyId or templateId is required');
    }
    const data = await documentsKycTemplateSettingsService.resolveEffectiveDocumentsKycSettings({
        companyId: companyId || null,
        templateId: templateId || null,
    });
    res.json({ success: true, data });
});

export const updateTemplateDocumentsKycSettings = asyncHandler(async (req, res) => {
    const template = await documentsKycTemplateSettingsService.updateTemplateDocumentsKycSettings(
        req.params.id,
        {
            customerDocuments: req.body?.customerDocuments,
            supplierDocuments: req.body?.supplierDocuments,
        },
        req.user?._id || req.user?.id,
    );
    res.json({ success: true, data: template, message: 'Documents / KYC template rules saved' });
});

export const getCompanyDocumentsKycOverride = asyncHandler(async (req, res) => {
    const data = await documentsKycTemplateSettingsService.getCompanyDocumentsKycOverride(req.params.companyId);
    res.json({ success: true, data });
});

export const upsertCompanyDocumentsKycOverride = asyncHandler(async (req, res) => {
    const doc = await documentsKycTemplateSettingsService.upsertCompanyDocumentsKycOverride(
        req.params.companyId,
        {
            customerDocuments: req.body?.customerDocuments,
            supplierDocuments: req.body?.supplierDocuments,
        },
        req.user?._id || req.user?.id,
    );
    res.json({ success: true, data: doc, message: 'Company documents / KYC override saved' });
});

export const getDocumentsKycRegistry = asyncHandler(async (req, res) => {
    res.json({
        success: true,
        data: {
            customerDocuments: documentsKycTemplateSettingsService.CUSTOMER_DOCUMENT_DEFINITIONS,
            supplierDocuments: documentsKycTemplateSettingsService.SUPPLIER_DOCUMENT_DEFINITIONS,
        },
    });
});
