import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import * as customerTemplateFieldSettingsService from '../services/customerTemplateFieldSettings.service.js';

export const getEffectiveCustomerFieldSettings = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    if (!companyId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'companyId is required');
    }
    const data = await customerTemplateFieldSettingsService.resolveEffectiveCustomerFieldSettings({ companyId });
    res.json({ success: true, data });
});

export const previewCustomerFieldSettings = asyncHandler(async (req, res) => {
    const { companyId, templateId } = req.query;
    if (!companyId && !templateId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'companyId or templateId is required');
    }
    const data = await customerTemplateFieldSettingsService.resolveEffectiveCustomerFieldSettings({
        companyId: companyId || null,
        templateId: templateId || null,
    });
    res.json({ success: true, data });
});

export const updateTemplateCustomerFieldSettings = asyncHandler(async (req, res) => {
    const template = await customerTemplateFieldSettingsService.updateTemplateCustomerFieldSettings(
        req.params.id,
        req.body?.customerMaster || {},
        req.user?.id,
    );
    res.json({ success: true, data: template, message: 'Customer field settings saved' });
});

export const getCompanyCustomerFieldOverride = asyncHandler(async (req, res) => {
    const data = await customerTemplateFieldSettingsService.getCompanyCustomerFieldOverride(req.params.companyId);
    res.json({ success: true, data });
});

export const upsertCompanyCustomerFieldOverride = asyncHandler(async (req, res) => {
    const doc = await customerTemplateFieldSettingsService.upsertCompanyCustomerFieldOverride(
        req.params.companyId,
        req.body?.customerMaster || {},
        req.user?.id,
    );
    res.json({ success: true, data: doc, message: 'Company customer field override saved' });
});

export const getCustomerFieldRegistry = asyncHandler(async (req, res) => {
    res.json({
        success: true,
        data: customerTemplateFieldSettingsService.CUSTOMER_MASTER_TEMPLATE_FIELDS,
    });
});
