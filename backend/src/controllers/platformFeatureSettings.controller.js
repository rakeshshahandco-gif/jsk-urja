import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { DEFAULT_COMPANY_FEATURE_SETTINGS } from '../constants/companyFeatureSettings.defaults.js';
import {
    getPlatformFeatureSettings,
    getPlatformFeatureSettingsRaw,
    updatePlatformFeatureSettings,
    applyPlatformDefaultsToAllCompanies,
} from '../services/platformFeatureSettings.service.js';

export const getPlatformSettings = asyncHandler(async (req, res) => {
    const raw = await getPlatformFeatureSettingsRaw();
    const settings = await getPlatformFeatureSettings();
    res.status(200).json(new ApiResponse(200, {
        settings,
        platformOverrides: raw,
        codeDefaults: DEFAULT_COMPANY_FEATURE_SETTINGS,
    }));
});

export const updatePlatformSettings = asyncHandler(async (req, res) => {
    const { settings: patch } = req.body;
    if (!patch || typeof patch !== 'object') {
        throw new ApiError(400, 'settings object is required');
    }
    const settings = await updatePlatformFeatureSettings(patch, req.user?._id);
    res.status(200).json(new ApiResponse(200, { settings }, 'Platform defaults updated'));
});

export const applyPlatformToAllCompanies = asyncHandler(async (req, res) => {
    const result = await applyPlatformDefaultsToAllCompanies(req.user?._id);
    res.status(200).json(
        new ApiResponse(200, result, `Platform defaults applied to ${result.updated} companies`),
    );
});
