import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { PERM_MANAGE, PERM_VIEW } from './constants.js';

export function assertSearchCampaignView(user) {
    if (!checkUserPermission(user, PERM_VIEW) && !checkUserPermission(user, PERM_MANAGE)) {
        throw new ApiError(403, `Permission denied: ${PERM_VIEW} required`);
    }
}

export function assertSearchCampaignManage(user) {
    if (!checkUserPermission(user, PERM_MANAGE)) {
        throw new ApiError(403, `Permission denied: ${PERM_MANAGE} required`);
    }
}

export function actorUserId(user) {
    return user?._id || user?.id || null;
}