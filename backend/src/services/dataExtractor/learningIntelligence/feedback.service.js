import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { AiLearningFeedback, FEEDBACK_TYPES } from '../../../models/aiLearningFeedback.model.js';
import { AiLearningFeedbackHistory } from '../../../models/aiLearningFeedbackHistory.model.js';
import { AiLearningReviewQueue } from '../../../models/aiLearningReviewQueue.model.js';
import { AiLearningAudit } from '../../../models/aiLearningAudit.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import {
    assertNoSecrets, rejectTenantOverrides, sanitizeComment, rejectUnsafeFilters, snapshotHash,
} from './normalize.util.js';
import {
    assertSubmit, assertView, assertReview, assertSourceView, isAggregateOnly, hasLearning,
} from './permissions.util.js';
import { PERMS } from './constants.js';
import { SOURCE_MODULES } from '../../../models/aiLearningFeedback.model.js';
import { getLearningSettings } from './settings.service.js';
import { loadSourceSnapshot } from './sourceAdapter.service.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';

function oid(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
    return new mongoose.Types.ObjectId(String(id));
}

function notDeleted(extra = {}) {
    return { isDeleted: { $ne: true }, ...extra };
}

async function writeHistory(companyId, feedbackId, action, previousStatus, newStatus, userId, reason = '', metadata = {}) {
    assertNoSecrets(metadata);
    await AiLearningFeedbackHistory.create({
        companyId,
        feedbackId,
        action,
        previousStatus,
        newStatus,
        reason: String(reason || '').slice(0, 500),
        changedBy: userId || null,
        metadata,
    });
}

async function writeAudit(companyId, userId, action, entityType, entityId, details = {}) {
    assertNoSecrets(details);
    await AiLearningAudit.create({
        companyId,
        action,
        entityType,
        entityId: entityId || null,
        userId: userId || null,
        details,
    });
}

function buildIdempotencyKey({ companyId, userId, sourceModule, sourceRecordId, sourceVersion, outputType, feedbackType }) {
    return createHash('sha256').update([
        String(companyId), String(userId), sourceModule, String(sourceRecordId),
        sourceVersion || '', outputType || '', feedbackType,
    ].join('|')).digest('hex').slice(0, 48);
}

function conflictGroupKey(companyId, sourceModule, sourceRecordId, sourceVersion) {
    return snapshotHash({ companyId: String(companyId), sourceModule, sourceRecordId: String(sourceRecordId), sourceVersion });
}

const POSITIVE = new Set(['ACCEPT', 'CORRECT', 'HELPFUL', 'RELEVANT', 'COMPLETE', 'CONFIRM_RELATIONSHIP', 'CONFIRM_DUPLICATE']);
const NEGATIVE = new Set(['REJECT', 'INCORRECT', 'NOT_HELPFUL', 'NOT_RELEVANT', 'INCOMPLETE', 'REJECT_RELATIONSHIP', 'REJECT_DUPLICATE', 'TOO_HIGH', 'TOO_LOW', 'WRONG_INDUSTRY', 'WRONG_CUSTOMER_TYPE', 'WRONG_PRODUCT', 'WRONG_CONTACT_ROLE', 'WRONG_SCORE', 'WRONG_REASON', 'WRONG_SOURCE']);

export async function submitFeedback(companyId, userId, body = {}, user = null) {
    assertSubmit(user);
    rejectTenantOverrides(body);
    rejectUnsafeFilters(body);
    assertNoSecrets(body);

    const settings = await getLearningSettings(companyId);
    if (!settings.enabled) throw new ApiError(400, 'Learning Intelligence is disabled');

    const sourceModule = String(body.sourceModule || '');
    if (!SOURCE_MODULES.includes(sourceModule)) throw new ApiError(400, 'Invalid sourceModule');
    if (!settings.feedbackEnabledModules.includes(sourceModule)) {
        throw new ApiError(400, `Feedback disabled for module: ${sourceModule}`);
    }
    assertSourceView(user, sourceModule);

    const feedbackType = String(body.feedbackType || '');
    if (!FEEDBACK_TYPES.includes(feedbackType)) throw new ApiError(400, 'Invalid feedbackType');

    const sourceRecordId = oid(body.sourceRecordId);
    if (!sourceRecordId && !['analytics', 'batch_quality', 'data_quality', 'source_provenance'].includes(sourceModule)) {
        throw new ApiError(400, 'sourceRecordId required');
    }

    const canSeeContacts = checkUserPermission(user, 'data_extractor.contact_intelligence.view')
        || hasLearning(user, PERMS.manage);
    const snapshot = await loadSourceSnapshot(companyId, sourceModule, body.sourceRecordId, {
        aggregateOnly: isAggregateOnly(user),
        canSeeContacts,
    });

    const rejectLike = NEGATIVE.has(feedbackType) || /REJECT|WRONG|NOT_|PRIVACY|STALE|MISSING/i.test(feedbackType);
    let comment = sanitizeComment(body.comment || '', settings.commentMaximumLength);
    if (settings.requireCommentForReject && rejectLike && !comment) {
        throw new ApiError(400, 'Comment required for reject/incorrect feedback');
    }

    let correctedValue = settings.allowCorrectionValue ? (body.correctedValue ?? null) : null;
    const correctedLabel = settings.allowCorrectionValue ? String(body.correctedLabel || '').slice(0, 200) : '';
    assertNoSecrets({ correctedValue, correctedLabel, comment });

    const outputType = String(body.outputType || sourceModule).slice(0, 80);
    const idempotencyKey = body.idempotencyKey
        || buildIdempotencyKey({
            companyId, userId, sourceModule,
            sourceRecordId: snapshot.sourceRecordId,
            sourceVersion: snapshot.sourceVersion,
            outputType,
            feedbackType,
        });

    const existing = await AiLearningFeedback.findOne({
        companyId,
        idempotencyKey,
        ...notDeleted(),
    }).lean();
    if (existing) {
        return { ...publicFeedback(existing, user), idempotent: true };
    }

    // Detect polarity conflicts for same source version
    const conflictGroup = conflictGroupKey(companyId, sourceModule, snapshot.sourceRecordId, snapshot.sourceVersion);
    const peers = await AiLearningFeedback.find({
        companyId,
        sourceModule,
        sourceRecordId: snapshot.sourceRecordId,
        sourceVersion: snapshot.sourceVersion,
        isLatestRevision: true,
        ...notDeleted(),
        status: { $nin: ['ARCHIVED', 'DUPLICATE'] },
    }).lean();

    let status = 'SUBMITTED';
    const pos = peers.filter((p) => POSITIVE.has(p.feedbackType)).length + (POSITIVE.has(feedbackType) ? 1 : 0);
    const neg = peers.filter((p) => NEGATIVE.has(p.feedbackType)).length + (NEGATIVE.has(feedbackType) ? 1 : 0);
    if (pos > 0 && neg > 0) status = 'CONFLICTED';

    const doc = await AiLearningFeedback.create({
        companyId,
        userId,
        sourceModule,
        sourceRecordType: snapshot.sourceRecordType,
        sourceRecordId: snapshot.sourceRecordId,
        sourceVersion: snapshot.sourceVersion,
        sourceSnapshotHash: snapshot.sourceSnapshotHash,
        sourceStatus: snapshot.sourceStatus,
        sourceUpdatedAt: snapshot.sourceUpdatedAt,
        sourceFreshnessAtFeedback: snapshot.sourceFreshnessAtFeedback,
        outputType,
        outputSummary: snapshot.outputSummary,
        feedbackType,
        reasonCode: String(body.reasonCode || '').slice(0, 80),
        comment,
        correctedLabel,
        correctedValue,
        expectedRange: body.expectedRange || null,
        evidenceReferences: Array.isArray(body.evidenceReferences)
            ? body.evidenceReferences.slice(0, settings.evidenceMaximumCount)
            : [],
        reviewerConfidence: body.reviewerConfidence != null ? Number(body.reviewerConfidence) : null,
        status,
        groundTruthCategory: 'USER_OPINION',
        conflictGroup: status === 'CONFLICTED' ? conflictGroup : '',
        idempotencyKey,
        createdBy: userId,
        updatedBy: userId,
    });

    await writeHistory(companyId, doc._id, 'CREATED', '', status, userId, 'Feedback submitted');
    await writeAudit(companyId, userId, 'feedback_created', 'FEEDBACK', doc._id, {
        sourceModule, feedbackType, status,
    });

    if (status === 'CONFLICTED') {
        await AiLearningReviewQueue.findOneAndUpdate(
            { companyId, conflictGroup, status: { $in: ['OPEN', 'IN_PROGRESS'] }, ...notDeleted() },
            {
                $set: {
                    module: sourceModule,
                    priority: 'HIGH',
                    sourceRecordId: snapshot.sourceRecordId,
                    disagreementCount: Math.min(pos, neg),
                    severity: 'HIGH',
                    updatedBy: userId,
                },
                $addToSet: { feedbackIds: doc._id },
                $setOnInsert: {
                    companyId,
                    conflictGroup,
                    status: 'OPEN',
                    createdBy: userId,
                },
            },
            { upsert: true, new: true },
        );
        await writeAudit(companyId, userId, 'conflict_created', 'CONFLICT', doc._id, { conflictGroup });
    }

    return { ...publicFeedback(doc.toObject(), user), idempotent: false, sourceUnmodified: true };
}

export async function listFeedback(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { companyId, ...notDeleted() };
    if (query.sourceModule) q.sourceModule = query.sourceModule;
    if (query.status) q.status = query.status;
    if (query.feedbackType) q.feedbackType = query.feedbackType;
    if (query.sourceRecordId && oid(query.sourceRecordId)) q.sourceRecordId = oid(query.sourceRecordId);
    const limit = Math.min(Number(query.limit) || 50, 200);
    const items = await AiLearningFeedback.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    return {
        items: items.map((f) => publicFeedback(f, user)),
        total: items.length,
        aggregateOnly: isAggregateOnly(user),
    };
}

export async function getFeedback(companyId, id, user = null) {
    assertView(user);
    const _id = oid(id);
    if (!_id) throw new ApiError(400, 'Invalid feedback id');
    const doc = await AiLearningFeedback.findOne({ _id, companyId, ...notDeleted() }).lean();
    if (!doc) throw new ApiError(404, 'Feedback not found');
    return publicFeedback(doc, user);
}

export async function reviseFeedback(companyId, userId, id, body = {}, user = null) {
    assertSubmit(user);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const settings = await getLearningSettings(companyId);
    if (!settings.feedbackRevisionAllowed) throw new ApiError(400, 'Feedback revision disabled');

    const existing = await AiLearningFeedback.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!existing) throw new ApiError(404, 'Feedback not found');
    if (String(existing.userId) !== String(userId) && !hasLearning(user, PERMS.manage)) {
        throw new ApiError(403, 'Only owner can revise feedback');
    }
    const ageDays = (Date.now() - new Date(existing.createdAt).getTime()) / 86400000;
    if (ageDays > settings.feedbackRevisionWindowDays) {
        throw new ApiError(400, 'Feedback revision window expired');
    }

    // Re-check source version — if changed, mark outdated rather than applying blindly
    let status = existing.status;
    try {
        const snap = await loadSourceSnapshot(companyId, existing.sourceModule, existing.sourceRecordId);
        if (snap.sourceSnapshotHash !== existing.sourceSnapshotHash
            || snap.sourceVersion !== existing.sourceVersion) {
            status = 'SOURCE_VERSION_CHANGED';
        }
    } catch {
        status = 'OUTDATED_FEEDBACK';
    }

    const previous = existing.status;
    if (body.feedbackType && FEEDBACK_TYPES.includes(body.feedbackType)) existing.feedbackType = body.feedbackType;
    if (body.comment != null) existing.comment = sanitizeComment(body.comment, settings.commentMaximumLength);
    if (body.correctedLabel != null && settings.allowCorrectionValue) existing.correctedLabel = String(body.correctedLabel).slice(0, 200);
    if (body.correctedValue != null && settings.allowCorrectionValue) existing.correctedValue = body.correctedValue;
    existing.status = status === 'SOURCE_VERSION_CHANGED' || status === 'OUTDATED_FEEDBACK' ? status : 'VALIDATED';
    existing.updatedBy = userId;
    await existing.save();

    await writeHistory(companyId, existing._id, 'REVISED', previous, existing.status, userId, body.reason || 'Feedback revised');
    await writeAudit(companyId, userId, 'feedback_revised', 'FEEDBACK', existing._id, { status: existing.status });
    return publicFeedback(existing.toObject(), user);
}

export async function validateFeedback(companyId, userId, id, user = null) {
    assertReview(user);
    const doc = await AiLearningFeedback.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Feedback not found');
    const previous = doc.status;
    // Revalidate source still exists and company matches
    try {
        const snap = await loadSourceSnapshot(companyId, doc.sourceModule, doc.sourceRecordId);
        if (snap.sourceSnapshotHash !== doc.sourceSnapshotHash) {
            doc.status = 'SOURCE_VERSION_CHANGED';
            doc.validationResult = { ok: false, reason: 'Source version changed after feedback' };
        } else {
            doc.status = 'VALIDATED';
            doc.validationResult = { ok: true, validatedAt: new Date().toISOString() };
        }
    } catch (err) {
        doc.status = 'OUTDATED_FEEDBACK';
        doc.validationResult = { ok: false, reason: String(err.message || err).slice(0, 200) };
    }
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'VALIDATED', previous, doc.status, userId, 'Validation run');
    await writeAudit(companyId, userId, 'feedback_validated', 'FEEDBACK', doc._id, { status: doc.status });
    return publicFeedback(doc.toObject(), user);
}

export async function reviewFeedback(companyId, userId, id, body = {}, user = null) {
    assertReview(user);
    rejectTenantOverrides(body);
    const doc = await AiLearningFeedback.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Feedback not found');
    const decision = String(body.decision || '').toUpperCase();
    if (!['ACCEPTED', 'REJECTED', 'UNDER_REVIEW', 'INCLUDED_IN_ANALYSIS'].includes(decision)) {
        throw new ApiError(400, 'Invalid review decision');
    }
    // Acceptance of feedback != source-record approval
    const previous = doc.status;
    doc.status = decision;
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'REVIEWED', previous, decision, userId, body.reason || '');
    await writeAudit(companyId, userId, decision === 'ACCEPTED' ? 'feedback_accepted' : 'feedback_rejected', 'FEEDBACK', doc._id, {
        note: 'Feedback review does not modify source output',
    });
    return { ...publicFeedback(doc.toObject(), user), sourceUnmodified: true };
}

export async function archiveFeedback(companyId, userId, id, user = null) {
    assertReview(user);
    const doc = await AiLearningFeedback.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Feedback not found');
    const previous = doc.status;
    doc.status = 'ARCHIVED';
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'ARCHIVED', previous, 'ARCHIVED', userId, 'Archived');
    await writeAudit(companyId, userId, 'feedback_archived', 'FEEDBACK', doc._id, {});
    return publicFeedback(doc.toObject(), user);
}

export async function getFeedbackHistory(companyId, id, user = null) {
    assertView(user);
    const items = await AiLearningFeedbackHistory.find({
        companyId,
        feedbackId: oid(id),
        ...notDeleted(),
    }).sort({ createdAt: 1 }).limit(200).lean();
    return { items };
}

export async function listReviewQueue(companyId, query = {}, user = null) {
    if (!hasLearning(user, PERMS.review_queue) && !hasLearning(user, PERMS.review_feedback)) {
        throw new ApiError(403, `Missing permission: ${PERMS.review_queue}`);
    }
    rejectTenantOverrides(query);
    const q = { companyId, ...notDeleted() };
    if (query.status) q.status = query.status;
    const items = await AiLearningReviewQueue.find(q).sort({ priority: -1, createdAt: -1 }).limit(100).lean();
    return { items };
}

export async function listConflicts(companyId, user = null) {
    assertReview(user);
    const items = await AiLearningFeedback.find({
        companyId,
        status: 'CONFLICTED',
        ...notDeleted(),
    }).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map((f) => publicFeedback(f, user)) };
}

export async function resolveConflict(companyId, userId, conflictId, body = {}, user = null) {
    if (!hasLearning(user, PERMS.resolve_conflict)) {
        throw new ApiError(403, `Missing permission: ${PERMS.resolve_conflict}`);
    }
    rejectTenantOverrides(body);
    const queue = await AiLearningReviewQueue.findOne({
        _id: oid(conflictId),
        companyId,
        ...notDeleted(),
    });
    if (!queue) throw new ApiError(404, 'Conflict not found');
    queue.status = 'RESOLVED';
    queue.notes = sanitizeComment(body.notes || body.reason || 'Resolved', 500);
    queue.updatedBy = userId;
    await queue.save();
    await writeAudit(companyId, userId, 'conflict_resolved', 'CONFLICT', queue._id, {
        note: 'Resolution does not modify source records',
    });
    return queue.toObject();
}

function publicFeedback(doc, user) {
    const aggregate = isAggregateOnly(user);
    const settingsAnon = true;
    return {
        id: String(doc._id),
        sourceModule: doc.sourceModule,
        sourceRecordId: String(doc.sourceRecordId),
        sourceVersion: doc.sourceVersion,
        sourceSnapshotHash: doc.sourceSnapshotHash,
        sourceFreshnessAtFeedback: doc.sourceFreshnessAtFeedback,
        outputType: doc.outputType,
        outputSummary: aggregate
            ? { status: doc.outputSummary?.status || '', label: '[restricted]' }
            : doc.outputSummary,
        feedbackType: doc.feedbackType,
        reasonCode: doc.reasonCode,
        comment: aggregate ? undefined : doc.comment,
        correctedLabel: aggregate ? undefined : doc.correctedLabel,
        correctedValue: aggregate ? undefined : doc.correctedValue,
        reviewerConfidence: doc.reviewerConfidence,
        status: doc.status,
        groundTruthCategory: doc.groundTruthCategory || 'USER_OPINION',
        conflictGroup: doc.conflictGroup,
        userId: aggregate || settingsAnon ? undefined : String(doc.userId),
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        note: 'Feedback does not modify source outputs, scores, classifications, or CRM data.',
    };
}

export { writeAudit, writeHistory, POSITIVE, NEGATIVE, publicFeedback };
