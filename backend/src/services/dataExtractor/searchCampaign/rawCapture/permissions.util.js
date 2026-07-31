import { ApiError } from '../../../../utils/ApiError.js';
import { checkUserPermission } from '../../../../utils/permissionUtils.js';
import {
    PERM_RAW_ARCHIVE,
    PERM_RAW_INGEST,
    PERM_RAW_MANAGE,
    PERM_RAW_VIEW,
} from './constants.js';
import { PERM_VIEW as PERM_CAMPAIGN_VIEW, PERM_MANAGE as PERM_CAMPAIGN_MANAGE } from '../constants.js';
import { PERM_QUERY_VIEW, PERM_QUERY_MANAGE } from '../searchQuery/constants.js';

function deny(perm) {
    throw new ApiError(403, `Permission denied: ${perm} required`);
}

export function assertCampaignVisibility(user) {
    if (!checkUserPermission(user, PERM_CAMPAIGN_VIEW) && !checkUserPermission(user, PERM_CAMPAIGN_MANAGE)) {
        deny(PERM_CAMPAIGN_VIEW);
    }
}

export function assertRawView(user) {
    assertCampaignVisibility(user);
    if (!checkUserPermission(user, PERM_RAW_VIEW) && !checkUserPermission(user, PERM_RAW_MANAGE)) {
        deny(PERM_RAW_VIEW);
    }
}

export function assertRawIngest(user, { requireQueryView = false } = {}) {
    assertCampaignVisibility(user);
    if (!checkUserPermission(user, PERM_RAW_INGEST) && !checkUserPermission(user, PERM_RAW_MANAGE)) {
        deny(PERM_RAW_INGEST);
    }
    if (requireQueryView) {
        if (!checkUserPermission(user, PERM_QUERY_VIEW) && !checkUserPermission(user, PERM_QUERY_MANAGE)) {
            deny(PERM_QUERY_VIEW);
        }
    }
}

export function assertRawManage(user) {
    assertCampaignVisibility(user);
    if (!checkUserPermission(user, PERM_RAW_MANAGE)) {
        deny(PERM_RAW_MANAGE);
    }
}

export function assertRawArchive(user) {
    assertCampaignVisibility(user);
    if (!checkUserPermission(user, PERM_RAW_ARCHIVE) && !checkUserPermission(user, PERM_RAW_MANAGE)) {
        deny(PERM_RAW_ARCHIVE);
    }
}

export function actorUserId(user) {
    return user?._id || user?.id || null;
}
