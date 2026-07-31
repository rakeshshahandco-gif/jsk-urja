import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { PERMS } from './constants.js';

export function hasManage(user) {
    return checkUserPermission(user, PERMS.manage);
}

export function hasSb(user, key) {
    return checkUserPermission(user, key) || hasManage(user);
}

export function assertView(user) {
    if (!hasSb(user, PERMS.view) && !hasSb(user, PERMS.create)) {
        throw new ApiError(403, `Missing permission: ${PERMS.view}`);
    }
}

export function assertPerm(user, key) {
    if (!hasSb(user, key)) throw new ApiError(403, `Missing permission: ${key}`);
}

export function isAggregateOnly(user) {
    if (hasManage(user)) return false;
    const hasView = hasSb(user, PERMS.view);
    const hasDetail = hasSb(user, PERMS.view_row_detail) || hasSb(user, PERMS.view_results) || hasSb(user, PERMS.create);
    return hasView && !hasDetail;
}

export function canViewRowDetail(user) {
    return hasSb(user, PERMS.view_row_detail) || hasManage(user);
}
