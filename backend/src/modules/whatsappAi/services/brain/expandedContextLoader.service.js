/**
 * Phase 1C.0 — Expanded Context Loader.
 * Loads conversation thread (same bounds as Phase 1B) and exposes structured packs.
 * Does NOT fetch CRM Customer/Lead/Sales/Quote documents in 1C.0 (placeholders only).
 * Ids already on the conversation document may be surfaced without extra CRM reads.
 */

import { WhatsAppAIConversation, WhatsAppAIMessage } from '../../models/index.js';
import { WHATSAPP_AI_CONTEXT_MAX_MESSAGES } from '../../constants/whatsappAi.constants.js';
import { ApiError } from '../../../../utils/ApiError.js';

function emptyPack(reason = 'not_loaded_in_1c0') {
    return { loaded: false, reason, data: null };
}

/**
 * @param {object} [options]
 * @param {number} [options.maxMessages]
 * @param {object} [options.deps]
 */
export function createExpandedContextLoader(options = {}) {
    const maxMessages = Math.min(
        Math.max(1, Number(options.maxMessages) || WHATSAPP_AI_CONTEXT_MAX_MESSAGES),
        WHATSAPP_AI_CONTEXT_MAX_MESSAGES,
    );
    const Conversation = options.deps?.Conversation || WhatsAppAIConversation;
    const Message = options.deps?.Message || WhatsAppAIMessage;

    return {
        /**
         * @param {{ companyId: any, conversationId: any, sourceMessageId?: any }} input
         */
        async load({ companyId, conversationId, sourceMessageId }) {
            if (!companyId || !conversationId) {
                throw new ApiError(400, 'Expanded context loader requires company and conversation');
            }

            let conversationQ = Conversation.findOne({
                _id: conversationId,
                companyId,
                isDeleted: false,
            });
            if (conversationQ && typeof conversationQ.lean === 'function') {
                conversationQ = conversationQ.lean();
            }
            const conversation = await conversationQ;
            if (!conversation) {
                throw new ApiError(404, 'Conversation not found for expanded context');
            }

            let messagesQuery = Message.find({
                companyId,
                conversationId,
                isDeleted: false,
            }).sort({ createdAt: -1 }).limit(maxMessages);

            if (typeof messagesQuery.lean === 'function') {
                messagesQuery = messagesQuery.lean();
            }
            const recent = await messagesQuery;
            const messages = (Array.isArray(recent) ? recent : []).slice().reverse().map((m) => ({
                messageId: String(m._id),
                direction: m.direction,
                messageType: m.messageType,
                text: String(m.text || '').slice(0, 2000),
                createdAt: m.createdAt || null,
                isSource: sourceMessageId ? String(m._id) === String(sourceMessageId) : false,
            }));

            const source = messages.find((m) => m.isSource) || messages[messages.length - 1] || null;

            return {
                companyId: String(companyId),
                conversationId: String(conversationId),
                normalizedMobile: conversation.normalizedMobile || '',
                conversationSource: conversation.source || '',
                language: conversation.preferredLanguage || 'en',
                currentMessage: source,
                thread: messages,
                // Backward-compatible alias used by prompt builder / tests
                messages,
                packs: {
                    message: { loaded: true, data: source },
                    thread: { loaded: true, data: messages },
                    customer: conversation.customerId
                        ? { loaded: false, reason: 'id_only_no_crm_fetch', data: { customerId: String(conversation.customerId) } }
                        : emptyPack('no_customer_link'),
                    contact: emptyPack('not_loaded_in_1c0'),
                    lead: conversation.leadId
                        ? { loaded: false, reason: 'id_only_no_crm_fetch', data: { leadId: String(conversation.leadId) } }
                        : emptyPack('no_lead_link'),
                    inquiry: emptyPack('not_loaded_in_1c0'),
                    salesLite: emptyPack('not_loaded_in_1c0'),
                    quotesLite: emptyPack('not_loaded_in_1c0'),
                    company: emptyPack('not_loaded_in_1c0'),
                    assignee: conversation.assignedUserId
                        ? { loaded: false, reason: 'id_only_no_crm_fetch', data: { assignedUserId: String(conversation.assignedUserId) } }
                        : emptyPack('unassigned'),
                },
                optionalContext: {
                    customerProfile: null,
                    productCatalogue: null,
                    manuals: null,
                    warranty: null,
                    knowledgeBase: null,
                },
            };
        },
    };
}

export default createExpandedContextLoader;
