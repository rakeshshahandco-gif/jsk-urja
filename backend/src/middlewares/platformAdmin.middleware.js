import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { isPlatformAdminUser } from '../constants/platformAccess.constants.js';

/** Only platform owner (superadmin) may proceed. */
export const requirePlatformAdmin = (req, res, next) => {
    if (!isPlatformAdminUser(req.user)) {
        throw new ApiError(
            httpStatus.FORBIDDEN,
            'Access denied. This action is available only to Platform Admin.',
        );
    }
    next();
};
