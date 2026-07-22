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
export { createPromptBuilder, buildPromptBundle } from './prompt/promptBuilder.service.js';
export { isAiProvider, assertCompletionRequest } from './providers/AiProvider.interface.js';
export {
    createNullProvider,
    NULL_PROVIDER_ID,
    NULL_PROVIDER_MODEL,
    NULL_PROVIDER_DUMMY_TEXT,
} from './providers/adapters/null.adapter.js';
export { createProviderRegistry } from './providers/providerRegistry.js';
export {
    createAiBrain,
    runAiBrainFoundation,
    AI_BRAIN_FOUNDATION_VERSION,
} from './aiBrain.service.js';
