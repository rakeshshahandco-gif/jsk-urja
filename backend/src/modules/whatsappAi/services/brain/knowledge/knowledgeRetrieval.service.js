/**
 * Phase 1C.2 — Approved Knowledge Retrieval Engine.
 * Read-only. Deterministic. No AI / network / WhatsApp / CRM writes.
 */

import { createApprovedKnowledgeRepository } from './approvedKnowledgeRepository.js';
import {
    buildRetrievalQuery,
    scoreKnowledgeDocument,
    scoreDocumentReference,
} from './relevanceScorer.js';
import { buildGroundingPack } from './groundingPack.builder.js';
import { KNOWLEDGE_RETRIEVAL_LIMITS, GROUNDING_PACK_VERSION } from './retrievalLimits.js';

function hasApprovedPriceFact(sources) {
    return sources.some((s) => {
        const cat = String(s.category || '').toLowerCase();
        const text = `${s.title} ${s.contentSnippet}`.toLowerCase();
        if (cat.includes('price') || cat.includes('commercial') || cat.includes('sales_policy')) {
            return /\b(price|rate|₹|rs\.?|inr)\b/i.test(text);
        }
        return false;
    });
}

/**
 * @param {object} [options]
 */
export function createKnowledgeRetrievalEngine(options = {}) {
    const repository = options.repository || createApprovedKnowledgeRepository({
        deps: options.deps,
        limits: options.limits,
    });
    const limits = { ...KNOWLEDGE_RETRIEVAL_LIMITS, ...(options.limits || {}) };
    const minScore = options.minScore != null ? options.minScore : 8;

    return {
        version: GROUNDING_PACK_VERSION,

        /**
         * @param {{
         *   companyId: any,
         *   conversationId?: any,
         *   messageId?: any,
         *   messageText?: string,
         *   intent?: string,
         *   productIntelligence?: object,
         * }} input companyId MUST be trusted orchestrator context
         */
        async retrieve(input = {}) {
            const companyId = input.companyId;
            const messageText = String(input.messageText || '');
            const query = buildRetrievalQuery({
                intent: input.intent,
                productIntelligence: input.productIntelligence,
                messageText,
            });

            if (!companyId) {
                return buildGroundingPack({
                    companyId: null,
                    conversationId: input.conversationId,
                    messageId: input.messageId,
                    query,
                    scoredCandidates: [],
                    limits,
                });
            }

            if (!messageText.trim() && !query.productFamilies.length && !query.protocols.length) {
                const pack = buildGroundingPack({
                    companyId,
                    conversationId: input.conversationId,
                    messageId: input.messageId,
                    query,
                    scoredCandidates: [],
                    limits,
                });
                if (!pack.warnings.includes('empty_message')) pack.warnings.push('empty_message');
                return pack;
            }

            const [knowledgeRows, documentRows] = await Promise.all([
                repository.listApprovedActiveKnowledge(companyId),
                repository.listApprovedActiveDocuments(companyId),
            ]);

            const scoredCandidates = [];

            for (const doc of knowledgeRows) {
                const { score, matchedReasons } = scoreKnowledgeDocument(doc, query);
                if (score < minScore) continue;
                scoredCandidates.push({
                    sourceType: 'knowledge',
                    sourceId: doc._id,
                    title: doc.title,
                    category: doc.category || '',
                    language: doc.language || 'en',
                    productFamily: query.productFamilies[0] || null,
                    contentSnippet: doc.content || doc.title || '',
                    score,
                    matchedReasons,
                });
            }

            for (const doc of documentRows) {
                const { score, matchedReasons } = scoreDocumentReference(doc, query);
                if (score < minScore) continue;
                scoredCandidates.push({
                    sourceType: 'document_reference',
                    sourceId: doc._id,
                    title: doc.title,
                    category: doc.documentType || 'document',
                    language: doc.language || 'en',
                    productFamily: query.productFamilies[0] || null,
                    contentSnippet: `${doc.title} (${doc.documentType || 'document'})`,
                    score,
                    matchedReasons,
                });
            }

            let pack = buildGroundingPack({
                companyId,
                conversationId: input.conversationId,
                messageId: input.messageId,
                query,
                scoredCandidates,
                limits,
            });

            // Price enquiry: if no approved commercial price fact, flag for human review
            if (query.intent === 'price_enquiry' && !hasApprovedPriceFact(pack.sources)) {
                const warnings = [...pack.warnings];
                if (!warnings.includes('no_approved_price_fact')) warnings.push('no_approved_price_fact');
                pack = {
                    ...pack,
                    warnings,
                    requiresHumanReview: true,
                };
            }

            return pack;
        },
    };
}

export async function retrieveApprovedGrounding(input, options = {}) {
    return createKnowledgeRetrievalEngine(options).retrieve(input);
}

export default createKnowledgeRetrievalEngine;
