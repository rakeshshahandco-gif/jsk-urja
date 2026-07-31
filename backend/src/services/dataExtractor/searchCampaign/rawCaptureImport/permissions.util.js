import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { checkUserPermission } from '../../../../utils/permissionUtils.js';
import { PERM_RAW_IMPORT } from './constants.js';
import { PERM_RAW_INGEST, PERM_RAW_MANAGE } from '../rawCapture/constants.js';
import { PERM_VIEW as PERM_CAMPAIGN_VIEW, PERM_MANAGE as PERM_CAMPAIGN_MANAGE } from '../constants.js';
import { PERM_QUERY_VIEW, PERM_QUERY_MANAGE } from '../searchQuery/constants.js';
import { getOwnedSearchCampaign } from '../searchCampaign.service.js';

function deny(perm) {
    throw new ApiError(403, `Permission denied: ${perm} required`);
}

export function assertCampaignVisibility(user) {
    if (!checkUserPermission(user, PERM_CAMPAIGN_VIEW) && !checkUserPermission(user, PERM_CAMPAIGN_MANAGE)) {
        deny(PERM_CAMPAIGN_VIEW);
    }
}

export function assertRawImport(user) {
    assertCampaignVisibility(user);
    if (
        !checkUserPermission(user, PERM_RAW_IMPORT)
        && !checkUserPermission(user, PERM_RAW_MANAGE)
    ) {
        deny(PERM_RAW_IMPORT);
    }
}

export function assertRawImportCommit(user, { requireQueryView = false } = {}) {
    assertRawImport(user);
    if (!checkUserPermission(user, PERM_RAW_INGEST) && !checkUserPermission(user, PERM_RAW_MANAGE)) {
        deny(PERM_RAW_INGEST);
    }
    if (requireQueryView) {
        if (!checkUserPermission(user, PERM_QUERY_VIEW) && !checkUserPermission(user, PERM_QUERY_MANAGE)) {
            deny(PERM_QUERY_VIEW);
        }
    }
}

export function actorUserId(user) {
    return user?._id || user?.id || null;
}

/**
 * Express middleware: verify campaign ownership BEFORE Multer buffers a file.
 * campaignId comes from route params (never from multipart body).
 */
export async function assertImportCampaignAccessMiddleware(req, res, next) {
    try {
        if (!req.user) throw new ApiError(401, 'Not authorized, no token');
        assertRawImport(req.user);
        const companyId = req.companyId;
        if (!companyId || !mongoose.isValidObjectId(companyId)) {
            throw new ApiError(400, 'Company context required');
        }
        const campaignId = req.params.campaignId;
        if (!campaignId || !mongoose.isValidObjectId(campaignId)) {
            throw new ApiError(404, 'Search campaign not found');
        }
        await getOwnedSearchCampaign({
            companyId, user: req.user, campaignId, skipPermCheck: true,
        });
        return next();
    } catch (err) {
        const status = Number(err?.statusCode) || 500;
        const operational = Boolean(err?.isOperational) || status < 500;
        return res.status(status).send({
            success: false,
            code: status,
            message: operational ? String(err?.message || 'Request failed').slice(0, 500) : 'Request failed',
        });
    }
}
