import { ApiError } from '../../../../utils/ApiError.js';
import { checkUserPermission } from '../../../../utils/permissionUtils.js';
import {
    PERM_QUERY_GENERATE,
    PERM_QUERY_MANAGE,
    PERM_QUERY_OPEN,
    PERM_QUERY_REVIEW,
    PERM_QUERY_VIEW,
} from './constants.js';
import { PERM_VIEW as PERM_CAMPAIGN_VIEW, PERM_MANAGE as PERM_CAMPAIGN_MANAGE } from '../constants.js';

function deny(perm) {
    throw new ApiError(403, `Permission denied: ${perm} required`);
}

/** Campaign must be visible to work with its queries. */
export function assertCampaignVisibility(user) {
    if (!checkUserPermission(user, PERM_CAMPAIGN_VIEW) && !checkUserPermission(user, PERM_CAMPAIGN_MANAGE)) {
        deny(PERM_CAMPAIGN_VIEW);
    }
}

export function assertQueryView(user) {
    assertCampaignVisibility(user);
    if (!checkUserPermission(user, PERM_QUERY_VIEW) && !checkUserPermission(user, PERM_QUERY_MANAGE)) {
        deny(PERM_QUERY_VIEW);
    }
}

export function assertQueryManage(user) {
    assertCampaignVisibility(user);
    if (!checkUserPermission(user, PERM_QUERY_MANAGE)) {
        deny(PERM_QUERY_MANAGE);
    }
}

export function assertQueryGenerate(user) {
    assertCampaignVisibility(user);
    if (!checkUserPermission(user, PERM_QUERY_GENERATE) && !checkUserPermission(user, PERM_QUERY_MANAGE)) {
        deny(PERM_QUERY_GENERATE);
    }
}

export function assertQueryReview(user) {
    assertCampaignVisibility(user);
    if (!checkUserPermission(user, PERM_QUERY_REVIEW) && !checkUserPermission(user, PERM_QUERY_MANAGE)) {
        deny(PERM_QUERY_REVIEW);
    }
}

export function assertQueryOpen(user) {
    assertCampaignVisibility(user);
    if (!checkUserPermission(user, PERM_QUERY_OPEN) && !checkUserPermission(user, PERM_QUERY_MANAGE)) {
        deny(PERM_QUERY_OPEN);
    }
}

export function actorUserId(user) {
    return user?._id || user?.id || null;
}
