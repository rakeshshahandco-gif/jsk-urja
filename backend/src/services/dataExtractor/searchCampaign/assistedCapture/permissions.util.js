import { ApiError } from '../../../../utils/ApiError.js';
import { checkUserPermission } from '../../../../utils/permissionUtils.js';
import {
    PERM_ASSISTED_MANAGE,
    PERM_ASSISTED_START,
    PERM_ASSISTED_VIEW,
} from './constants.js';

function deny(permission) {
    throw new ApiError(403, `Permission denied: ${permission} required`);
}

export function assertAssistedCaptureView(user) {
    if (!checkUserPermission(user, 'data_extractor.search_campaign.view')) deny('data_extractor.search_campaign.view');
    if (!checkUserPermission(user, 'data_extractor.search_query.view')) deny('data_extractor.search_query.view');
    if (!checkUserPermission(user, PERM_ASSISTED_VIEW) && !checkUserPermission(user, PERM_ASSISTED_MANAGE)) {
        deny(PERM_ASSISTED_VIEW);
    }
}

export function assertAssistedCaptureStart(user) {
    if (!checkUserPermission(user, 'data_extractor.search_campaign.view')) deny('data_extractor.search_campaign.view');
    if (!checkUserPermission(user, 'data_extractor.search_query.view')) deny('data_extractor.search_query.view');
    if (!checkUserPermission(user, 'data_extractor.search_query.open')) deny('data_extractor.search_query.open');
    if (!checkUserPermission(user, 'data_extractor.raw_capture.ingest')) deny('data_extractor.raw_capture.ingest');
    if (!checkUserPermission(user, PERM_ASSISTED_START) && !checkUserPermission(user, PERM_ASSISTED_MANAGE)) {
        deny(PERM_ASSISTED_START);
    }
}

export function assertAssistedCaptureManage(user) {
    if (!checkUserPermission(user, 'data_extractor.search_campaign.view')) deny('data_extractor.search_campaign.view');
    if (!checkUserPermission(user, PERM_ASSISTED_MANAGE)) {
        deny(PERM_ASSISTED_MANAGE);
    }
}

export function actorUserId(user) {
    return user?._id || user?.id || null;
}
