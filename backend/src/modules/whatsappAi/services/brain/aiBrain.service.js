/**
 * Phase 1C.0 — AI Brain orchestration (foundation).
 *
 * Runs: expanded context → intent → entities → hybrid route →
 * (rule stub | null provider via prompt) → structured BrainResult.
 *
 * Does NOT:
 * - call external AI providers / network
 * - send WhatsApp
 * - write CRM Lead/Customer
 * - change Phase 1B generateTestDraft persistence/API
 */

import { createExpandedContextLoader } from './expandedContextLoader.service.js';
import { createIntentDetector } from './intent/intentDetector.service.js';
import { createEntityExtractor } from './entities/entityExtractor.service.js';
import { createHybridRouter } from './hybridRouter.service.js';
import { createPromptBuilder } from './prompt/promptBuilder.service.js';
import { createProviderRegistry } from './providers/providerRegistry.js';
import { NULL_PROVIDER_DUMMY_TEXT, NULL_PROVIDER_ID } from './providers/adapters/null.adapter.js';
import { createProductIntelligenceEngine } from './productIntelligence/productIntelligence.service.js';

export const AI_BRAIN_FOUNDATION_VERSION = 'ai_brain_foundation_v0';

function ruleDraftForIntent(intent, language) {
    if (intent === 'general_greeting') {
        if (language === 'gu') {
            return 'નમસ્તે! અમે તમારો સંદેશ મળ્યો છે. અમારી ટીમ જલ્દી જવાબ આપશે. (dry-run draft — not sent)';
        }
        if (language === 'hi') {
            return 'नमस्ते! हमें आपका संदेश मिला है। हमारी टीम जल्द उत्तर देगी। (dry-run draft — not sent)';
        }
        return 'Hello! Thanks for reaching out. Our team will assist you shortly. (dry-run draft — not sent)';
    }
    return NULL_PROVIDER_DUMMY_TEXT;
}

/**
 * Create an AI Brain runner with injectable deps (tests).
 * @param {object} [options]
 */
export function createAiBrain(options = {}) {
    const contextLoader = options.contextLoader || createExpandedContextLoader({ deps: options.deps });
    const intentDetector = options.intentDetector || createIntentDetector();
    const entityExtractor = options.entityExtractor || createEntityExtractor();
    const productIntelligenceEngine = options.productIntelligenceEngine || createProductIntelligenceEngine();
    const hybridRouter = options.hybridRouter || createHybridRouter();
    const promptBuilder = options.promptBuilder || createPromptBuilder();
    const registry = options.providerRegistry || createProviderRegistry();

    return {
        version: AI_BRAIN_FOUNDATION_VERSION,

        /**
         * @param {{
         *   companyId: any,
         *   conversationId: any,
         *   sourceMessageId?: any,
         *   messageText?: string,
         * }} input
         */
        async run(input = {}) {
            const started = Date.now();
            const companyId = input.companyId;
            const conversationId = input.conversationId;
            const sourceMessageId = input.sourceMessageId;

            const context = await contextLoader.load({
                companyId,
                conversationId,
                sourceMessageId,
            });

            const messageText = String(
                input.messageText
                || context.currentMessage?.text
                || '',
            );

            const intentResult = intentDetector.detect(messageText);
            const productIntelligence = productIntelligenceEngine.analyze(messageText, {
                languageHint: intentResult.detectedLanguage || context.language,
            });
            const entities = entityExtractor.extract(messageText, {
                language: productIntelligence.language?.primaryCode
                    || intentResult.detectedLanguage
                    || context.language,
            });
            const route = hybridRouter.route({
                intent: intentResult.intent,
                confidence: intentResult.confidence,
                entities,
                text: messageText,
            });

            const grounding = { snippets: [], sourceIds: [] };
            const prompt = promptBuilder.build({
                context,
                intentResult,
                entities,
                grounding,
                route,
            });

            let providerResult = null;
            let draftText = '';
            let generationMode = route.path;

            if (route.callProvider) {
                const provider = registry.getDefault();
                providerResult = await provider.complete({
                    systemPrompt: prompt.systemPrompt,
                    userPrompt: prompt.userPrompt,
                    meta: prompt.meta,
                });
                draftText = providerResult.text;
                generationMode = 'llm_null';
            } else if (route.path === 'rule') {
                draftText = ruleDraftForIntent(
                    intentResult.intent,
                    intentResult.detectedLanguage || entities.language || 'en',
                );
                generationMode = 'rule';
            } else if (route.path === 'faq') {
                draftText = '[WHATSAPP_AI_FAQ_STUB] FAQ path reserved — no knowledge match in 1C.0.';
                generationMode = 'faq';
            } else {
                draftText = NULL_PROVIDER_DUMMY_TEXT;
                generationMode = 'llm_null';
            }

            return {
                success: true,
                processingVersion: AI_BRAIN_FOUNDATION_VERSION,
                processingMs: Date.now() - started,
                intent: intentResult.intent,
                intentReason: intentResult.intentReason,
                confidence: intentResult.confidence,
                detectedLanguage: productIntelligence.language?.primaryCode
                    || intentResult.detectedLanguage,
                entities,
                productIntelligence,
                route,
                prompt: {
                    systemPromptLength: prompt.systemPrompt.length,
                    userPromptLength: prompt.userPrompt.length,
                    meta: prompt.meta,
                },
                provider: {
                    id: providerResult?.providerId || (route.callProvider ? NULL_PROVIDER_ID : null),
                    model: providerResult?.model || null,
                    networkCalled: providerResult ? !!providerResult.networkCalled : false,
                    deterministic: providerResult ? !!providerResult.deterministic : true,
                    usage: providerResult?.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                },
                draftText,
                generationMode,
                statusHint: 'pending_review',
                outboundSent: false,
                aiCalled: false,
                networkCalled: false,
                leadCreated: false,
                customerCreated: false,
                grounding,
            };
        },
    };
}

/**
 * Convenience one-shot (default NullProvider registry).
 */
export async function runAiBrainFoundation(input, options = {}) {
    const brain = createAiBrain(options);
    return brain.run(input);
}

export default createAiBrain;
