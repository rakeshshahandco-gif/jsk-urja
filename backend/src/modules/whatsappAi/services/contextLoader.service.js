/**
 * ContextLoader interface — Phase 1B-2 loads only controlled conversation snippets.
 * Structure supports optional future context sources without rewriting orchestration.
 */

import { WhatsAppAIConversation, WhatsAppAIMessage } from '../models/index.js';
import { WHATSAPP_AI_CONTEXT_MAX_MESSAGES } from '../constants/whatsappAi.constants.js';
import { ApiError } from '../../../utils/ApiError.js';

/**
 * @param {object} [options]
 * @param {number} [options.maxMessages]
 * @param {object} [options.deps] injectable models for tests
 */
export function createContextLoader(options = {}) {
    const maxMessages = Math.min(
        Math.max(1, Number(options.maxMessages) || WHATSAPP_AI_CONTEXT_MAX_MESSAGES),
        WHATSAPP_AI_CONTEXT_MAX_MESSAGES,
    );
    const Conversation = options.deps?.Conversation || WhatsAppAIConversation;
    const Message = options.deps?.Message || WhatsAppAIMessage;

    return {
        /**
         * Load safe test context only. Future: optional profile/catalogue/knowledge plugins.
         * @param {{ companyId: any, conversationId: any, sourceMessageId: any }} input
         */
        async load({ companyId, conversationId, sourceMessageId }) {
            if (!companyId || !conversationId) {
                throw new ApiError(400, 'Context loader requires company and conversation');
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
                throw new ApiError(404, 'Conversation not found for context');
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
                isSource: String(m._id) === String(sourceMessageId),
            }));

            return {
                companyId: String(companyId),
                conversationId: String(conversationId),
                normalizedMobile: conversation.normalizedMobile || '',
                conversationSource: conversation.source || '',
                messages,
                // Reserved extension points (empty in Phase 1B-2 — never loaded from CRM).
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

export default createContextLoader;
