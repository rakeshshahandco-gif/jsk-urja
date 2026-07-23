/**
 * Phase 1E — Controlled outbound gateway (test/simulation only).
 * Does NOT connect to Baileys, WhatsApp Chat, Bulk Messaging, or Meta API.
 */

import {
    OUTBOUND_GATEWAY_VERSION,
    DEFAULT_OUTBOUND_CONFIG,
    isOutboundEnvEnabled,
} from './outboundDefaults.js';

const sendLocks = new Map();
const idempotencySeen = new Map();
const rateBuckets = new Map();

function bad(msg, code = 'OUTBOUND_BLOCKED', statusCode = 400) {
    const err = new Error(msg);
    err.statusCode = statusCode;
    err.code = code;
    return err;
}

function companyKey(companyId) {
    return companyId == null ? '_none' : String(companyId);
}

function checkRateLimit(companyId, cfg) {
    const key = companyKey(companyId);
    const now = Date.now();
    const bucket = rateBuckets.get(key) || { windowStart: now, count: 0 };
    if (now - bucket.windowStart > 60_000) {
        bucket.windowStart = now;
        bucket.count = 0;
    }
    if (bucket.count >= cfg.rateLimitPerMinute) {
        return { ok: false, reason: 'rate_limit' };
    }
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    return { ok: true };
}

export function createOutboundGateway(options = {}) {
    const cfg = { ...DEFAULT_OUTBOUND_CONFIG, ...(options.config || {}) };
    const env = options.env || process.env;
    const audit = options.appendActionLog || (async () => null);

    function validateKillSwitch() {
        if (cfg.killSwitch === true || !isOutboundEnvEnabled(env) || cfg.outboundEnabled !== true) {
            return { ok: false, status: 'send_blocked', reason: 'kill_switch_or_disabled' };
        }
        return { ok: true };
    }

    function validateApproval(draft) {
        if (!draft) throw bad('Draft required', 'DRAFT_REQUIRED');
        if (draft.status !== 'approved') {
            throw bad('Draft must be approved before outbound', 'DRAFT_NOT_APPROVED');
        }
        if (draft.reviewMeta?.outboundSent === true) {
            throw bad('Draft already marked sent', 'DUPLICATE_SEND');
        }
        return true;
    }

    function validateRecipient(recipient) {
        const mobile = String(recipient?.normalizedMobile || recipient?.mobile || '').replace(/\D/g, '');
        if (mobile.length < 10) throw bad('Invalid recipient', 'INVALID_RECIPIENT');
        return { normalizedMobile: mobile };
    }

    function validateCompany(companyId, draft) {
        if (!companyId) throw bad('Company required', 'COMPANY_REQUIRED');
        if (draft && String(draft.companyId) !== String(companyId)) {
            throw bad('Company mismatch', 'COMPANY_MISMATCH', 403);
        }
        return true;
    }

    function validateConversation(conversation) {
        if (!conversation) throw bad('Conversation required', 'CONVERSATION_REQUIRED');
        if (conversation.isDeleted) throw bad('Conversation deleted', 'CONVERSATION_DELETED');
        return true;
    }

    function validatePermissions(user) {
        if (!user) throw bad('User required', 'UNAUTHORIZED', 401);
        if (user.permissionsDenied === true) {
            throw bad('Permission denied', 'FORBIDDEN', 403);
        }
        return true;
    }

    function validateDuplicateSend(idempotencyKey) {
        const key = String(idempotencyKey || '');
        if (!key) throw bad('Idempotency key required', 'IDEMPOTENCY_REQUIRED');
        const prev = idempotencySeen.get(key);
        if (prev) {
            return { duplicate: true, previous: prev };
        }
        return { duplicate: false };
    }

    function validateProviderSession() {
        return { ok: true, session: 'test_mode', live: false };
    }

    function validateRateLimit(companyId) {
        return checkRateLimit(companyId, cfg);
    }

    async function sendApprovedDraft(input = {}) {
        const companyId = input.companyId;
        const draft = input.draft;
        const conversation = input.conversation;
        const recipient = input.recipient || conversation;
        const user = input.user || {};
        const idempotencyKey = input.idempotencyKey
            || ('outbound:' + companyId + ':' + (draft?.id || draft?._id) + ':' + (draft?.updatedAt || ''));
        const manualConfirmed = input.manualConfirmed === true;

        validateCompany(companyId, draft);
        validatePermissions(user);
        validateApproval(draft);
        validateConversation(conversation);
        const to = validateRecipient(recipient);
        validateProviderSession();

        const dup = validateDuplicateSend(idempotencyKey);
        if (dup.duplicate) {
            return {
                version: OUTBOUND_GATEWAY_VERSION,
                status: 'simulated',
                duplicate: true,
                outboundSent: false,
                previous: dup.previous,
                message: 'Duplicate send attempt blocked (idempotent).',
            };
        }

        if (cfg.requireManualConfirmation && !manualConfirmed) {
            return {
                version: OUTBOUND_GATEWAY_VERSION,
                status: 'send_blocked',
                outboundSent: false,
                reason: 'manual_confirmation_required',
                message: 'Manual confirmation required before outbound test.',
            };
        }

        const kill = validateKillSwitch();
        if (!kill.ok) {
            const result = {
                version: OUTBOUND_GATEWAY_VERSION,
                status: 'send_blocked',
                outboundSent: false,
                reason: kill.reason,
                readyForLiveActivation: false,
                message: 'Outbound kill switch / WHATSAPP_AI_OUTBOUND_ENABLED=false — simulated audit only.',
            };
            await audit({
                companyId,
                conversationId: conversation?._id || conversation?.id || null,
                actionType: 'system',
                actorType: 'user',
                actorUserId: user.id || user._id || null,
                actionSummary: 'Outbound send blocked (Phase 1E test gateway)',
                structuredMetadata: { status: result.status, reason: result.reason, idempotencyKey },
                success: true,
            });
            idempotencySeen.set(idempotencyKey, result);
            return result;
        }

        const rate = validateRateLimit(companyId);
        if (!rate.ok) {
            return {
                version: OUTBOUND_GATEWAY_VERSION,
                status: 'failed_test',
                outboundSent: false,
                reason: 'rate_limit',
            };
        }

        const lockKey = companyKey(companyId) + ':' + to.normalizedMobile;
        if (sendLocks.get(lockKey)) {
            return {
                version: OUTBOUND_GATEWAY_VERSION,
                status: 'send_blocked',
                outboundSent: false,
                reason: 'send_lock',
            };
        }
        sendLocks.set(lockKey, true);
        try {
            const result = {
                version: OUTBOUND_GATEWAY_VERSION,
                status: 'simulated',
                outboundSent: false,
                channel: 'test_stub',
                recipient: to.normalizedMobile,
                draftId: String(draft.id || draft._id),
                queued: false,
                deliveryStatus: 'not_submitted',
                message: 'Simulated outbound only. Live WhatsApp sending remains disabled.',
                readyForLiveActivation: false,
            };
            await audit({
                companyId,
                conversationId: conversation?._id || conversation?.id || null,
                actionType: 'system',
                actorType: 'user',
                actorUserId: user.id || user._id || null,
                actionSummary: 'Outbound simulated (Phase 1E)',
                structuredMetadata: { status: result.status, idempotencyKey, channel: 'test_stub' },
                success: true,
            });
            idempotencySeen.set(idempotencyKey, result);
            return result;
        } finally {
            sendLocks.delete(lockKey);
        }
    }

    return {
        version: OUTBOUND_GATEWAY_VERSION,
        config: { ...cfg, envOutboundEnabled: isOutboundEnvEnabled(env) },
        sendApprovedDraft,
        validateApproval,
        validateRecipient,
        validateCompany,
        validateConversation,
        validatePermissions,
        validateKillSwitch,
        validateRateLimit,
        validateDuplicateSend,
        validateProviderSession,
    };
}

export default createOutboundGateway;
