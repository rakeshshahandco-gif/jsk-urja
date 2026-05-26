import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    getCompanyFeatureSettings,
    getCompanyFeatureSettingsDoc,
    updateCompanyFeatureSettings,
    mergeFeatureSettings,
} from '../services/companyFeatureSettings.service.js';
import { getPlatformFeatureSettingsRaw } from '../services/platformFeatureSettings.service.js';
import { DEFAULT_COMPANY_FEATURE_SETTINGS } from '../constants/companyFeatureSettings.defaults.js';
import { listIndustryTemplates } from '../services/productionTemplate.service.js';
import { DEFAULT_JSK_INDUSTRY_CONFIG } from '../constants/industryTemplates.defaults.js';

export const getFeatureSettings = asyncHandler(async (req, res) => {
    if (!req.companyId) {
        throw new ApiError(400, 'X-Company-Id is required');
    }
    const platformRaw = await getPlatformFeatureSettingsRaw();
    const doc = await getCompanyFeatureSettingsDoc(req.companyId);
    const settings = await getCompanyFeatureSettings(req.companyId);
    res.status(200).json(new ApiResponse(200, {
        settings,
        companyOverrides: doc.settings || {},
        platformDefaults: mergeFeatureSettings(null, platformRaw),
        codeDefaults: DEFAULT_COMPANY_FEATURE_SETTINGS,
        defaults: DEFAULT_COMPANY_FEATURE_SETTINGS,
    }));
});

export const updateFeatureSettings = asyncHandler(async (req, res) => {
    if (!req.companyId) {
        throw new ApiError(400, 'X-Company-Id is required');
    }
    const { settings: patch } = req.body;
    if (!patch || typeof patch !== 'object') {
        throw new ApiError(400, 'settings object is required');
    }
    const settings = await updateCompanyFeatureSettings(req.companyId, patch, req.user?._id);
    res.status(200).json(new ApiResponse(200, { settings }, 'Feature settings updated'));
});

export const getFeatureSettingsDefaults = asyncHandler(async (req, res) => {
    res.status(200).json(new ApiResponse(200, {
        defaults: DEFAULT_COMPANY_FEATURE_SETTINGS,
        industryDefaults: DEFAULT_JSK_INDUSTRY_CONFIG,
    }));
});

export const getIndustryTemplates = asyncHandler(async (req, res) => {
    res.status(200).json(new ApiResponse(200, { templates: listIndustryTemplates() }));
});
