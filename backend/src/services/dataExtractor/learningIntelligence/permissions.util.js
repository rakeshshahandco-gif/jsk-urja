import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { PERMS, SOURCE_VIEW_PERMS } from './constants.js';

export function hasManage(user) {
    return checkUserPermission(user, PERMS.manage);
}

export function hasLearning(user, key) {
    return checkUserPermission(user, key) || hasManage(user);
}

export function assertView(user) {
    if (!hasLearning(user, PERMS.view) && !hasLearning(user, PERMS.submit_feedback)) {
        throw new ApiError(403, `Missing permission: ${PERMS.view}`);
    }
}

export function assertSubmit(user) {
    if (!hasLearning(user, PERMS.submit_feedback)) {
        throw new ApiError(403, `Missing permission: ${PERMS.submit_feedback}`);
    }
}

export function assertReview(user) {
    if (!hasLearning(user, PERMS.review_feedback)) {
        throw new ApiError(403, `Missing permission: ${PERMS.review_feedback}`);
    }
}

export function assertResolveConflict(user) {
    if (!hasLearning(user, PERMS.resolve_conflict)) {
        throw new ApiError(403, `Missing permission: ${PERMS.resolve_conflict}`);
    }
}

export function assertAnalytics(user) {
    if (!hasLearning(user, PERMS.analytics) && !hasLearning(user, PERMS.view)) {
        throw new ApiError(403, `Missing permission: ${PERMS.analytics}`);
    }
}

export function assertGenerateProposal(user) {
    if (!hasLearning(user, PERMS.generate_proposal)) {
        throw new ApiError(403, `Missing permission: ${PERMS.generate_proposal}`);
    }
}

export function assertReviewProposal(user) {
    if (!hasLearning(user, PERMS.review_proposal)) {
        throw new ApiError(403, `Missing permission: ${PERMS.review_proposal}`);
    }
}

export function assertExport(user) {
    if (!hasLearning(user, PERMS.export)) {
        throw new ApiError(403, `Missing permission: ${PERMS.export}`);
    }
}

export function assertDataset(user) {
    if (!hasLearning(user, PERMS.dataset)) {
        throw new ApiError(403, `Missing permission: ${PERMS.dataset}`);
    }
}

export function assertAudit(user) {
    if (!hasLearning(user, PERMS.audit) && !hasManage(user)) {
        throw new ApiError(403, `Missing permission: ${PERMS.audit}`);
    }
}

export function assertManage(user) {
    if (!hasManage(user)) throw new ApiError(403, `Missing permission: ${PERMS.manage}`);
}

export function assertSourceView(user, sourceModule) {
    const key = SOURCE_VIEW_PERMS[sourceModule];
    if (!key) throw new ApiError(400, `Unknown source module: ${sourceModule}`);
    if (!checkUserPermission(user, key) && !hasManage(user)) {
        throw new ApiError(403, `Missing source permission: ${key}`);
    }
}

export function isAggregateOnly(user) {
    if (hasManage(user)) return false;
    const hasView = hasLearning(user, PERMS.view) || hasLearning(user, PERMS.analytics);
    const hasDetail = hasLearning(user, PERMS.submit_feedback)
        || hasLearning(user, PERMS.review_feedback)
        || hasLearning(user, PERMS.review_queue);
    return hasView && !hasDetail;
}
