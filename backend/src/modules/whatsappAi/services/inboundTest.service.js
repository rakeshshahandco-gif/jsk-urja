import { ApiError } from '../../../utils/ApiError.js';
import { WhatsAppAIConversation, WhatsAppAIMessage } from '../models/index.js';
import { assertNoBinaryPayload } from '../models/sharedFields.js';
import { assertNoForbiddenSettingsKeys } from '../constants/whatsappAi.constants.js';
import { getSettings } from './settings.service.js';
import { appendActionLog } from './audit.service.js';
import { normalizeWhatsAppAiMobile } from '../utils/normalizeMobile.js';

const ALLOWED_INBOUND_MODES = Object.freeze(['dry_run', 'scripted']);
const TEXT_MAX = 4000;

const FORBIDDEN_MEDIA_KEYS = Object.freeze([
    'attachment', 'attachments', 'media', 'mediaUrl', 'fileUrl', 'file', 'files',
    'image', 'audio', 'video', 'document', 'caption',
]);

async function findOneLean(Model, filter) {
    const q = Model.findOne(filter);
    if (q && typeof q.then === 'function' && typeof q.lean !== 'function') {
        return q;
    }
    if (q && typeof q.lean === 'function') return q.lean();
    return q;
}

export function assertInboundTestModeAllowed(mode) {
    if (!ALLOWED_INBOUND_MODES.includes(mode)) {
        throw new ApiError(
            400,
            `Inbound test rejected: mode must be dry_run or scripted (current: ${mode || 'disabled'})`,
        );
    }
}

export function assertInboundTestPayloadShape(payload = {}) {
    assertNoBinaryPayload(payload);
    assertNoForbiddenSettingsKeys(payload);
    for (const key of FORBIDDEN_MEDIA_KEYS) {
        if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] != null && payload[key] !== '') {
            throw new ApiError(400, `Media/attachment field not allowed: ${key}`);
        }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'companyId')) {
        throw new ApiError(400, 'companyId must not be supplied in the request body');
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'financialYearId')) {
        throw new ApiError(400, 'financialYearId must not be supplied in the request body');
    }
}

function buildResult({ mode, duplicate, conversationId, messageId }) {
    return {
        success: true,
        mode,
        duplicate: !!duplicate,
        conversationId: conversationId ? String(conversationId) : null,
        messageId: messageId ? String(messageId) : null,
        processing: 'stored_only',
        outboundSent: false,
        aiCalled: false,
        leadCreated: false,
    };
}

/**
 * Process one internal/test inbound message (dry-run / scripted only).
 * companyId MUST come from authenticated request context — never from payload.
 */
export async function processTestInbound(companyId, payload, userId, deps = {}) {
    if (!companyId) throw new ApiError(400, 'Company context required');

    const Conversation = deps.Conversation || WhatsAppAIConversation;
    const Message = deps.Message || WhatsAppAIMessage;
    const getSettingsFn = deps.getSettings || getSettings;
    const appendLog = deps.appendActionLog || appendActionLog;

    assertInboundTestPayloadShape(payload);

    const settings = await getSettingsFn(companyId);
    const mode = settings?.mode || 'disabled';
    assertInboundTestModeAllowed(mode);

    const externalMessageId = String(payload.externalMessageId || '').trim();
    if (!externalMessageId) throw new ApiError(400, 'externalMessageId is required');

    const normalizedMobile = normalizeWhatsAppAiMobile(payload.mobile);
    if (!normalizedMobile) throw new ApiError(400, 'Invalid mobile number');

    if (payload.messageType && payload.messageType !== 'text') {
        throw new ApiError(400, 'Only messageType=text is supported in Phase 1B-1');
    }
    const text = String(payload.text || '').trim();
    if (!text) throw new ApiError(400, 'text is required');
    if (text.length > TEXT_MAX) throw new ApiError(400, `text exceeds max length ${TEXT_MAX}`);

    const receivedAt = payload.receivedAt ? new Date(payload.receivedAt) : new Date();
    if (Number.isNaN(receivedAt.getTime())) throw new ApiError(400, 'Invalid receivedAt');

    const existingMsg = await findOneLean(Message, {
        companyId,
        providerMessageId: externalMessageId,
        isDeleted: false,
    });

    if (existingMsg) {
        await appendLog({
            companyId,
            conversationId: existingMsg.conversationId,
            messageId: existingMsg._id,
            actionType: 'inbound_test_duplicate',
            actorType: 'user',
            actorUserId: userId,
            actionSummary: 'Duplicate internal test inbound (idempotent)',
            structuredMetadata: {
                externalMessageId,
                mode,
                duplicate: true,
                source: 'internal_test',
            },
            success: true,
        });
        return buildResult({
            mode,
            duplicate: true,
            conversationId: existingMsg.conversationId,
            messageId: existingMsg._id,
        });
    }

    let conversation = await Conversation.findOne({
        companyId,
        normalizedMobile,
        isDeleted: false,
    });

    if (!conversation) {
        conversation = await Conversation.create({
            companyId,
            normalizedMobile,
            whatsappNumber: normalizedMobile,
            status: 'new_message',
            source: 'internal_test',
            assignedUserId: null,
            customerId: null,
            leadId: null,
            lastInboundAt: receivedAt,
            lastMessageAt: receivedAt,
            unreadCount: 1,
            createdBy: userId,
            updatedBy: userId,
        });
    } else {
        const patch = {
            lastInboundAt: receivedAt,
            lastMessageAt: receivedAt,
            updatedBy: userId,
        };
        await Conversation.updateOne(
            { _id: conversation._id, companyId },
            { $set: patch, $inc: { unreadCount: 1 } },
        );
    }

    const conversationId = conversation._id;

    let message;
    try {
        message = await Message.create({
            companyId,
            conversationId,
            providerMessageId: externalMessageId,
            idempotencyKey: `internal_test:${externalMessageId}`,
            direction: 'in',
            senderType: 'customer',
            messageType: 'text',
            text,
            processingStatus: 'received',
            deliveryStatus: 'read',
            createdBy: userId,
            updatedBy: userId,
        });
    } catch (err) {
        if (err && (err.code === 11000 || /duplicate/i.test(String(err.message)))) {
            const raced = await findOneLean(Message, {
                companyId,
                providerMessageId: externalMessageId,
                isDeleted: false,
            });
            if (raced) {
                return buildResult({
                    mode,
                    duplicate: true,
                    conversationId: raced.conversationId,
                    messageId: raced._id,
                });
            }
        }
        throw err;
    }

    await appendLog({
        companyId,
        conversationId,
        messageId: message._id,
        actionType: 'inbound_test_received',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: 'Internal test inbound message stored (dry-run pipeline)',
        structuredMetadata: {
            externalMessageId,
            mode,
            source: 'internal_test',
            normalizedMobile,
            textLength: text.length,
            contactNameProvided: Boolean(payload.contactName),
            duplicate: false,
        },
        success: true,
    });

    return buildResult({
        mode,
        duplicate: false,
        conversationId,
        messageId: message._id,
    });
}

export const INBOUND_TEST_TEXT_MAX = TEXT_MAX;
export const INBOUND_TEST_ALLOWED_MODES = ALLOWED_INBOUND_MODES;
