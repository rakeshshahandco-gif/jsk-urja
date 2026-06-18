import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getCompanyFeatureSettings, isAiSmartImportEnabled } from '../services/companyFeatureSettings.service.js';
import { checkUserPermission } from '../utils/permissionUtils.js';

export const requireAiSmartImport = asyncHandler(async (req, res, next) => {
    if (!req.companyId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Company context required');
    }
    const settings = req.featureSettings || await getCompanyFeatureSettings(req.companyId);
    req.featureSettings = settings;
    if (!isAiSmartImportEnabled(settings)) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Feature disabled: accounting.enableAiSmartImport');
    }
    next();
});

/** Accept import_utility.* or legacy scan_entry.* permission keys. */
export const checkImportPermission = (action) => (req, res, next) => {
    const keys = [
        `import_utility.import_utility.${action}`,
        `scan_entry.scan_entry.${action}`,
    ];
    if (keys.some((k) => checkUserPermission(req.user, k))) return next();
    throw new ApiError(403, `Permission denied: import utility ${action} required`);
};
