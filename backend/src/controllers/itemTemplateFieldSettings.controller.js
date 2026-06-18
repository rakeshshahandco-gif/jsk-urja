import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import * as itemTemplateFieldSettingsService from '../services/itemTemplateFieldSettings.service.js';

export const getEffectiveItemFieldSettings = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    if (!companyId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'companyId is required');
    }
    const data = await itemTemplateFieldSettingsService.resolveEffectiveItemFieldSettings({ companyId });
    res.json({ success: true, data });
});

export const previewItemFieldSettings = asyncHandler(async (req, res) => {
    const { companyId, templateId } = req.query;
    if (!companyId && !templateId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'companyId or templateId is required');
    }
    const data = await itemTemplateFieldSettingsService.resolveEffectiveItemFieldSettings({
        companyId: companyId || null,
        templateId: templateId || null,
    });
    res.json({ success: true, data });
});

export const updateTemplateItemFieldSettings = asyncHandler(async (req, res) => {
    const template = await itemTemplateFieldSettingsService.updateTemplateItemFieldSettings(
        req.params.id,
        req.body?.itemMaster || {},
        req.user?._id || req.user?.id,
    );
    res.json({ success: true, data: template, message: 'Item field settings saved' });
});

export const getCompanyItemFieldOverride = asyncHandler(async (req, res) => {
    const data = await itemTemplateFieldSettingsService.getCompanyItemFieldOverride(req.params.companyId);
    res.json({ success: true, data });
});

export const upsertCompanyItemFieldOverride = asyncHandler(async (req, res) => {
    const doc = await itemTemplateFieldSettingsService.upsertCompanyItemFieldOverride(
        req.params.companyId,
        req.body?.itemMaster || {},
        req.user?._id || req.user?.id,
    );
    res.json({ success: true, data: doc, message: 'Company item field override saved' });
});

export const getItemFieldRegistry = asyncHandler(async (req, res) => {
    res.json({
        success: true,
        data: itemTemplateFieldSettingsService.ITEM_MASTER_TEMPLATE_FIELDS,
    });
});
