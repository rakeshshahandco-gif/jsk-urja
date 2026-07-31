import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { PERMS } from './constants.js';

export function hasManage(user) {
    return checkUserPermission(user, PERMS.manage);
}

export function hasKg(user, key) {
    return checkUserPermission(user, key) || hasManage(user);
}

export function assertView(user) {
    if (!hasKg(user, PERMS.view) && !hasKg(user, PERMS.search)) {
        throw new ApiError(403, `Missing permission: ${PERMS.view}`);
    }
}

export function assertSearch(user) {
    if (!hasKg(user, PERMS.search) && !hasKg(user, PERMS.view)) {
        throw new ApiError(403, `Missing permission: ${PERMS.search}`);
    }
}

export function assertRelationships(user) {
    if (!hasKg(user, PERMS.relationships) && !hasKg(user, PERMS.view)) {
        throw new ApiError(403, `Missing permission: ${PERMS.relationships}`);
    }
}

export function assertAnalytics(user) {
    if (!hasKg(user, PERMS.analytics) && !hasKg(user, PERMS.view)) {
        throw new ApiError(403, `Missing permission: ${PERMS.analytics}`);
    }
}

export function assertExport(user) {
    if (!hasKg(user, PERMS.export)) {
        throw new ApiError(403, `Missing permission: ${PERMS.export}`);
    }
}

export function assertManage(user) {
    if (!hasManage(user)) {
        throw new ApiError(403, `Missing permission: ${PERMS.manage}`);
    }
}
