import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    loadCompanyModuleContext,
} from '../services/moduleGuard.service.js';
import {
    isModuleGuardExemptApiPath,
    moduleForApiPath,
} from '../constants/moduleRegistry.constants.js';
import {
    evaluateModuleAccess,
    formatModuleAccessDeniedMessage,
} from '../constants/moduleAccessDecision.constants.js';
import { isPlatformAdminUser } from '../constants/platformAccess.constants.js';

export const requireModule = (moduleCode) => asyncHandler(async (req, res, next) => {
    if (!req.companyId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Company context required');
    }
    const ctx = await loadCompanyModuleContext(req.companyId);
    const decision = evaluateModuleAccess({
        moduleGuardEnabled: ctx.moduleGuardEnabled,
        enabledModules: ctx.enabledModules,
        moduleStates: ctx.moduleStates,
        moduleCode,
        method: req.method,
        pathname: req.path || req.originalUrl || '',
        isPlatformAdmin: isPlatformAdminUser(req.user),
    });
    if (!decision.allowed) {
        throw new ApiError(
            httpStatus.FORBIDDEN,
            formatModuleAccessDeniedMessage(decision.moduleCode, decision.reason),
        );
    }
    req.moduleAccessDecision = decision;
    next();
});

/** Attach module context once per request (when company scope is set). */
export const attachModuleContext = asyncHandler(async (req, res, next) => {
    if (!req.companyId) return next();
    req.moduleContext = await loadCompanyModuleContext(req.companyId);
    next();
});

/**
 * Auto-gate known API prefixes.
 * Sequence: company already resolved by companyScope → load allocation →
 * resolve ON/LOCKED/OFF → apply lockMode by method → then existing permission middleware runs.
 */
export const gateApiModuleByPath = asyncHandler(async (req, res, next) => {
    if (!req.companyId) return next();
    if (isModuleGuardExemptApiPath(req.path)) return next();

    const ctx = req.moduleContext || await loadCompanyModuleContext(req.companyId);
    req.moduleContext = ctx;

    const moduleCode = moduleForApiPath(req.path);
    if (!moduleCode) return next();

    // Always evaluate: explicit moduleStates apply even when moduleGuardEnabled is false.
    // When guard is off and no state entry → allowed (legacy ON).
    const decision = evaluateModuleAccess({
        moduleGuardEnabled: ctx.moduleGuardEnabled,
        enabledModules: ctx.enabledModules,
        moduleStates: ctx.moduleStates,
        moduleCode,
        method: req.method,
        pathname: req.path || req.originalUrl || '',
        isPlatformAdmin: isPlatformAdminUser(req.user),
    });
    req.moduleAccessDecision = decision;

    if (!decision.allowed) {
        throw new ApiError(
            httpStatus.FORBIDDEN,
            formatModuleAccessDeniedMessage(decision.moduleCode, decision.reason),
        );
    }
    next();
});
