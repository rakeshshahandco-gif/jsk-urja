/**
 * WhatsApp AI - Phase 1A constants (foundation only).
 * No live WhatsApp / AI provider coupling.
 */

export const WHATSAPP_AI_FEATURE_PATH = 'communication.whatsappAiEnabled';

export const WHATSAPP_AI_MODES = Object.freeze(['disabled', 'dry_run', 'scripted']);
/** Modes rejected in Phase 1A (and any unknown value). */
export const WHATSAPP_AI_UNSUPPORTED_MODES = Object.freeze(['ai', 'live', 'autonomous']);

/** Normalize stored/requested mode to a Phase 1A-safe value. */
export function normalizeWhatsAppAiMode(mode) {
    if (WHATSAPP_AI_MODES.includes(mode)) return mode;
    return 'disabled';
}

/** Throw 400-style error for explicit unsupported mode writes. */
export function assertWhatsAppAiModeAllowed(mode) {
    if (mode === undefined || mode === null || mode === '') return;
    if (!WHATSAPP_AI_MODES.includes(mode)) {
        const err = new Error('Invalid settings mode: ' + String(mode) + '. Phase 1A allows only: disabled, dry_run, scripted.');
        err.statusCode = 400;
        throw err;
    }
}

export const WHATSAPP_AI_CONVERSATION_STATUSES = Object.freeze([
    'new_message',
    'ai_greeting',
    'awaiting_menu_selection',
    'product_category_selected',
    'awaiting_product_requirement',
    'document_shared',
    'collecting_customer_details',
    'duplicate_check',
    'ai_lead_draft_created',
    'waiting_for_salesperson',
    'human_handling',
    'waiting_for_customer',
    'resolved',
    'escalated',
    'failed',
]);

export const WHATSAPP_AI_MESSAGE_DIRECTIONS = Object.freeze(['in', 'out', 'system']);
export const WHATSAPP_AI_SENDER_TYPES = Object.freeze(['customer', 'ai', 'human', 'system']);
export const WHATSAPP_AI_MESSAGE_TYPES = Object.freeze([
    'text', 'image', 'document', 'audio', 'video', 'location', 'contact', 'interactive', 'system',
]);
export const WHATSAPP_AI_DELIVERY_STATUSES = Object.freeze([
    'pending', 'queued', 'sent', 'delivered', 'read', 'failed', 'skipped',
]);
export const WHATSAPP_AI_PROCESSING_STATUSES = Object.freeze([
    'received', 'queued', 'processing', 'processed', 'ignored', 'failed',
]);

export const WHATSAPP_AI_APPROVAL_STATUSES = Object.freeze([
    'draft', 'pending', 'approved', 'rejected', 'archived',
]);

export const WHATSAPP_AI_DOCUMENT_TYPES = Object.freeze([
    'catalogue', 'datasheet', 'brochure', 'image', 'other',
]);

export const WHATSAPP_AI_MEMORY_STATUSES = Object.freeze([
    'draft', 'pending_approval', 'approved', 'archived',
]);

export const WHATSAPP_AI_DUPLICATE_CHECK_STATUSES = Object.freeze([
    'pending', 'clear', 'possible_match', 'confirmed_duplicate', 'skipped',
]);

export const WHATSAPP_AI_ACTION_TYPES = Object.freeze([
    'settings_updated',
    'knowledge_created',
    'knowledge_updated',
    'knowledge_submitted',
    'knowledge_approved',
    'knowledge_rejected',
    'document_created',
    'document_updated',
    'conversation_viewed',
    'lead_draft_viewed',
    'permissions_checked',
    'dashboard_viewed',
    'inbound_test_received',
    'inbound_test_duplicate',
    'system',
]);

export const WHATSAPP_AI_ACTOR_TYPES = Object.freeze(['user', 'ai', 'system']);

export const WHATSAPP_AI_PERMISSIONS = Object.freeze({
    VIEW: 'whatsapp_ai.module.view',
    ARCHIVE: 'whatsapp_ai.module.archive',
    TAKEOVER: 'whatsapp_ai.module.takeover',
    RETURN_TO_AI: 'whatsapp_ai.module.return_to_ai',
    SETTINGS_MANAGE: 'whatsapp_ai.settings.manage',
    KNOWLEDGE_MANAGE: 'whatsapp_ai.knowledge.manage',
    KNOWLEDGE_APPROVE: 'whatsapp_ai.knowledge.approve',
    CONVERSATIONS_VIEW_ALL: 'whatsapp_ai.conversations.view_all',
    CONVERSATIONS_VIEW_ASSIGNED: 'whatsapp_ai.conversations.view_assigned',
    LEAD_DRAFT_CREATE: 'whatsapp_ai.lead_draft.create',
    LEAD_DRAFT_APPROVE: 'whatsapp_ai.lead_draft.approve',
    DOCUMENTS_MANAGE: 'whatsapp_ai.documents.manage',
    DOCUMENTS_SHARE: 'whatsapp_ai.documents.share',
    AUDIT_VIEW: 'whatsapp_ai.audit.view',
    DASHBOARD_VIEW: 'whatsapp_ai.dashboard.view',
    TESTING_INBOUND: 'whatsapp_ai.testing.inbound',
});

export const WHATSAPP_AI_DEFAULT_SETTINGS = Object.freeze({
    enabled: false,
    mode: 'disabled',
    defaultLanguage: 'en',
    welcomeMessage: '',
    workingHoursEnabled: false,
    workingHours: { timezone: 'Asia/Kolkata', windows: [] },
    outsideWorkingHoursMessage: '',
    botSessionUserId: null,
    autoLeadDraftEnabled: false,
    humanEscalationEnabled: true,
    confidenceThresholdHigh: 80,
    confidenceThresholdMedium: 60,
    confidenceThresholdLow: 0,
    maxMessagesPerMinute: 10,
    maxMessagesPerConversation: 200,
    approvedProductCategories: [],
    featureVersion: '1a',
});

export const WHATSAPP_AI_FORBIDDEN_SETTINGS_KEYS = Object.freeze([
    'apiKey', 'apiKeys', 'openaiApiKey', 'anthropicApiKey', 'aiApiKey',
    'secret', 'secrets', 'token', 'accessToken', 'privateKey',
    'session', 'authState', 'base64', 'binary', 'buffer', 'fileContent',
    'password', 'passwords', 'mongoUri', 'mongodbUri',
]);

/** Reject forbidden settings keys (API keys / binary / session). */
export function assertNoForbiddenSettingsKeys(payload = {}) {
    for (const key of WHATSAPP_AI_FORBIDDEN_SETTINGS_KEYS) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
            const err = new Error(`Forbidden settings field: ${key}`);
            err.statusCode = 400;
            throw err;
        }
    }
}

/** Knowledge may be active only when approvalStatus is approved. */
export function canKnowledgeBeActive(approvalStatus) {
    return approvalStatus === 'approved';
}

/** Force inactive unless approved. Returns corrected active flag. */
export function resolveKnowledgeActive(approvalStatus, requestedActive = false) {
    if (approvalStatus !== 'approved') return false;
    return Boolean(requestedActive);
}
