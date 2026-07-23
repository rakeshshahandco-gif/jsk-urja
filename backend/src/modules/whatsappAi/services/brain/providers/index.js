/**
 * Phase 1C.4 — Provider framework public exports.
 */

export { isAiProvider, assertCompletionRequest, estimateTokensRough } from './AiProvider.interface.js';
export { createHttpTransport } from './httpTransport.js';
export {
    PROVIDER_FRAMEWORK_VERSION,
    PROVIDER_IDS,
    DEFAULT_PROVIDER_RUNTIME_CONFIG,
    resolveCompanyProviderConfig,
} from './providerDefaults.js';
export {
    maskSecret,
    assertNoApiKeysInPayload,
    resolveSecretRef,
    secretStatus,
    FORBIDDEN_KEY_NAMES,
} from './providerSecrets.js';
export {
    createNullProvider,
    NULL_PROVIDER_ID,
    NULL_PROVIDER_MODEL,
    NULL_PROVIDER_DUMMY_TEXT,
} from './adapters/null.adapter.js';
export { createOpenAIProvider, OPENAI_PROVIDER_ID, OPENAI_DEFAULT_MODEL } from './adapters/openai.adapter.js';
export { createGeminiProvider, GEMINI_PROVIDER_ID, GEMINI_DEFAULT_MODEL } from './adapters/gemini.adapter.js';
export { createClaudeProvider, CLAUDE_PROVIDER_ID, CLAUDE_DEFAULT_MODEL } from './adapters/claude.adapter.js';
export { createLocalLlmProvider, LOCAL_PROVIDER_ID, LOCAL_DEFAULT_MODEL } from './adapters/localLlm.adapter.js';
export { createProviderRegistry } from './providerRegistry.js';
