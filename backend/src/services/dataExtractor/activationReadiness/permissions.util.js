import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { PERMS, PLATFORM_ADMIN_PERMS } from './constants.js';

export function hasManage(user) {
    return checkUserPermission(user, PERMS.manage);
}

export function hasAr(user, key) {
    return checkUserPermission(user, key) || hasManage(user);
}

export function isPlatformAdmin(user) {
    if (hasManage(user)) return true;
    if (user?.roleName && /^(super[_-]?admin|platform[_-]?admin|saas[_-]?admin)$/i.test(String(user.roleName))) return true;
    return PLATFORM_ADMIN_PERMS.some((p) => checkUserPermission(user, p));
}

export function assertView(user) {
    if (!hasAr(user, PERMS.view) && !hasAr(user, PERMS.create) && !isPlatformAdmin(user)) {
        throw new ApiError(403, `Missing permission: ${PERMS.view}`);
    }
}

export function assertPerm(user, key) {
    if (!hasAr(user, key) && !isPlatformAdmin(user)) throw new ApiError(403, `Missing permission: ${key}`);
}

export function assertPlatformAdmin(user) {
    if (!isPlatformAdmin(user)) throw new ApiError(403, 'Platform Admin permission required');
}

export function isClientAdminOnly(user) {
    if (isPlatformAdmin(user)) return false;
    const role = String(user?.roleName || '');
    return /client[_-]?admin/i.test(role) || (hasAr(user, PERMS.view) && !hasAr(user, PERMS.manage) && !hasAr(user, PERMS.final_review));
}