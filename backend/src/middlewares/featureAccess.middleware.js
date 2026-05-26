import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    getCompanyFeatureSettings,
    isFeatureEnabled,
    featureForApiPath,
} from '../services/companyFeatureSettings.service.js';

export const requireCompanyFeature = (featurePath) => asyncHandler(async (req, res, next) => {
    if (!req.companyId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Company context required');
    }
    const settings = req.featureSettings || await getCompanyFeatureSettings(req.companyId);
    req.featureSettings = settings;
    if (!isFeatureEnabled(settings, featurePath)) {
        throw new ApiError(httpStatus.FORBIDDEN, `Feature disabled: ${featurePath}`);
    }
    next();
});

/** Auto-gate known API prefixes when mounted under /api/v1 */
export const gateApiFeatureByPath = asyncHandler(async (req, res, next) => {
    const feature = featureForApiPath(req.path);
    if (!feature) return next();
    if (!req.companyId) return next();
    const settings = req.featureSettings || await getCompanyFeatureSettings(req.companyId);
    req.featureSettings = settings;
    if (!isFeatureEnabled(settings, feature)) {
        throw new ApiError(httpStatus.FORBIDDEN, `Feature disabled: ${feature}`);
    }
    next();
});
