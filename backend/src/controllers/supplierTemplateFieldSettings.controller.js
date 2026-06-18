import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import * as supplierTemplateFieldSettingsService from '../services/supplierTemplateFieldSettings.service.js';

export const getEffectiveSupplierFieldSettings = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    if (!companyId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'companyId is required');
    }
    const data = await supplierTemplateFieldSettingsService.resolveEffectiveSupplierFieldSettings({ companyId });
    res.json({ success: true, data });
});

export const previewSupplierFieldSettings = asyncHandler(async (req, res) => {
    const { companyId, templateId } = req.query;
    if (!companyId && !templateId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'companyId or templateId is required');
    }
    const data = await supplierTemplateFieldSettingsService.resolveEffectiveSupplierFieldSettings({
        companyId: companyId || null,
        templateId: templateId || null,
    });
    res.json({ success: true, data });
});

export const updateTemplateSupplierFieldSettings = asyncHandler(async (req, res) => {
    const template = await supplierTemplateFieldSettingsService.updateTemplateSupplierFieldSettings(
        req.params.id,
        req.body?.supplierMaster || {},
        req.user?._id || req.user?.id,
    );
    res.json({ success: true, data: template, message: 'Supplier field settings saved' });
});

export const getCompanySupplierFieldOverride = asyncHandler(async (req, res) => {
    const data = await supplierTemplateFieldSettingsService.getCompanySupplierFieldOverride(req.params.companyId);
    res.json({ success: true, data });
});

export const upsertCompanySupplierFieldOverride = asyncHandler(async (req, res) => {
    const doc = await supplierTemplateFieldSettingsService.upsertCompanySupplierFieldOverride(
        req.params.companyId,
        req.body?.supplierMaster || {},
        req.user?._id || req.user?.id,
    );
    res.json({ success: true, data: doc, message: 'Company supplier field override saved' });
});

export const getSupplierFieldRegistry = asyncHandler(async (req, res) => {
    res.json({
        success: true,
        data: supplierTemplateFieldSettingsService.SUPPLIER_MASTER_TEMPLATE_FIELDS,
    });
});
