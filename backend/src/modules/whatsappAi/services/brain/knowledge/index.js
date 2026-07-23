/**
 * Phase 1C.2 — Knowledge retrieval public exports.
 */

export {
    GROUNDING_PACK_VERSION,
    KNOWLEDGE_RETRIEVAL_LIMITS,
    KNOWLEDGE_CATEGORY_BUCKETS,
    KNOWLEDGE_EXCLUDE_TOKENS,
} from './retrievalLimits.js';
export {
    createApprovedKnowledgeRepository,
    createEmptyReadModel,
    isCustomerSafeKnowledge,
    isCustomerSafeDocument,
} from './approvedKnowledgeRepository.js';
export {
    buildRetrievalQuery,
    scoreKnowledgeDocument,
    scoreDocumentReference,
    tokenizeKeywords,
} from './relevanceScorer.js';
export { buildGroundingPack, truncateSnippet } from './groundingPack.builder.js';
export {
    createKnowledgeRetrievalEngine,
    retrieveApprovedGrounding,
} from './knowledgeRetrieval.service.js';
