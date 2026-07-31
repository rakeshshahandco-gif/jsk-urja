import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { PERMS, SOURCE_VIEW_PERMS, REVIEW_TYPE_PERMS } from './constants.js';

export function hasManage(user) {
    return checkUserPermission(user, PERMS.manage);
}

export function hasApproval(user, key) {
    return checkUserPermission(user, key) || hasManage(user);
}

export function assertView(user) {
    if (!hasApproval(user, PERMS.view) && !hasApproval(user, PERMS.submit)) {
        throw new ApiError(403, `Missing permission: ${PERMS.view}`);
    }
}

export function assertSubmit(user) {
    if (!hasApproval(user, PERMS.submit)) throw new ApiError(403, `Missing permission: ${PERMS.submit}`);
}

export function assertApprove(user) {
    if (!hasApproval(user, PERMS.approve)) throw new ApiError(403, `Missing permission: ${PERMS.approve}`);
}

export function assertReject(user) {
    if (!hasApproval(user, PERMS.reject)) throw new ApiError(403, `Missing permission: ${PERMS.reject}`);
}

export function assertGenerateSpec(user) {
    if (!hasApproval(user, PERMS.generate_spec)) throw new ApiError(403, `Missing permission: ${PERMS.generate_spec}`);
}

export function assertRequestEvidence(user) {
    if (!hasApproval(user, PERMS.request_evidence)) throw new ApiError(403, `Missing permission: ${PERMS.request_evidence}`);
}

export function assertAudit(user) {
    if (!hasApproval(user, PERMS.audit) && !hasManage(user)) throw new ApiError(403, `Missing permission: ${PERMS.audit}`);
}

export function assertSettings(user) {
    if (!hasApproval(user, PERMS.settings) && !hasManage(user)) throw new ApiError(403, `Missing permission: ${PERMS.settings}`);
}

export function assertReviewType(user, reviewType) {
    const key = REVIEW_TYPE_PERMS[reviewType];
    if (!key) throw new ApiError(400, `Unknown review type: ${reviewType}`);
    if (!hasApproval(user, key)) throw new ApiError(403, `Missing permission: ${key}`);
}

export function assertSourceView(user, sourceModule) {
    const key = SOURCE_VIEW_PERMS[sourceModule] || 'data_extractor.ai_learning.view';
    if (!checkUserPermission(user, key) && !hasManage(user) && !checkUserPermission(user, 'data_extractor.ai_learning.view')) {
        throw new ApiError(403, `Missing source permission: ${key}`);
    }
}

export function isAggregateOnly(user) {
    if (hasManage(user)) return false;
    const hasView = hasApproval(user, PERMS.view);
    const hasDetail = hasApproval(user, PERMS.submit)
        || hasApproval(user, PERMS.business_review)
        || hasApproval(user, PERMS.technical_review)
        || hasApproval(user, PERMS.approve);
    return hasView && !hasDetail;
}
