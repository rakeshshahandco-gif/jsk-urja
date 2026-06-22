import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as emailSettingsService from '../services/emailSettings.service.js';
import { EMAIL_PROVIDERS } from '../constants/emailProvider.constants.js';

const companyId = (req) => {
    if (!req.companyId) throw new ApiError(400, 'Company context required');
    return req.companyId;
};

export const getSettings = asyncHandler(async (req, res) => {
    const doc = await emailSettingsService.getSettings(companyId(req));
    res.send(new ApiResponse(200, doc));
});

export const saveSettings = asyncHandler(async (req, res) => {
    const doc = await emailSettingsService.saveSettings(companyId(req), req.body, req.user.id);
    res.send(new ApiResponse(200, doc, 'Email settings saved'));
});

export const testConnection = asyncHandler(async (req, res) => {
    const result = await emailSettingsService.testSmtpConnection(companyId(req), req.body);
    res.send(new ApiResponse(200, result, result.message));
});

export const getProviders = asyncHandler(async (_req, res) => {
    res.send(new ApiResponse(200, { providers: EMAIL_PROVIDERS }));
});
