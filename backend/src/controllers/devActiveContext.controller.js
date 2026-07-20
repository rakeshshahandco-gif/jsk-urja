import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { buildUserCompanyContext } from '../services/userCompanyContext.service.js';
import { FinancialYear } from '../models/financialYear.model.js';
import config from '../config/config.js';
import { getLocalAppIdentity } from '../utils/localAppIdentity.js';
import {
    loadCompanyModuleContext,
    buildPilotModuleContextSnapshot,
} from '../services/moduleGuard.service.js';

/**
 * GET /api/v1/dev/active-context — development only.
 */
export const getActiveContext = asyncHandler(async (req, res) => {
    if (config.env !== 'development') {
        throw new ApiError(404, 'Not found');
    }

    const user = req.user;
    if (!user) {
        throw new ApiError(401, 'Not authenticated');
    }

    const headerCompany =
        req.headers['x-company-id'] || req.headers['X-Company-Id'] || null;

    const companyContext = await buildUserCompanyContext(user, {
        activeCompanyId: headerCompany,
    });

    let financialYear = null;
    try {
        const fy = await FinancialYear.findOne({ isCurrent: true })
            .select('name startDate endDate status isCurrent')
            .lean();
        if (fy) {
            financialYear = {
                _id: String(fy._id),
                name: fy.name,
                isCurrent: Boolean(fy.isCurrent),
                status: fy.status,
            };
        }
    } catch {
        financialYear = null;
    }

    const identity = getLocalAppIdentity({
        mongoUrl: config.mongoose.url,
        port: config.port,
    });

    const worktreeKey = String(identity.applicationKey || '').includes('handloom')
        ? 'handloom'
        : String(identity.applicationKey || '').includes('jsk')
            ? 'jsk-urja'
            : 'unknown';

    let pilotModules = [];
    const activeCompanyId = companyContext?.activeCompany?._id
        || companyContext?.activeCompanyId
        || headerCompany;
    if (activeCompanyId) {
        try {
            const modCtx = await loadCompanyModuleContext(activeCompanyId);
            pilotModules = buildPilotModuleContextSnapshot(modCtx);
        } catch {
            pilotModules = [];
        }
    }

    res.status(200).json(new ApiResponse(200, {
        userId: String(user._id),
        displayName: user.name || user.username || '',
        username: user.username || '',
        email: user.email || '',
        roleName: user.roleName || '',
        ...companyContext,
        industryType: identity.industryType,
        environment: identity.environment,
        applicationKey: identity.applicationKey,
        backendPort: identity.port,
        databaseName: identity.databaseName,
        financialYear,
        worktreeKey,
        pilotModules,
    }, 'Active development context'));
});
