import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    isModuleEnabled,
    loadCompanyModuleContext,
} from '../services/moduleGuard.service.js';
import {
    isModuleGuardExemptApiPath,
    moduleForApiPath,
} from '../constants/moduleRegistry.constants.js';

export const requireModule = (moduleCode) => asyncHandler(async (req, res, next) => {
    if (!req.companyId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Company context required');
    }
    const enabled = await isModuleEnabled(req.companyId, moduleCode);
    if (!enabled) {
        throw new ApiError(httpStatus.FORBIDDEN, `Module disabled: ${moduleCode}`);
    }
    next();
});

/** Attach module context once per request (when company scope is set). */
export const attachModuleContext = asyncHandler(async (req, res, next) => {
    if (!req.companyId) return next();
    req.moduleContext = await loadCompanyModuleContext(req.companyId);
    next();
});

/** Auto-gate known API prefixes when company has moduleGuardEnabled. */
export const gateApiModuleByPath = asyncHandler(async (req, res, next) => {
    if (!req.companyId) return next();
    if (isModuleGuardExemptApiPath(req.path)) return next();

    const ctx = req.moduleContext || await loadCompanyModuleContext(req.companyId);
    req.moduleContext = ctx;
    if (!ctx.moduleGuardEnabled) return next();

    const moduleCode = moduleForApiPath(req.path);
    if (!moduleCode) return next();

    if (!ctx.enabledModules.includes(moduleCode)) {
        throw new ApiError(httpStatus.FORBIDDEN, `Module disabled: ${moduleCode}`);
    }
    next();
});
