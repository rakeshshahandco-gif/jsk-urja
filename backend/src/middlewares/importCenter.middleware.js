import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getCompanyFeatureSettings, isAiSmartImportEnabled } from '../services/companyFeatureSettings.service.js';

/** Import Center visible when AI Smart Import OR Petty Cash is enabled for the company. */
export const requireImportCenter = asyncHandler(async (req, res, next) => {
    if (!req.companyId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Company context required');
    }
    const settings = req.featureSettings || await getCompanyFeatureSettings(req.companyId);
    req.featureSettings = settings;
    const pettyCash = !!settings?.accounting?.enablePettyCash;
    if (isAiSmartImportEnabled(settings) || pettyCash) {
        return next();
    }
    throw new ApiError(httpStatus.FORBIDDEN, 'Feature disabled: enable AI Smart Import or Petty Cash in Feature Settings');
});
