import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as sundryDebtorSettingsService from '../services/sundryDebtorSettings.service.js';
import * as customerTypeMasterService from '../services/customerTypeMaster.service.js';

export const getSettings = asyncHandler(async (req, res) => {
    if (!req.companyId) {
        throw new ApiError(400, 'X-Company-Id is required');
    }
    const settings = await sundryDebtorSettingsService.getSundryDebtorSettings(req.companyId);
    res.send(new ApiResponse(200, settings, 'Sundry debtor settings fetched'));
});

export const saveSettings = asyncHandler(async (req, res) => {
    if (!req.companyId) {
        throw new ApiError(400, 'X-Company-Id is required');
    }
    const settings = await sundryDebtorSettingsService.saveSundryDebtorSettings(
        req.companyId,
        req.body,
        req.user?.id || req.user?._id,
    );
    res.send(new ApiResponse(200, settings, 'Sundry debtor settings saved'));
});

export const listCustomerTypes = asyncHandler(async (req, res) => {
    const types = await customerTypeMasterService.listCustomerTypes();
    res.send(new ApiResponse(200, types, 'Customer types fetched'));
});

export const createCustomerType = asyncHandler(async (req, res) => {
    const doc = await customerTypeMasterService.createCustomerType(req.body.name, req.user?.id || req.user?._id);
    res.status(201).send(new ApiResponse(201, doc, 'Customer type created'));
});
