import { WhatsAppAIKnowledge } from '../models/index.js';
import { ApiError } from '../../../utils/ApiError.js';
import { assertNoBinaryPayload } from '../models/sharedFields.js';
import { canKnowledgeBeActive, resolveKnowledgeActive } from '../constants/whatsappAi.constants.js';
import { appendActionLog } from './audit.service.js';

function parsePagination(query = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    return { page, limit, skip: (page - 1) * limit };
}

/** Enforce: non-approved knowledge cannot be active. */
export function applyKnowledgeActiveSafety(doc) {
    if (!canKnowledgeBeActive(doc.approvalStatus)) {
        doc.active = false;
    }
    return doc;
}

export async function listKnowledge(companyId, query = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { companyId, isDeleted: false };
    if (query.approvalStatus) filter.approvalStatus = query.approvalStatus;
    if (query.category) filter.category = query.category;
    if (query.active === 'true' || query.active === true) filter.active = true;
    if (query.active === 'false' || query.active === false) filter.active = false;
    if (query.q) {
        const q = String(query.q).trim();
        filter.$or = [
            { title: new RegExp(q, 'i') },
            { content: new RegExp(q, 'i') },
            { keywords: new RegExp(q, 'i') },
        ];
    }

    const [results, total] = await Promise.all([
        WhatsAppAIKnowledge.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        WhatsAppAIKnowledge.countDocuments(filter),
    ]);
    return { results, page, limit, total, totalPages: Math.ceil(total / limit) || 0 };
}

/**
 * Create knowledge as draft + inactive.
 * Even if payload.active === true, new records stay inactive until approved + activated.
 */
export async function createKnowledge(companyId, payload, userId) {
    assertNoBinaryPayload(payload);
    const doc = await WhatsAppAIKnowledge.create({
        companyId,
        title: payload.title,
        content: payload.content || '',
        category: payload.category || '',
        subcategory: payload.subcategory || '',
        language: payload.language || 'en',
        keywords: payload.keywords || [],
        applicableProductIds: payload.applicableProductIds || [],
        approvalStatus: 'draft',
        active: false,
        approvedBy: null,
        approvedAt: null,
        version: 1,
        effectiveFrom: payload.effectiveFrom || null,
        effectiveTo: payload.effectiveTo || null,
        sourceDocumentReferences: payload.sourceDocumentReferences || [],
        createdBy: userId,
        updatedBy: userId,
    });
    await appendActionLog({
        companyId,
        actionType: 'knowledge_created',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: `Knowledge created: ${doc.title}`,
        afterState: { id: doc._id, title: doc.title, approvalStatus: 'draft', active: false },
        success: true,
    });
    return doc.toObject();
}

export async function updateKnowledge(companyId, id, payload, userId) {
    assertNoBinaryPayload(payload);
    const doc = await WhatsAppAIKnowledge.findOne({ _id: id, companyId, isDeleted: false });
    if (!doc) throw new ApiError(404, 'Knowledge not found');

    const fields = [
        'title', 'content', 'category', 'subcategory', 'language', 'keywords',
        'applicableProductIds', 'effectiveFrom', 'effectiveTo', 'sourceDocumentReferences',
    ];
    for (const f of fields) {
        if (Object.prototype.hasOwnProperty.call(payload, f)) doc[f] = payload[f];
    }

    // Content edits to approved knowledge return it to draft and deactivate.
    if (doc.approvalStatus === 'approved') {
        doc.approvalStatus = 'draft';
        doc.version = (doc.version || 1) + 1;
        doc.approvedBy = null;
        doc.approvedAt = null;
        doc.active = false;
    }

    // Ignore client attempts to activate via update — use setKnowledgeActive.
    if (Object.prototype.hasOwnProperty.call(payload, 'active')) {
        doc.active = resolveKnowledgeActive(doc.approvalStatus, payload.active);
    }
    applyKnowledgeActiveSafety(doc);

    doc.updatedBy = userId;
    await doc.save();

    await appendActionLog({
        companyId,
        actionType: 'knowledge_updated',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: `Knowledge updated: ${doc.title}`,
        afterState: { id: doc._id, approvalStatus: doc.approvalStatus, active: doc.active },
        success: true,
    });
    return doc.toObject();
}

export async function submitKnowledge(companyId, id, userId) {
    const doc = await WhatsAppAIKnowledge.findOne({ _id: id, companyId, isDeleted: false });
    if (!doc) throw new ApiError(404, 'Knowledge not found');
    if (!['draft', 'rejected'].includes(doc.approvalStatus)) {
        throw new ApiError(400, 'Only draft or rejected knowledge can be submitted');
    }
    doc.approvalStatus = 'pending';
    doc.active = false;
    doc.updatedBy = userId;
    await doc.save();
    await appendActionLog({
        companyId,
        actionType: 'knowledge_submitted',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: `Knowledge submitted: ${doc.title}`,
        success: true,
    });
    return doc.toObject();
}

/** Approve only — does not activate. Use setKnowledgeActive separately. */
export async function approveKnowledge(companyId, id, userId) {
    const doc = await WhatsAppAIKnowledge.findOne({ _id: id, companyId, isDeleted: false });
    if (!doc) throw new ApiError(404, 'Knowledge not found');
    if (doc.approvalStatus !== 'pending') {
        throw new ApiError(400, 'Only pending knowledge can be approved');
    }
    doc.approvalStatus = 'approved';
    doc.approvedBy = userId;
    doc.approvedAt = new Date();
    doc.active = false;
    doc.updatedBy = userId;
    await doc.save();
    await appendActionLog({
        companyId,
        actionType: 'knowledge_approved',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: `Knowledge approved: ${doc.title}`,
        afterState: { id: doc._id, approvalStatus: 'approved', active: false },
        success: true,
    });
    return doc.toObject();
}

export async function rejectKnowledge(companyId, id, userId, reason = '') {
    const doc = await WhatsAppAIKnowledge.findOne({ _id: id, companyId, isDeleted: false });
    if (!doc) throw new ApiError(404, 'Knowledge not found');
    if (doc.approvalStatus !== 'pending') {
        throw new ApiError(400, 'Only pending knowledge can be rejected');
    }
    doc.approvalStatus = 'rejected';
    doc.rejectionReason = reason || '';
    doc.active = false;
    doc.updatedBy = userId;
    await doc.save();
    await appendActionLog({
        companyId,
        actionType: 'knowledge_rejected',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: `Knowledge rejected: ${doc.title}`,
        structuredMetadata: { reason: String(reason || '').slice(0, 200) },
        success: true,
    });
    return doc.toObject();
}

/**
 * Controlled activation — only approved knowledge may become active.
 */
export async function setKnowledgeActive(companyId, id, active, userId) {
    const doc = await WhatsAppAIKnowledge.findOne({ _id: id, companyId, isDeleted: false });
    if (!doc) throw new ApiError(404, 'Knowledge not found');
    if (active && doc.approvalStatus !== 'approved') {
        throw new ApiError(400, 'Only approved knowledge can be activated');
    }
    doc.active = Boolean(active) && doc.approvalStatus === 'approved';
    doc.updatedBy = userId;
    await doc.save();
    await appendActionLog({
        companyId,
        actionType: 'system',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: `Knowledge ${doc.active ? 'activated' : 'deactivated'}: ${doc.title}`,
        afterState: { id: doc._id, approvalStatus: doc.approvalStatus, active: doc.active },
        success: true,
    });
    return doc.toObject();
}
