import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';

/** Block textile demo APIs on production deploy unless explicitly enabled for QA. */
export function textileDemoOnly(req, res, next) {
    const allowed = process.env.NODE_ENV !== 'production'
        || process.env.ALLOW_TEXTILE_DEMO === 'true';
    if (!allowed) {
        return next(new ApiError(httpStatus.FORBIDDEN, 'Textile demo mode is available on localhost only'));
    }
    return next();
}
