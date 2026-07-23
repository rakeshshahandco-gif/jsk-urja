/**
 * Phase 1C.6 — Complete dry-run AI orchestrator.
 *
 * Customer/Test Message
 * → Context Loader → Intent → Product Intelligence → Entities
 * → Hybrid Cost Router → Knowledge Retrieval → Prompt Builder
 * → Provider Registry → Safety Validator → Draft Assembler
 * → pending_review → STOP
 *
 * Guarantees: no WhatsApp send, no CRM lead/customer/quote/invoice, no auto-approve.
 */

import { createExpandedContextLoader } from './expandedContextLoader.service.js';
import { createIntentDetector } from './intent/intentDetector.service.js';
import { createEntityExtractor } from './entities/entityExtractor.service.js';
import { createProductIntelligenceEngine } from './productIntelligence/productIntelligence.service.js';
import { createKnowledgeRetrievalEngine } from './knowledge/knowledgeRetrieval.service.js';
import { createEmptyReadModel } from './knowledge/approvedKnowledgeRepository.js';
import { createHybridCostRouter } from './hybridCostRouter.service.js';
import { createPromptBuilder } from './prompt/promptBuilder.service.js';
import { createProviderRegistry } from './providers/providerRegistry.js';
import { NULL_PROVIDER_DUMMY_TEXT, NULL_PROVIDER_ID } from './providers/adapters/null.adapter.js';
import { createSafetyValidator, rewriteSafeDraft } from './safety/safetyValidator.service.js';
import { createBudgetEngine } from './budget/budgetEngine.service.js';
import { createDraftAssembler } from './draftAssembler.service.js';

export const DRY_RUN_ORCHESTRATOR_VERSION = 'dry_run_orchestrator_v1';

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

function faqDraftFromGrounding(groundingPack) {
    const sources = groundingPack?.sources || [];
    if (!sources.length) {
        return 'Thank you for your question. Our team will follow up with approved product details shortly. (dry-run FAQ — not sent)';
    }
    const snip = String(sources[0].contentSnippet || sources[0].title || '').slice(0, 400);
    return `Thanks for your enquiry. Based on approved knowledge: ${snip} Our team can share more details if needed. (dry-run FAQ — not sent)`;
}

/**
 * @param {object} [options]
 */
export function createDryRunOrchestrator(options = {}) {
    const contextLoader = options.contextLoader || createExpandedContextLoader({ deps: options.deps });
    const intentDetector = options.intentDetector || createIntentDetector();
    const entityExtractor = options.entityExtractor || createEntityExtractor();
    const productIntelligenceEngine = options.productIntelligenceEngine || createProductIntelligenceEngine();
    const knowledgeDeps = {
        ...(options.deps || {}),
        Knowledge: options.deps?.Knowledge || createEmptyReadModel(),
        DocumentRef: options.deps?.DocumentRef || createEmptyReadModel(),
    };
    const knowledgeRetrievalEngine = options.knowledgeRetrievalEngine || createKnowledgeRetrievalEngine({
        deps: knowledgeDeps,
        limits: options.knowledgeLimits,
    });
    const costRouter = options.costRouter || createHybridCostRouter();
    const promptBuilder = options.promptBuilder || createPromptBuilder();
    const registry = options.providerRegistry || createProviderRegistry();
    const safetyValidator = options.safetyValidator || createSafetyValidator();
    const budgetEngine = options.budgetEngine || createBudgetEngine({ limits: options.budgetLimits });
    const draftAssembler = options.draftAssembler || createDraftAssembler();

    return {
        version: DRY_RUN_ORCHESTRATOR_VERSION,

        /**
         * @param {{
         *   companyId: any,
         *   conversationId?: any,
         *   sourceMessageId?: any,
         *   messageText?: string,
         *   providerEnabled?: boolean,
         * }} input
         */
        async run(input = {}) {
            const started = Date.now();
            const warnings = [];
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
            const language = productIntelligence.language?.primaryCode
                || intentResult.detectedLanguage
                || context.language
                || 'en';
            const entities = entityExtractor.extract(messageText, { language });

            const groundingPack = await knowledgeRetrievalEngine.retrieve({
                companyId,
                conversationId,
                messageId: sourceMessageId,
                messageText,
                intent: intentResult.intent,
                productIntelligence,
            });
            const grounding = {
                snippets: (groundingPack.sources || []).map((s) => s.contentSnippet),
                sourceIds: (groundingPack.sources || []).map((s) => s.sourceId),
                emptyGrounding: !!groundingPack.emptyGrounding,
            };

            const runtime = registry.getRuntimeConfig(companyId);
            const providerEnabled = input.providerEnabled === true
                || (runtime.providerEnabled === true && runtime.killSwitch !== true);

            // Pre-estimate with a light prompt size for budget gate (before full build when possible)
            const tokenGuess = Math.ceil((messageText.length + 800) / 4);
            const budgetCheck = budgetEngine.check(companyId, { tokens: tokenGuess });
            if (!budgetCheck.allowed) warnings.push(...budgetCheck.warnings.map((w) => 'budget:' + w));

            const route = costRouter.route({
                intent: intentResult.intent,
                confidence: intentResult.confidence,
                entities,
                text: messageText,
                groundingPack,
                providerEnabled,
                budgetAllowed: budgetCheck.allowed,
                providerAvailable: true,
            });

            const prompt = promptBuilder.build({
                context,
                intentResult,
                entities,
                productIntelligence,
                grounding,
                groundingPack,
                route,
            });
            if (prompt.warnings?.length) warnings.push(...prompt.warnings);

            let providerResult = null;
            let draftText = '';
            let generationMode = route.path;
            let aiCalled = false;
            let selectedProviderId = null;
            let selectedModel = null;

            if (route.path === 'rule') {
                draftText = ruleDraftForIntent(intentResult.intent, language);
                generationMode = 'rule';
            } else if (route.path === 'faq') {
                draftText = faqDraftFromGrounding(groundingPack);
                generationMode = 'faq';
            } else if (route.path === 'budget_safe') {
                draftText = budgetEngine.safeAcknowledgement();
                generationMode = 'budget_safe';
            } else if (route.callProvider) {
                // Provider may only be "called" when dry-run + enabled + budget + secret.
                // Registry defaults keep killSwitch/callsEnabled off → Null Provider, networkCalled false.
                const canAttemptReal = providerEnabled
                    && runtime.mode === 'dry_run'
                    && budgetCheck.allowed
                    && runtime.killSwitch !== true;

                if (!canAttemptReal || route.useNullProvider) {
                    providerResult = await registry.get('null').complete({
                        systemPrompt: prompt.systemPrompt,
                        userPrompt: prompt.userPrompt,
                        meta: prompt.meta,
                    });
                    selectedProviderId = NULL_PROVIDER_ID;
                } else {
                    providerResult = await registry.completeForCompany(companyId, {
                        systemPrompt: prompt.systemPrompt,
                        userPrompt: prompt.userPrompt,
                        meta: prompt.meta,
                    });
                    selectedProviderId = providerResult.providerId || registry.resolveForCompany(companyId).id;
                }
                draftText = providerResult.text;
                selectedModel = providerResult.model || null;
                // aiCalled true only if a non-null provider path was selected AND network attempted
                aiCalled = selectedProviderId !== NULL_PROVIDER_ID && !!providerResult.networkCalled;
                generationMode = aiCalled ? 'llm' : 'llm_null';
                const tokens = providerResult.usage?.totalTokens
                    || budgetEngine.estimateFromPrompts(prompt.systemPrompt, prompt.userPrompt).tokens;
                const cost = registry.get(selectedProviderId)?.estimateCost?.({
                    systemPrompt: prompt.systemPrompt,
                    userPrompt: prompt.userPrompt,
                }) || { estimatedUsd: 0 };
                budgetEngine.record(companyId, {
                    tokens,
                    estimatedUsd: cost.estimatedUsd || 0,
                    actualUsd: 0,
                    providerId: selectedProviderId,
                    model: selectedModel,
                });
            } else {
                draftText = NULL_PROVIDER_DUMMY_TEXT;
                generationMode = 'llm_null';
            }

            const originalDraftText = draftText;
            const safety = safetyValidator.validate({
                draftText,
                customerMessage: messageText,
                groundingPack,
                productIntelligence,
            });
            if (safety.warnings?.length) warnings.push(...safety.warnings);

            if (safety.action === 'block' || safety.action === 'rewrite_safe') {
                draftText = rewriteSafeDraft(originalDraftText, safety);
            }

            const draft = draftAssembler.assemble({
                draftText,
                originalDraftText,
                companyId,
                conversationId,
                sourceMessageId,
                customerMessage: messageText,
                intent: intentResult.intent,
                entities,
                productIntelligence,
                groundingSourceIds: grounding.sourceIds,
                safety,
                provider: {
                    id: selectedProviderId || providerResult?.providerId || null,
                    model: selectedModel || providerResult?.model || null,
                    networkCalled: providerResult ? !!providerResult.networkCalled : false,
                },
                route,
                language,
                warnings,
            });

            const estimatedTokens = prompt.estimatedTokens
                || budgetEngine.estimateFromPrompts(prompt.systemPrompt, prompt.userPrompt).tokens;
            const actualTokens = providerResult?.usage?.totalTokens || 0;

            return {
                success: true,
                processingVersion: DRY_RUN_ORCHESTRATOR_VERSION,
                processingMs: Date.now() - started,
                selectedRoute: route.path,
                route,
                aiCalled,
                provider: {
                    id: selectedProviderId || providerResult?.providerId || null,
                    model: selectedModel || providerResult?.model || null,
                    networkCalled: providerResult ? !!providerResult.networkCalled : false,
                    usage: providerResult?.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                },
                intent: intentResult.intent,
                intentReason: intentResult.intentReason,
                confidence: intentResult.confidence,
                detectedLanguage: language,
                entities,
                productIntelligence,
                groundingPack,
                groundingSourceIds: grounding.sourceIds,
                prompt: {
                    version: prompt.version,
                    systemPromptLength: prompt.systemPrompt.length,
                    userPromptLength: prompt.userPrompt.length,
                    estimatedTokens: prompt.estimatedTokens,
                    groundingSourceIds: prompt.groundingSourceIds,
                    // never expose full confidential prompts in API-facing result
                    warnings: prompt.warnings,
                },
                safety,
                draft,
                draftText: draft.draftText,
                status: 'pending_review',
                statusHint: 'pending_review',
                estimatedTokens,
                actualTokens,
                budget: {
                    allowed: budgetCheck.allowed,
                    warnings: budgetCheck.warnings,
                    usage: budgetEngine.getUsage(companyId),
                },
                warnings,
                timing: { startedAt: started, completedAt: Date.now(), processingMs: Date.now() - started },
                // Hard guarantees
                outboundSent: false,
                autoApproved: false,
                leadCreated: false,
                customerCreated: false,
                quotationCreated: false,
                invoiceCreated: false,
                networkCalled: providerResult ? !!providerResult.networkCalled : false,
                requiresHumanReview: true,
            };
        },
    };
}

export async function runDryRunOrchestrator(input, options = {}) {
    return createDryRunOrchestrator(options).run(input);
}

export default createDryRunOrchestrator;
