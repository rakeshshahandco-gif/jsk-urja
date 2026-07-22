import { ApiError } from '../../../utils/ApiError.js';
import {
    WhatsAppAIConversation,
    WhatsAppAIMessage,
    WhatsAppAIReplyDraft,
} from '../models/index.js';
import {
    WHATSAPP_AI_DEFAULT_PROCESSING_VERSION,
    assertNoForbiddenSettingsKeys,
} from '../constants/whatsappAi.constants.js';
import { assertNoBinaryPayload } from '../models/sharedFields.js';
import { getSettings } from './settings.service.js';
import { appendActionLog } from './audit.service.js';
import { createContextLoader } from './contextLoader.service.js';
import { createIntentClassifier } from './intentClassifier.js';
import { createDraftGenerator } from './draftGenerator.js';
import { validateDraftText } from './draftSafety.service.js';

const ALLOWED_MODES = Object.freeze(['dry_run', 'scripted']);

async function findOneLean(Model, filter) {
    const q = Model.findOne(filter);
    if (q && typeof q.then === 'function' && typeof q.lean !== 'function') return q;
    if (q && typeof q.lean === 'function') return q.lean();
    return q;
}

function buildIdempotencyKey(companyId, sourceMessageId, processingVersion) {
    return `${String(companyId)}:${String(sourceMessageId)}:${processingVersion}`;
}

function assertModeAllowed(mode) {
    if (!ALLOWED_MODES.includes(mode)) {
        throw new ApiError(
            400,
            `Draft generation rejected: mode must be dry_run or scripted (current: ${mode || 'disabled'})`,
        );
    }
}

function assertGeneratePayloadShape(payload = {}) {
    assertNoBinaryPayload(payload);
    assertNoForbiddenSettingsKeys(payload);
    if (Object.prototype.hasOwnProperty.call(payload, 'companyId')) {
        throw new ApiError(400, 'companyId must not be supplied in the request body');
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'financialYearId')) {
        throw new ApiError(400, 'financialYearId must not be supplied in the request body');
    }
}

function isInternalTestMessage(message, conversation) {
    if (!message || !conversation) return false;
    if (conversation.source === 'internal_test') return true;
    const key = String(message.idempotencyKey || '');
    return key.startsWith('internal_test:');
}

function summarizeDraft(doc) {
    return {
        success: true,
        duplicate: false,
        draftId: doc?._id ? String(doc._id) : null,
        status: doc?.status || null,
        intent: doc?.intent || null,
        confidence: doc?.confidence ?? null,
        detectedLanguage: doc?.detectedLanguage || null,
        processingVersion: doc?.processingVersion || null,
        processingMs: doc?.processingMs ?? null,
        generationMode: doc?.generationMode || 'deterministic_test',
        outboundSent: false,
        aiCalled: false,
        leadCreated: false,
    };
}

function publicDraftView(doc) {
    if (!doc) return null;
    return {
        draftId: String(doc._id),
        companyId: String(doc.companyId),
        conversationId: String(doc.conversationId),
        sourceMessageId: String(doc.sourceMessageId),
        intent: doc.intent,
        intentReason: doc.intentReason || '',
        confidence: doc.confidence,
        detectedLanguage: doc.detectedLanguage,
        draftText: doc.draftText,
        status: doc.status,
        generationMode: doc.generationMode,
        processingVersion: doc.processingVersion,
        safetyResult: doc.safetyResult,
        processingStartedAt: doc.processingStartedAt,
        processingCompletedAt: doc.processingCompletedAt,
        processingMs: doc.processingMs,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}

/**
 * Generate a dry-run AI reply draft from an internal test inbound message.
 * Does not return draftText — fetch via getTestDraft.
 */
export async function generateTestDraft(companyId, payload, userId, deps = {}) {
    if (!companyId) throw new ApiError(400, 'Company context required');

    const Conversation = deps.Conversation || WhatsAppAIConversation;
    const Message = deps.Message || WhatsAppAIMessage;
    const ReplyDraft = deps.ReplyDraft || WhatsAppAIReplyDraft;
    const getSettingsFn = deps.getSettings || getSettings;
    const appendLog = deps.appendActionLog || appendActionLog;
    const processingVersion = deps.processingVersion || WHATSAPP_AI_DEFAULT_PROCESSING_VERSION;
    const contextLoader = deps.contextLoader || createContextLoader({ deps: { Conversation, Message } });
    const classifier = deps.intentClassifier || createIntentClassifier();
    const generator = deps.draftGenerator || createDraftGenerator();

    assertGeneratePayloadShape(payload || {});

    const messageId = String(payload?.messageId || '').trim();
    if (!/^[a-f0-9]{24}$/i.test(messageId)) {
        throw new ApiError(400, 'messageId is required');
    }

    const settings = await getSettingsFn(companyId);
    const mode = settings?.mode || 'disabled';
    assertModeAllowed(mode);

    await appendLog({
        companyId,
        conversationId: null,
        messageId,
        actionType: 'test_draft_requested',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: 'Internal test draft generation requested',
        structuredMetadata: {
            sourceMessageId: messageId,
            mode,
            processingVersion,
        },
        success: true,
    });

    const processingStartedAt = new Date();
    const idempotencyKey = buildIdempotencyKey(companyId, messageId, processingVersion);

    const existing = await findOneLean(ReplyDraft, {
        companyId,
        sourceMessageId: messageId,
        processingVersion,
        isDeleted: false,
    });
    if (existing) {
        await appendLog({
            companyId,
            conversationId: existing.conversationId,
            messageId,
            actionType: 'test_draft_duplicate',
            actorType: 'user',
            actorUserId: userId,
            actionSummary: 'Duplicate internal test draft (idempotent)',
            structuredMetadata: {
                draftId: String(existing._id),
                sourceMessageId: messageId,
                intent: existing.intent,
                mode,
                textLength: String(existing.draftText || '').length,
                status: existing.status,
            },
            success: true,
        });
        return { ...summarizeDraft(existing), duplicate: true };
    }

    const message = await findOneLean(Message, {
        _id: messageId,
        companyId,
        isDeleted: false,
    });
    if (!message) throw new ApiError(404, 'Message not found');

    if (message.direction !== 'in') {
        throw new ApiError(400, 'Only inbound messages can generate a test draft');
    }
    if (message.messageType !== 'text') {
        throw new ApiError(400, 'Only text messages can generate a test draft');
    }

    const conversation = await findOneLean(Conversation, {
        _id: message.conversationId,
        companyId,
        isDeleted: false,
    });
    if (!conversation) throw new ApiError(404, 'Conversation not found');

    if (!isInternalTestMessage(message, conversation)) {
        throw new ApiError(400, 'Only internal_test messages can generate a test draft');
    }

    const context = await contextLoader.load({
        companyId,
        conversationId: conversation._id,
        sourceMessageId: message._id,
    });

    const classified = classifier.classify(message.text || '');
    const generated = generator.generate({ intent: classified.intent, context });
    const safety = validateDraftText(generated.draftText);
    const processingCompletedAt = new Date();
    const processingMs = Math.max(0, processingCompletedAt.getTime() - processingStartedAt.getTime());

    if (!safety.ok) {
        await appendLog({
            companyId,
            conversationId: conversation._id,
            messageId: message._id,
            actionType: 'test_draft_rejected',
            actorType: 'user',
            actorUserId: userId,
            actionSummary: 'Internal test draft rejected by safety validation',
            structuredMetadata: {
                sourceMessageId: String(message._id),
                intent: classified.intent,
                mode,
                textLength: String(generated.draftText || '').length,
                status: 'rejected',
                safetyCode: safety.code,
            },
            success: false,
            errorCode: safety.code,
            errorSummary: (safety.reasons || []).slice(0, 3).join('; '),
        });

        // Persist a rejected record so idempotency still applies for this version.
        let rejected;
        try {
            rejected = await ReplyDraft.create({
                companyId,
                conversationId: conversation._id,
                sourceMessageId: message._id,
                intent: classified.intent,
                intentReason: classified.intentReason,
                confidence: classified.confidence,
                detectedLanguage: classified.detectedLanguage,
                draftText: '',
                status: 'rejected',
                generationMode: 'deterministic_test',
                processingVersion,
                safetyResult: safety,
                idempotencyKey,
                processingStartedAt,
                processingCompletedAt,
                processingMs,
                createdBy: userId,
                updatedBy: userId,
            });
        } catch (err) {
            if (err && (err.code === 11000 || /duplicate/i.test(String(err.message)))) {
                const raced = await findOneLean(ReplyDraft, {
                    companyId,
                    sourceMessageId: messageId,
                    processingVersion,
                    isDeleted: false,
                });
                if (raced) return { ...summarizeDraft(raced), duplicate: true };
            }
            throw err;
        }
        return { ...summarizeDraft(rejected), duplicate: false };
    }

    let created;
    try {
        created = await ReplyDraft.create({
            companyId,
            conversationId: conversation._id,
            sourceMessageId: message._id,
            intent: classified.intent,
            intentReason: classified.intentReason,
            confidence: classified.confidence,
            detectedLanguage: classified.detectedLanguage,
            draftText: generated.draftText,
            status: 'pending_review',
            generationMode: 'deterministic_test',
            processingVersion,
            safetyResult: safety,
            idempotencyKey,
            processingStartedAt,
            processingCompletedAt,
            processingMs,
            createdBy: userId,
            updatedBy: userId,
        });
    } catch (err) {
        if (err && (err.code === 11000 || /duplicate/i.test(String(err.message)))) {
            const raced = await findOneLean(ReplyDraft, {
                companyId,
                sourceMessageId: messageId,
                processingVersion,
                isDeleted: false,
            });
            if (raced) return { ...summarizeDraft(raced), duplicate: true };
        }
        throw err;
    }

    await appendLog({
        companyId,
        conversationId: conversation._id,
        messageId: message._id,
        actionType: 'test_draft_created',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: 'Internal test draft created (pending review)',
        structuredMetadata: {
            draftId: String(created._id),
            sourceMessageId: String(message._id),
            intent: classified.intent,
            mode,
            textLength: String(generated.draftText || '').length,
            status: 'pending_review',
        },
        success: true,
    });

    return { ...summarizeDraft(created), duplicate: false };
}

export async function getTestDraft(companyId, draftId, deps = {}) {
    if (!companyId) throw new ApiError(400, 'Company context required');
    if (!/^[a-f0-9]{24}$/i.test(String(draftId || ''))) {
        throw new ApiError(400, 'Invalid draft id');
    }
    const ReplyDraft = deps.ReplyDraft || WhatsAppAIReplyDraft;
    const doc = await findOneLean(ReplyDraft, {
        _id: draftId,
        companyId,
        isDeleted: false,
    });
    if (!doc) throw new ApiError(404, 'Draft not found');
    return publicDraftView(doc);
}

export {
    buildIdempotencyKey,
    isInternalTestMessage,
    summarizeDraft,
    publicDraftView,
};
