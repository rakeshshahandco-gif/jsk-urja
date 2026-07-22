import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';

/** Allow access if the user has any of the listed permission keys. */
export function requireAnyPermission(permissionKeys = []) {
    const keys = Array.isArray(permissionKeys) ? permissionKeys : [permissionKeys];
    return (req, _res, next) => {
        if (keys.some((key) => checkUserPermission(req.user, key))) {
            return next();
        }
        throw new ApiError(403, `Permission denied: one of [${keys.join(', ')}] required`);
    };
}