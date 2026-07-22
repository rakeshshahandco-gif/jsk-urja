/**
 * WhatsApp AI frontend constants — Phase 1A foundation.
 * Keys must match backend permission registry exactly.
 */
export const WHATSAPP_AI_FEATURE = 'communication.whatsappAiEnabled';

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
    TESTING_GENERATE_DRAFT: 'whatsapp_ai.testing.generate_draft',
});

export const FOUNDATION_NOTICE =
    'Foundation Phase — No live automation enabled. Live WhatsApp, AI providers, and lead promotion are not connected.';

export const DASHBOARD_CARD_DEFS = [
    { key: 'conversationsToday', label: 'Conversations Today' },
    { key: 'activeAiConversations', label: 'Active AI Conversations' },
    { key: 'waitingForHuman', label: 'Waiting for Human' },
    { key: 'leadDrafts', label: 'Lead Drafts' },
    { key: 'humanTakeovers', label: 'Human Takeovers' },
    { key: 'aiSuccessRate', label: 'AI Success Rate', suffix: '%' },
    { key: 'averageResponseTimeSeconds', label: 'Average Response Time', suffix: 's' },
    { key: 'mostAskedProduct', label: 'Most Asked Product' },
    { key: 'documentsShared', label: 'Documents Shared' },
    { key: 'unansweredQuestions', label: 'Unanswered Questions' },
];

export const ZERO_DASHBOARD = Object.freeze({
    conversationsToday: 0,
    activeAiConversations: 0,
    waitingForHuman: 0,
    leadDrafts: 0,
    humanTakeovers: 0,
    aiSuccessRate: 0,
    averageResponseTimeSeconds: 0,
    mostAskedProduct: null,
    documentsShared: 0,
    unansweredQuestions: 0,
    featureVersion: '1a',
    liveProcessingEnabled: false,
});

export function confidenceTone(value) {
    if (value == null || Number.isNaN(Number(value))) return 'neutral';
    const n = Number(value);
    if (n >= 80) return 'green';
    if (n >= 60) return 'yellow';
    return 'red';
}
