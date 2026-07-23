/**
 * Phase 1C.0 — AI Brain foundation public exports.
 * No routes wired here — Phase 1B APIs unchanged.
 */

export {
    WHATSAPP_AI_BRAIN_INTENT_TYPES,
    mapLegacyIntentToBrain,
    isBrainIntent,
} from './intent/intentTaxonomy.js';
export { createIntentDetector } from './intent/intentDetector.service.js';
export { WHATSAPP_AI_ENTITY_KEYS, emptyEntityMap } from './entities/entitySchema.js';
export { createEntityExtractor } from './entities/entityExtractor.service.js';
export { createExpandedContextLoader } from './expandedContextLoader.service.js';
export { createHybridRouter, routeHybrid } from './hybridRouter.service.js';
export { createPromptBuilder, buildPromptBundle, PROMPT_BUNDLE_VERSION, PROMPT_BUILDER_LIMITS } from './prompt/promptBuilder.service.js';
export {
    isAiProvider,
    assertCompletionRequest,
    estimateTokensRough,
    createHttpTransport,
    PROVIDER_FRAMEWORK_VERSION,
    PROVIDER_IDS,
    DEFAULT_PROVIDER_RUNTIME_CONFIG,
    resolveCompanyProviderConfig,
    maskSecret,
    assertNoApiKeysInPayload,
    resolveSecretRef,
    secretStatus,
    createNullProvider,
    NULL_PROVIDER_ID,
    NULL_PROVIDER_MODEL,
    NULL_PROVIDER_DUMMY_TEXT,
    createOpenAIProvider,
    OPENAI_PROVIDER_ID,
    createGeminiProvider,
    GEMINI_PROVIDER_ID,
    createClaudeProvider,
    CLAUDE_PROVIDER_ID,
    createLocalLlmProvider,
    LOCAL_PROVIDER_ID,
    createProviderRegistry,
} from './providers/index.js';
export {
    createAiBrain,
    runAiBrainFoundation,
    AI_BRAIN_FOUNDATION_VERSION,
} from './aiBrain.service.js';

export {
    JSK_PRODUCT_FAMILIES,
    getProductFamilyById,
    JSK_PRODUCT_ALIASES,
    detectLanguageDetailed,
    detectPrimaryLanguageCode,
    createProductIntelligenceEngine,
    analyzeProductIntelligence,
    productIntelligenceToEntityMap,
    JSK_PRODUCT_INTELLIGENCE_VERSION,
} from './productIntelligence/index.js';

export {
    GROUNDING_PACK_VERSION,
    KNOWLEDGE_RETRIEVAL_LIMITS,
    createApprovedKnowledgeRepository,
    isCustomerSafeKnowledge,
    buildRetrievalQuery,
    scoreKnowledgeDocument,
    buildGroundingPack,
    createKnowledgeRetrievalEngine,
    retrieveApprovedGrounding,
} from './knowledge/index.js';

export { createSafetyValidator, validateSafety, rewriteSafeDraft, SAFETY_ENGINE_VERSION } from './safety/index.js';
export { createBudgetEngine, BUDGET_ENGINE_VERSION, DEFAULT_BUDGET_LIMITS } from './budget/index.js';
export { createHybridCostRouter, routeWithCostControls, HYBRID_COST_ROUTER_VERSION } from './hybridCostRouter.service.js';
