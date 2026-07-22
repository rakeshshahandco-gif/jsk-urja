/**
 * Phase 1C.0 — AI Brain foundation tests (no network, no Mongo required for unit path).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    WHATSAPP_AI_BRAIN_INTENT_TYPES,
    mapLegacyIntentToBrain,
    createIntentDetector,
    createEntityExtractor,
    createHybridRouter,
    createPromptBuilder,
    createNullProvider,
    NULL_PROVIDER_DUMMY_TEXT,
    NULL_PROVIDER_ID,
    createProviderRegistry,
    createAiBrain,
    AI_BRAIN_FOUNDATION_VERSION,
    isAiProvider,
} from '../src/modules/whatsappAi/services/brain/index.js';
import { WHATSAPP_AI_INTENT_TYPES } from '../src/modules/whatsappAi/constants/whatsappAi.constants.js';
import { createIntentClassifier } from '../src/modules/whatsappAi/services/intentClassifier.js';
import { generateTestDraft } from '../src/modules/whatsappAi/services/generateDraftTest.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brainDir = path.join(__dirname, '..', 'src', 'modules', 'whatsappAi', 'services', 'brain');

function makeMemContext(text = 'Hello') {
    const companyId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const conversationId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const messageId = 'cccccccccccccccccccccccc';
    const conversations = [{
        _id: conversationId,
        companyId,
        normalizedMobile: '919876543210',
        source: 'internal_test',
        preferredLanguage: 'en',
        customerId: null,
        leadId: null,
        assignedUserId: null,
        isDeleted: false,
    }];
    const messages = [{
        _id: messageId,
        companyId,
        conversationId,
        direction: 'in',
        messageType: 'text',
        text,
        createdAt: new Date(),
        isDeleted: false,
    }];

    const Conversation = {
        async findOne(filter) {
            return conversations.find((c) =>
                String(c._id) === String(filter._id)
                && String(c.companyId) === String(filter.companyId)
                && c.isDeleted === false) || null;
        },
    };
    const Message = {
        find(filter) {
            const rows = messages.filter((m) =>
                String(m.companyId) === String(filter.companyId)
                && String(m.conversationId) === String(filter.conversationId)
                && m.isDeleted === false);
            const api = {
                sort() { return api; },
                limit() { return api; },
                lean() { return Promise.resolve(rows); },
                then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); },
            };
            return api;
        },
    };
    return { companyId, conversationId, messageId, deps: { Conversation, Message } };
}

describe('whatsappAi phase1c0 brain foundation', () => {
    it('expanded taxonomy includes design intents and does not mutate 1B enum', () => {
        for (const intent of [
            'product_enquiry', 'quotation_request', 'technical_support', 'complaint',
            'warranty', 'sample_request', 'dealer_enquiry', 'distributor_enquiry',
            'price_enquiry', 'availability_enquiry', 'general_greeting', 'unknown',
        ]) {
            assert.ok(WHATSAPP_AI_BRAIN_INTENT_TYPES.includes(intent), intent);
        }
        assert.equal(mapLegacyIntentToBrain('greeting'), 'general_greeting');
        assert.deepEqual([...WHATSAPP_AI_INTENT_TYPES], [
            'greeting', 'product_enquiry', 'price_enquiry', 'support_request', 'order_status', 'unknown',
        ]);
    });

    it('null provider returns deterministic dummy with networkCalled false', async () => {
        const provider = createNullProvider();
        assert.equal(provider.id, NULL_PROVIDER_ID);
        assert.equal(isAiProvider(provider), true);
        const a = await provider.complete({ systemPrompt: 'sys', userPrompt: 'user' });
        const b = await provider.complete({ systemPrompt: 'sys', userPrompt: 'user' });
        assert.equal(a.text, NULL_PROVIDER_DUMMY_TEXT);
        assert.equal(b.text, NULL_PROVIDER_DUMMY_TEXT);
        assert.equal(a.networkCalled, false);
        assert.equal(a.deterministic, true);
    });

    it('provider registry defaults to null provider', async () => {
        const registry = createProviderRegistry();
        assert.ok(registry.listIds().includes('null'));
        const result = await registry.getDefault().complete({ systemPrompt: 'a', userPrompt: 'b' });
        assert.equal(result.providerId, 'null');
        assert.equal(result.networkCalled, false);
    });

    it('intent detector recognises greeting, quotation, dealer', () => {
        const detector = createIntentDetector();
        assert.equal(detector.detect('Hello').intent, 'general_greeting');
        assert.equal(detector.detect('Please send quotation for DALI driver').intent, 'quotation_request');
        assert.equal(detector.detect('We want to become a dealer').intent, 'dealer_enquiry');
    });

    it('entity extractor picks product and electrical attrs', () => {
        const extractor = createEntityExtractor();
        const entities = extractor.extract('Need 10 pcs DALI Driver 40W 220V DT8 BLE');
        assert.equal(entities.productName, 'DALI Driver');
        assert.equal(entities.quantity, 10);
        assert.equal(entities.wattage, 40);
        assert.equal(entities.voltage, 220);
        assert.equal(entities.dt8, true);
        assert.equal(entities.ble, true);
    });

    it('hybrid router: greeting -> rule (no provider); complex -> llm', () => {
        const router = createHybridRouter();
        const greet = router.route({ intent: 'general_greeting', confidence: 0.95 });
        assert.equal(greet.path, 'rule');
        assert.equal(greet.callProvider, false);
        const complex = router.route({ intent: 'technical_support', confidence: 0.8 });
        assert.equal(complex.path, 'llm');
        assert.equal(complex.callProvider, true);
    });

    it('prompt builder skeleton returns system + user prompts', () => {
        const builder = createPromptBuilder();
        const bundle = builder.build({
            context: {
                currentMessage: { text: 'Need DALI info' },
                thread: [{ direction: 'in', text: 'Need DALI info' }],
            },
            intentResult: { intent: 'product_enquiry', confidence: 0.8, detectedLanguage: 'en' },
            entities: { productName: 'DALI Driver' },
            route: { path: 'llm' },
        });
        assert.ok(bundle.systemPrompt.includes('DRY RUN'));
        assert.ok(bundle.userPrompt.includes('Need DALI info'));
        assert.equal(bundle.meta.processingVersion, 'ai_brain_foundation_v0');
    });

    it('ai brain orchestrator greeting uses rule path and never calls network', async () => {
        const mem = makeMemContext('Hello');
        const brain = createAiBrain({ deps: mem.deps });
        const result = await brain.run({
            companyId: mem.companyId,
            conversationId: mem.conversationId,
            sourceMessageId: mem.messageId,
        });
        assert.equal(result.processingVersion, AI_BRAIN_FOUNDATION_VERSION);
        assert.equal(result.intent, 'general_greeting');
        assert.equal(result.route.path, 'rule');
        assert.equal(result.networkCalled, false);
        assert.equal(result.outboundSent, false);
        assert.equal(result.aiCalled, false);
        assert.equal(result.leadCreated, false);
        assert.ok(result.draftText.includes('dry-run'));
        assert.ok(result.packs === undefined); // result has context internally only
        assert.ok(result.entities);
    });

    it('ai brain orchestrator complex path uses null provider dummy text', async () => {
        const mem = makeMemContext('I need technical support for DT8 DALI Driver 40W');
        const brain = createAiBrain({ deps: mem.deps });
        const result = await brain.run({
            companyId: mem.companyId,
            conversationId: mem.conversationId,
            sourceMessageId: mem.messageId,
        });
        assert.equal(result.route.path, 'llm');
        assert.equal(result.route.callProvider, true);
        assert.equal(result.draftText, NULL_PROVIDER_DUMMY_TEXT);
        assert.equal(result.provider.networkCalled, false);
        assert.equal(result.provider.id, 'null');
        assert.equal(result.generationMode, 'llm_null');
        assert.equal(result.entities.productName, 'DALI Driver');
        assert.equal(result.entities.dt8, true);
    });

    it('expanded context packs exist without CRM fetches', async () => {
        const mem = makeMemContext('Hi');
        const brain = createAiBrain({ deps: mem.deps });
        // access loader directly via run side-effect — assert via private load
        const { createExpandedContextLoader } = await import('../src/modules/whatsappAi/services/brain/expandedContextLoader.service.js');
        const loader = createExpandedContextLoader({ deps: mem.deps });
        const ctx = await loader.load({
            companyId: mem.companyId,
            conversationId: mem.conversationId,
            sourceMessageId: mem.messageId,
        });
        assert.equal(ctx.packs.thread.loaded, true);
        assert.equal(ctx.packs.contact.loaded, false);
        assert.equal(ctx.packs.salesLite.loaded, false);
        assert.equal(ctx.optionalContext.knowledgeBase, null);
    });

    it('no vendor SDK imports in brain foundation source', () => {
        const walk = (dir) => {
            for (const name of fs.readdirSync(dir)) {
                const p = path.join(dir, name);
                const st = fs.statSync(p);
                if (st.isDirectory()) walk(p);
                else if (name.endsWith('.js')) {
                    const t = fs.readFileSync(p, 'utf8');
                    assert.equal(t.includes('openai'), false, p);
                    assert.equal(t.includes('@google'), false, p);
                    assert.equal(t.includes('anthropic'), false, p);
                    assert.equal(t.includes('fetch('), false, p);
                }
            }
        };
        walk(brainDir);
    });

    it('phase 1B intent classifier and draft pipeline remain intact', async () => {
        const classifier = createIntentClassifier();
        assert.equal(classifier.classify('Hello').intent, 'greeting');
        assert.ok(WHATSAPP_AI_INTENT_TYPES.includes('greeting'));
        // generateTestDraft still exportable (smoke) — full 1B suite covers behaviour
        assert.equal(typeof generateTestDraft, 'function');
    });
});
