/**
 * Phase 1D — Human draft review workflow.
 * Approval does NOT send WhatsApp / Bulk / Baileys / Meta API.
 */

import { WhatsAppAIReplyDraft, WhatsAppAIMessage, WhatsAppAIConversation } from '../models/index.js';
import { appendActionLog } from './audit.service.js';
import { WHATSAPP_AI_DRAFT_TEXT_MAX } from '../constants/whatsappAi.constants.js';
import { validateDraftText } from './draftSafety.service.js';

async function auditLog(deps, payload) {
    const fn = deps?.appendActionLog || appendActionLog;
    return fn(payload);
}

function notFound(msg = 'Reply draft not found') {
    const err = new Error(msg);
    err.statusCode = 404;
    return err;
}

function badRequest(msg, code = 'BAD_REQUEST') {
    const err = new Error(msg);
    err.statusCode = 400;
    err.code = code;
    return err;
}

function publicDraft(doc) {
    if (!doc) return null;
    const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
    return {
        id: String(o._id),
        companyId: o.companyId,
        conversationId: o.conversationId,
        sourceMessageId: o.sourceMessageId,
        intent: o.intent,
        intentReason: o.intentReason,
        confidence: o.confidence,
        detectedLanguage: o.detectedLanguage,
        draftText: o.draftText,
        status: o.status,
        generationMode: o.generationMode,
        processingVersion: o.processingVersion,
        safetyResult: o.safetyResult,
        reviewNotes: o.reviewNotes || [],
        reviewMeta: {
            ...(o.reviewMeta || {}),
            outboundSent: false,
            // approved means ready for controlled sending later — not sent
            readyForControlledSend: o.status === 'approved',
        },
        contextSnapshot: o.contextSnapshot || null,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        outboundSent: false,
        autoApproved: false,
    };
}

async function loadDraft(ReplyDraft, companyId, id) {
    const doc = await ReplyDraft.findOne({ _id: id, companyId, isDeleted: false });
    if (!doc) throw notFound();
    return doc;
}

export async function listPendingDrafts(companyId, query = {}, deps = {}) {
    const ReplyDraft = deps.ReplyDraft || WhatsAppAIReplyDraft;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;
    const filter = { companyId, isDeleted: false };
    if (query.status) filter.status = query.status;
    else if (query.pendingOnly !== false && query.status !== 'all') {
        filter.status = { $in: ['pending_review', 'edited', 'regeneration_requested'] };
    }

    const [results, total] = await Promise.all([
        ReplyDraft.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        ReplyDraft.countDocuments(filter),
    ]);

    await auditLog(deps, {
        companyId,
        actionType: 'reply_draft_listed',
        actorType: 'user',
        actorUserId: query.actorUserId || null,
        actionSummary: 'Listed reply drafts for review',
        structuredMetadata: { page, limit, total, statusFilter: filter.status },
        success: true,
    });

    return {
        results: results.map(publicDraft),
        page,
        limit,
        total,
        outboundSent: false,
    };
}

export async function getDraftForReview(companyId, draftId, userId, deps = {}) {
    const ReplyDraft = deps.ReplyDraft || WhatsAppAIReplyDraft;
    const Message = deps.Message || WhatsAppAIMessage;
    const Conversation = deps.Conversation || WhatsAppAIConversation;
    const doc = await loadDraft(ReplyDraft, companyId, draftId);
    const lean = doc.toObject();

    let customerMessage = null;
    let conversation = null;
    if (lean.sourceMessageId) {
        const msgQuery = Message.findOne({
            _id: lean.sourceMessageId,
            companyId,
            isDeleted: false,
        });
        customerMessage = typeof msgQuery?.lean === 'function' ? await msgQuery.lean() : await msgQuery;
    }
    if (lean.conversationId) {
        const convQuery = Conversation.findOne({
            _id: lean.conversationId,
            companyId,
            isDeleted: false,
        });
        conversation = typeof convQuery?.lean === 'function' ? await convQuery.lean() : await convQuery;
    }

    await auditLog(deps, {
        companyId,
        conversationId: lean.conversationId,
        messageId: lean.sourceMessageId,
        actionType: 'reply_draft_viewed',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: 'Opened reply draft for review',
        structuredMetadata: { draftId: String(lean._id), status: lean.status },
        success: true,
    });

    return {
        draft: publicDraft(lean),
        customerMessage: customerMessage ? {
            id: String(customerMessage._id),
            text: customerMessage.text,
            direction: customerMessage.direction,
            createdAt: customerMessage.createdAt,
        } : null,
        conversation: conversation ? {
            id: String(conversation._id),
            normalizedMobile: conversation.normalizedMobile,
            status: conversation.status,
            preferredLanguage: conversation.preferredLanguage,
        } : null,
        // Placeholders for product intelligence / grounding when stored on snapshot
        productIntelligence: lean.contextSnapshot?.productIntelligence || null,
        groundingSources: lean.contextSnapshot?.groundingSources || [],
        providerStatus: lean.contextSnapshot?.provider || { id: null, networkCalled: false },
        safetyWarnings: lean.safetyResult?.reasons || [],
        outboundSent: false,
        sendBlocked: true,
        note: 'Phase 1D approval does not send WhatsApp messages.',
    };
}

export async function editDraft(companyId, draftId, payload, userId, deps = {}) {
    const ReplyDraft = deps.ReplyDraft || WhatsAppAIReplyDraft;
    const doc = await loadDraft(ReplyDraft, companyId, draftId);
    if (['rejected', 'expired', 'sent'].includes(doc.status)) {
        throw badRequest('Draft cannot be edited in status ' + doc.status, 'DRAFT_NOT_EDITABLE');
    }
    const draftText = String(payload.draftText ?? '');
    if (draftText.length > WHATSAPP_AI_DRAFT_TEXT_MAX) {
        throw badRequest('Draft text too long', 'DRAFT_TOO_LONG');
    }
    const safety = validateDraftText(draftText);
    if (!safety.ok) {
        throw badRequest(safety.reasons.join('; '), 'safety_rejected');
    }
    const before = { status: doc.status, draftText: doc.draftText };
    doc.draftText = draftText;
    doc.status = 'edited';
    doc.reviewMeta = {
        ...(doc.reviewMeta?.toObject?.() || doc.reviewMeta || {}),
        editedAt: new Date(),
        editedBy: userId,
        outboundSent: false,
        readyForControlledSend: false,
    };
    doc.updatedBy = userId;
    await doc.save();

    await auditLog(deps, {
        companyId,
        conversationId: doc.conversationId,
        messageId: doc.sourceMessageId,
        actionType: 'reply_draft_edited',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: 'Edited reply draft text',
        beforeState: before,
        afterState: { status: doc.status, draftTextLength: draftText.length },
        success: true,
    });

    return { draft: publicDraft(doc), outboundSent: false };
}

export async function approveDraft(companyId, draftId, userId, deps = {}) {
    const ReplyDraft = deps.ReplyDraft || WhatsAppAIReplyDraft;
    const doc = await loadDraft(ReplyDraft, companyId, draftId);
    if (doc.status === 'approved') {
        return {
            draft: publicDraft(doc),
            duplicate: true,
            outboundSent: false,
            message: 'Already approved — ready for controlled sending later (not sent).',
        };
    }
    if (!['pending_review', 'edited', 'regeneration_requested'].includes(doc.status)) {
        throw badRequest('Draft cannot be approved from status ' + doc.status, 'DRAFT_NOT_APPROVABLE');
    }
    const before = { status: doc.status };
    doc.status = 'approved';
    doc.reviewMeta = {
        ...(doc.reviewMeta?.toObject?.() || doc.reviewMeta || {}),
        approvedAt: new Date(),
        approvedBy: userId,
        outboundSent: false,
        readyForControlledSend: true,
    };
    doc.updatedBy = userId;
    await doc.save();

    await auditLog(deps, {
        companyId,
        conversationId: doc.conversationId,
        messageId: doc.sourceMessageId,
        actionType: 'reply_draft_approved',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: 'Approved reply draft (no WhatsApp send)',
        beforeState: before,
        afterState: { status: 'approved', outboundSent: false, readyForControlledSend: true },
        success: true,
    });

    return {
        draft: publicDraft(doc),
        duplicate: false,
        outboundSent: false,
        autoApproved: false,
        message: 'Approved and ready for controlled sending later. Message was NOT sent.',
    };
}

export async function rejectDraft(companyId, draftId, payload, userId, deps = {}) {
    const ReplyDraft = deps.ReplyDraft || WhatsAppAIReplyDraft;
    const doc = await loadDraft(ReplyDraft, companyId, draftId);
    if (doc.status === 'rejected') {
        return { draft: publicDraft(doc), duplicate: true, outboundSent: false };
    }
    const reason = String(payload?.reason || '').slice(0, 1000);
    const before = { status: doc.status };
    doc.status = 'rejected';
    doc.reviewMeta = {
        ...(doc.reviewMeta?.toObject?.() || doc.reviewMeta || {}),
        rejectedAt: new Date(),
        rejectedBy: userId,
        rejectionReason: reason,
        outboundSent: false,
        readyForControlledSend: false,
    };
    doc.updatedBy = userId;
    await doc.save();

    await auditLog(deps, {
        companyId,
        conversationId: doc.conversationId,
        messageId: doc.sourceMessageId,
        actionType: 'reply_draft_rejected',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: 'Rejected reply draft',
        beforeState: before,
        afterState: { status: 'rejected', rejectionReason: reason },
        success: true,
    });

    return { draft: publicDraft(doc), duplicate: false, outboundSent: false };
}

export async function requestRegeneration(companyId, draftId, userId, deps = {}) {
    const ReplyDraft = deps.ReplyDraft || WhatsAppAIReplyDraft;
    const doc = await loadDraft(ReplyDraft, companyId, draftId);
    if (['rejected', 'expired', 'sent'].includes(doc.status)) {
        throw badRequest('Cannot request regeneration in status ' + doc.status);
    }
    const before = { status: doc.status };
    doc.status = 'regeneration_requested';
    doc.reviewMeta = {
        ...(doc.reviewMeta?.toObject?.() || doc.reviewMeta || {}),
        regenerationRequestedAt: new Date(),
        regenerationRequestedBy: userId,
        outboundSent: false,
        readyForControlledSend: false,
    };
    doc.updatedBy = userId;
    await doc.save();

    await auditLog(deps, {
        companyId,
        conversationId: doc.conversationId,
        messageId: doc.sourceMessageId,
        actionType: 'reply_draft_regeneration_requested',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: 'Requested draft regeneration (dry-run; no send)',
        beforeState: before,
        afterState: { status: 'regeneration_requested' },
        success: true,
    });

    return { draft: publicDraft(doc), outboundSent: false };
}

export async function addReviewNote(companyId, draftId, payload, userId, deps = {}) {
    const ReplyDraft = deps.ReplyDraft || WhatsAppAIReplyDraft;
    const doc = await loadDraft(ReplyDraft, companyId, draftId);
    const note = String(payload?.note || '').trim().slice(0, 2000);
    if (!note) throw badRequest('Note is required');
    doc.reviewNotes = doc.reviewNotes || [];
    doc.reviewNotes.push({ note, createdBy: userId, createdAt: new Date() });
    doc.updatedBy = userId;
    await doc.save();

    await auditLog(deps, {
        companyId,
        conversationId: doc.conversationId,
        messageId: doc.sourceMessageId,
        actionType: 'reply_draft_note_added',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: 'Added internal review note',
        structuredMetadata: { draftId: String(doc._id), noteLength: note.length },
        success: true,
    });

    return { draft: publicDraft(doc), outboundSent: false };
}

export default {
    listPendingDrafts,
    getDraftForReview,
    editDraft,
    approveDraft,
    rejectDraft,
    requestRegeneration,
    addReviewNote,
    publicDraft,
};
