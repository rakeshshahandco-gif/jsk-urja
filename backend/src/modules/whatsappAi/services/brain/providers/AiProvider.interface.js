/**
 * Phase 1C.4 — AI Provider Adapter interface (port).
 * Business services must depend on this contract only — never on vendor SDKs.
 */

/**
 * @typedef {object} CompletionRequest
 * @property {string} systemPrompt
 * @property {string} userPrompt
 * @property {object} [meta]
 * @property {number} [temperature]
 * @property {number} [maxTokens]
 * @property {number} [timeoutMs]
 */

/**
 * @typedef {object} CompletionResult
 * @property {string} text
 * @property {string} providerId
 * @property {string} model
 * @property {boolean} deterministic
 * @property {boolean} networkCalled
 * @property {{ promptTokens?: number, completionTokens?: number, totalTokens?: number }} usage
 * @property {object} [raw]
 */

/**
 * Validate that an object satisfies the AiProvider adapter contract.
 * @param {any} provider
 * @returns {boolean}
 */
export function isAiProvider(provider) {
    return !!(
        provider
        && typeof provider.id === 'string'
        && typeof provider.complete === 'function'
        && typeof provider.healthCheck === 'function'
        && typeof provider.estimateCost === 'function'
        && typeof provider.normalizeError === 'function'
        && typeof provider.supportsStructuredOutput === 'function'
    );
}

/**
 * @param {CompletionRequest} req
 */
export function assertCompletionRequest(req) {
    if (!req || typeof req !== 'object') {
        throw new Error('CompletionRequest must be an object');
    }
    if (typeof req.systemPrompt !== 'string' || typeof req.userPrompt !== 'string') {
        throw new Error('CompletionRequest requires systemPrompt and userPrompt strings');
    }
}

export function estimateTokensRough(text) {
    return Math.ceil(String(text || '').length / 4);
}

export default { isAiProvider, assertCompletionRequest, estimateTokensRough };
