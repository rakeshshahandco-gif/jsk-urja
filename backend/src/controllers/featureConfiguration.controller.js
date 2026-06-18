import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as featureConfigurationService from '../services/featureConfiguration.service.js';

export const getRegistry = asyncHandler(async (req, res) => {
    res.send(new ApiResponse(200, { registry: featureConfigurationService.getFeatureRegistry() }));
});

export const getConfiguration = asyncHandler(async (req, res) => {
    if (!req.companyId) throw new ApiError(400, 'X-Company-Id is required');
    const data = await featureConfigurationService.getCompanyFeatureConfiguration(req.companyId);
    res.send(new ApiResponse(200, data));
});

export const saveConfiguration = asyncHandler(async (req, res) => {
    if (!req.companyId) throw new ApiError(400, 'X-Company-Id is required');
    const data = await featureConfigurationService.saveCompanyFeatureConfiguration(
        req.companyId,
        req.body,
        req.user?.id || req.user?._id,
    );
    res.send(new ApiResponse(200, data, 'Feature configuration saved'));
});

export const checkFeature = asyncHandler(async (req, res) => {
    if (!req.companyId) throw new ApiError(400, 'X-Company-Id is required');
    const key = req.query.featureKey || req.params.featureKey;
    if (!key) throw new ApiError(400, 'featureKey is required');
    const { mergedSettings } = await featureConfigurationService.getCompanyFeatureConfiguration(req.companyId);
    const enabled = featureConfigurationService.resolveFeatureEnabled(mergedSettings, key);
    res.send(new ApiResponse(200, { featureKey: key, enabled }));
});
