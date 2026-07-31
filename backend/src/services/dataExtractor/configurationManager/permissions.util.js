import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { PERMS } from './constants.js';

export function hasManage(user) {
    return checkUserPermission(user, PERMS.manage);
}

export function hasCfg(user, key) {
    return checkUserPermission(user, key) || hasManage(user);
}

export function assertView(user) {
    if (!hasCfg(user, PERMS.view) && !hasCfg(user, PERMS.create_draft)) {
        throw new ApiError(403, `Missing permission: ${PERMS.view}`);
    }
}

export function assertPerm(user, key) {
    if (!hasCfg(user, key)) throw new ApiError(403, `Missing permission: ${key}`);
}

export function isAggregateOnly(user) {
    if (hasManage(user)) return false;
    const hasView = hasCfg(user, PERMS.view);
    const hasDetail = hasCfg(user, PERMS.view_payload)
        || hasCfg(user, PERMS.create_draft)
        || hasCfg(user, PERMS.edit_draft)
        || hasCfg(user, PERMS.review);
    return hasView && !hasDetail;
}

export function canSeePayload(user) {
    return hasCfg(user, PERMS.view_payload)
        || hasManage(user)
        || hasCfg(user, PERMS.create_draft)
        || hasCfg(user, PERMS.edit_draft);
}
