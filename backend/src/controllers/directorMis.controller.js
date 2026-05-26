import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { checkUserPermission } from '../utils/permissionUtils.js';
import { getDirectorMisDashboard } from '../services/directorMis.service.js';
import { DirectorMisAccessLog } from '../models/directorMisAccessLog.model.js';

const DIRECTOR_MIS_PERMISSION = 'mis.director_dashboard.view';

function requireDirectorMisAccess(req, res, next) {
    const roleName = (req.user?.role?.name || req.user?.roleName || '').trim().toLowerCase();
    if (['admin', 'superadmin', 'director'].includes(roleName)) return next();
    if (checkUserPermission(req.user, DIRECTOR_MIS_PERMISSION)) return next();
    throw new ApiError(httpStatus.FORBIDDEN, 'Director MIS access denied');
}

export const getDashboard = asyncHandler(async (req, res) => {
    const data = await getDirectorMisDashboard(req.query);

    try {
        await DirectorMisAccessLog.create({
            userId: req.user._id,
            userName: req.user.name || req.user.email || '',
            userRole: req.user.role?.name || req.user.roleName || '',
            financialYear: req.query.financialYear || data.filters?.financialYear || '',
            filters: data.filters,
            ipAddress: req.ip || req.headers['x-forwarded-for'] || '',
        });
    } catch (logErr) {
        console.warn('[DirectorMIS] Access log failed:', logErr.message);
    }

    res.status(httpStatus.OK).json(new ApiResponse(httpStatus.OK, data, 'Director MIS dashboard'));
});

export const getAccessLogs = asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const logs = await DirectorMisAccessLog.find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
    res.status(httpStatus.OK).json(new ApiResponse(httpStatus.OK, logs, 'Director MIS access logs'));
});

export { requireDirectorMisAccess, DIRECTOR_MIS_PERMISSION };
