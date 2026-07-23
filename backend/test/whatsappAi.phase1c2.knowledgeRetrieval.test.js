/**
 * Phase 1C.2 — Approved Knowledge Retrieval Engine tests (fixtures, no Mongo writes).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createKnowledgeRetrievalEngine,
    isCustomerSafeKnowledge,
    buildGroundingPack,
    buildRetrievalQuery,
    analyzeProductIntelligence,
    createAiBrain,
    GROUNDING_PACK_VERSION,
    KNOWLEDGE_RETRIEVAL_LIMITS,
} from '../src/modules/whatsappAi/services/brain/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const knowledgeDir = path.join(__dirname, '..', 'src', 'modules', 'whatsappAi', 'services', 'brain', 'knowledge');
const companyA = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const companyB = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function makeKnowledgeModel(rows) {
    return {
        find(filter) {
            const matched = rows.filter((r) => {
                if (filter.companyId && String(r.companyId) !== String(filter.companyId)) return false;
                if (filter.isDeleted === false && r.isDeleted !== false) return false;
                if (filter.approvalStatus && r.approvalStatus !== filter.approvalStatus) return false;
                if (filter.active === true && r.active !== true) return false;
                return true;
            });
            const api = {
                sort() { return api; },
                limit(n) { api._rows = matched.slice(0, n); return api; },
                lean() { return Promise.resolve(api._rows || matched); },
                then(resolve, reject) { return Promise.resolve(api._rows || matched).then(resolve, reject); },
            };
            api._rows = matched;
            return api;
        },
    };
}

function baseDocs() {
    return [
        { _id: 'k_dali_dt8', companyId: companyA, title: 'DALI Driver DT8 guide', content: 'JSK DALI Driver DT8 supports tunable white. Protocol DALI DT8.', category: 'specification', subcategory: 'dali', language: 'en', keywords: ['dali', 'dt8', 'driver'], approvalStatus: 'approved', active: true, isDeleted: false },
        { _id: 'k_dali_dt6', companyId: companyA, title: 'DALI Driver DT6 guide', content: 'JSK DALI Driver DT6 single channel. Protocol DALI DT6 only.', category: 'specification', language: 'en', keywords: ['dali', 'dt6'], approvalStatus: 'approved', active: true, isDeleted: false },
        { _id: 'k_ble', companyId: companyA, title: 'BLE Mesh Driver overview', content: 'BLE Mesh Driver for wireless lighting control.', category: 'product_knowledge', language: 'en', keywords: ['ble mesh', 'driver'], approvalStatus: 'approved', active: true, isDeleted: false },
        { _id: 'k_zigbee', companyId: companyA, title: 'Zigbee Driver sheet', content: 'Zigbee Driver product facts.', category: 'product', language: 'en', keywords: ['zigbee'], approvalStatus: 'approved', active: true, isDeleted: false },
        { _id: 'k_phase', companyId: companyA, title: 'Phase Cut Driver FAQ', content: 'Phase cut / TRIAC dimming driver guidance.', category: 'faq', language: 'en', keywords: ['phase cut', 'triac'], approvalStatus: 'approved', active: true, isDeleted: false },
        { _id: 'k_tech_faq', companyId: companyA, title: 'Technical support wiring FAQ', content: 'Technical support FAQ for driver wiring and fault checks.', category: 'technical_faq', language: 'en', keywords: ['support', 'wiring', 'fault'], approvalStatus: 'approved', active: true, isDeleted: false },
        { _id: 'k_product_enq', companyId: companyA, title: 'Product enquiry catalogue note', content: 'Product enquiry information for JSK drivers catalogue.', category: 'product_enquiry', language: 'en', keywords: ['catalogue', 'product', 'enquiry'], approvalStatus: 'approved', active: true, isDeleted: false },
        { _id: 'k_inactive', companyId: companyA, title: 'Inactive DALI note', content: 'Should not appear DALI DT8', category: 'product', language: 'en', keywords: ['dali', 'dt8'], approvalStatus: 'approved', active: false, isDeleted: false },
        { _id: 'k_draft', companyId: companyA, title: 'Draft DALI note', content: 'Draft DALI DT8', category: 'product', language: 'en', keywords: ['dali', 'dt8'], approvalStatus: 'draft', active: false, isDeleted: false },
        { _id: 'k_pending', companyId: companyA, title: 'Pending DALI note', content: 'Pending DALI DT8', category: 'product', language: 'en', keywords: ['dali'], approvalStatus: 'pending', active: false, isDeleted: false },
        { _id: 'k_rejected', companyId: companyA, title: 'Rejected DALI note', content: 'Rejected DALI DT8', category: 'product', language: 'en', keywords: ['dali'], approvalStatus: 'rejected', active: false, isDeleted: false },
        { _id: 'k_other_co', companyId: companyB, title: 'Other company DALI DT8', content: 'Secret other tenant DALI DT8', category: 'specification', language: 'en', keywords: ['dali', 'dt8'], approvalStatus: 'approved', active: true, isDeleted: false },
        { _id: 'k_confidential', companyId: companyA, title: 'Internal cost sheet', content: 'Supplier cost and margin for DALI', category: 'internal', language: 'en', keywords: ['confidential', 'cost', 'margin', 'dali'], approvalStatus: 'approved', active: true, isDeleted: false },
        { _id: 'k_gu', companyId: companyA, title: 'DALI driver mahiti', content: 'DALI driver information DT8', category: 'product_knowledge', language: 'gu', keywords: ['dali', 'dt8'], approvalStatus: 'approved', active: true, isDeleted: false },
        { _id: 'k_long', companyId: companyA, title: 'Long DALI article', content: 'DALI Driver DT8 ' + 'x'.repeat(2000), category: 'specification', language: 'en', keywords: ['dali', 'dt8'], approvalStatus: 'approved', active: true, isDeleted: false },
    ];
}

function makeEngine(rows, docs = [], limits) {
    return createKnowledgeRetrievalEngine({
        deps: { Knowledge: makeKnowledgeModel(rows), DocumentRef: makeKnowledgeModel(docs) },
        limits,
        minScore: 5,
    });
}

async function retrieveFor(text, intent, limits) {
    const pi = analyzeProductIntelligence(text);
    const engine = makeEngine(baseDocs(), [], limits);
    return engine.retrieve({
        companyId: companyA,
        conversationId: 'conv1',
        messageId: 'msg1',
        messageText: text,
        intent,
        productIntelligence: pi,
    });
}

describe('whatsappAi phase1c2 knowledge retrieval', () => {
    it('1. exact DALI DT8 match', async () => {
        const pack = await retrieveFor('Need DALI Driver DT8 specs', 'product_enquiry');
        assert.equal(pack.version, GROUNDING_PACK_VERSION);
        assert.equal(pack.emptyGrounding, false);
        assert.ok(pack.sources.some((s) => s.sourceId === 'k_dali_dt8'));
    });

    it('2. DT8 ranks above DT6 for DT8-only query', async () => {
        const pack = await retrieveFor('DALI Driver DT8 only', 'technical_support');
        const s8 = pack.sources.find((s) => s.sourceId === 'k_dali_dt8');
        const s6 = pack.sources.find((s) => s.sourceId === 'k_dali_dt6');
        assert.ok(s8);
        if (s6) assert.ok(s8.relevanceScore >= s6.relevanceScore);
    });

    it('3. BLE Mesh match', async () => {
        const pack = await retrieveFor('BLE Mesh Driver quotation', 'quotation_request');
        assert.ok(pack.sources.some((s) => s.sourceId === 'k_ble'));
    });

    it('4. Zigbee match', async () => {
        const pack = await retrieveFor('Zigbee Driver 15W', 'product_enquiry');
        assert.ok(pack.sources.some((s) => s.sourceId === 'k_zigbee'));
    });

    it('5. Phase Cut match', async () => {
        const pack = await retrieveFor('phase cut driver help', 'technical_support');
        assert.ok(pack.sources.some((s) => s.sourceId === 'k_phase'));
    });

    it('6. technical-support FAQ match', async () => {
        const pack = await retrieveFor('driver wiring fault support', 'technical_support');
        assert.ok(pack.sources.some((s) => s.sourceId === 'k_tech_faq'));
    });

    it('7. product enquiry match', async () => {
        const pack = await retrieveFor('product enquiry catalogue drivers', 'product_enquiry');
        assert.ok(pack.sources.some((s) => s.sourceId === 'k_product_enq'));
    });

    it('8. price enquiry with no approved price flags human review', async () => {
        const pack = await retrieveFor('What is the price of DALI Driver?', 'price_enquiry');
        assert.ok(pack.warnings.includes('no_approved_price_fact'));
        assert.equal(pack.requiresHumanReview, true);
    });

    it('9. inactive knowledge excluded', async () => {
        const pack = await retrieveFor('DALI DT8', 'product_enquiry');
        assert.ok(!pack.sources.some((s) => s.sourceId === 'k_inactive'));
    });

    it('10. draft/pending/rejected excluded', async () => {
        const pack = await retrieveFor('DALI DT8', 'product_enquiry');
        const ids = pack.sources.map((s) => s.sourceId);
        assert.ok(!ids.includes('k_draft'));
        assert.ok(!ids.includes('k_pending'));
        assert.ok(!ids.includes('k_rejected'));
        assert.equal(isCustomerSafeKnowledge(baseDocs().find((d) => d._id === 'k_draft')), false);
    });

    it('11. other-company knowledge excluded', async () => {
        const pack = await retrieveFor('DALI Driver DT8', 'product_enquiry');
        assert.ok(!pack.sources.some((s) => s.sourceId === 'k_other_co'));
    });

    it('12. confidential/internal content excluded', async () => {
        const pack = await retrieveFor('DALI cost margin', 'price_enquiry');
        assert.ok(!pack.sources.some((s) => s.sourceId === 'k_confidential'));
    });

    it('13. Gujarati / mixed-language retrieval', async () => {
        const pack = await retrieveFor('Hello DALI DT8 driver', 'product_enquiry');
        assert.ok(pack.sources.some((s) => ['k_gu', 'k_dali_dt8', 'k_long'].includes(s.sourceId)));
    });

    it('14. unknown product returns empty grounding', async () => {
        const pack = await retrieveFor('Need quantum flux capacitor schematic', 'unknown');
        assert.equal(pack.emptyGrounding, true);
        assert.equal(pack.requiresHumanReview, true);
        assert.ok(pack.warnings.includes('approved_knowledge_not_found'));
    });

    it('15. deterministic relevance order', async () => {
        const a = await retrieveFor('DALI Driver DT8 40W', 'product_enquiry');
        const b = await retrieveFor('DALI Driver DT8 40W', 'product_enquiry');
        assert.deepEqual(a.sources.map((s) => s.sourceId), b.sources.map((s) => s.sourceId));
        assert.deepEqual(a.sources.map((s) => s.relevanceScore), b.sources.map((s) => s.relevanceScore));
    });

    it('16. duplicate prevention', async () => {
        const pack = buildGroundingPack({
            companyId: companyA,
            query: buildRetrievalQuery({ intent: 'product_enquiry', productIntelligence: analyzeProductIntelligence('DALI DT8'), messageText: 'DALI DT8' }),
            scoredCandidates: [
                { sourceType: 'knowledge', sourceId: 'k1', title: 'A', contentSnippet: 'DALI DT8', score: 50, matchedReasons: ['a'], category: 'product', language: 'en' },
                { sourceType: 'knowledge', sourceId: 'k1', title: 'A dup', contentSnippet: 'DALI DT8', score: 49, matchedReasons: ['b'], category: 'product', language: 'en' },
            ],
        });
        assert.equal(pack.sources.filter((s) => s.sourceId === 'k1').length, 1);
    });

    it('17. source limit enforcement', async () => {
        const pack = await retrieveFor('DALI Driver DT8', 'product_enquiry', { ...KNOWLEDGE_RETRIEVAL_LIMITS, maxSelectedSources: 2 });
        assert.ok(pack.sources.length <= 2);
    });

    it('18. snippet truncation', async () => {
        const pack = await retrieveFor('DALI Driver DT8 long', 'product_enquiry', { ...KNOWLEDGE_RETRIEVAL_LIMITS, maxSnippetLength: 50, maxSelectedSources: 10 });
        const long = pack.sources.find((s) => s.sourceId === 'k_long');
        if (long) assert.ok(long.contentSnippet.length <= 50);
    });

    it('19. total grounding size limit', async () => {
        const pack = await retrieveFor('DALI Driver DT8', 'product_enquiry', { ...KNOWLEDGE_RETRIEVAL_LIMITS, maxTotalGroundingChars: 120, maxSelectedSources: 10, maxSnippetLength: 80 });
        const total = pack.sources.reduce((n, s) => n + s.contentSnippet.length, 0);
        assert.ok(total <= 125);
    });

    it('20. empty/null message handling', async () => {
        const engine = makeEngine(baseDocs());
        const pack = await engine.retrieve({
            companyId: companyA,
            messageText: '',
            intent: 'unknown',
            productIntelligence: analyzeProductIntelligence(''),
        });
        assert.equal(pack.emptyGrounding, true);
    });

    it('21. no database write helpers in knowledge module', () => {
        for (const name of fs.readdirSync(knowledgeDir)) {
            if (!name.endsWith('.js')) continue;
            const t = fs.readFileSync(path.join(knowledgeDir, name), 'utf8');
            assert.equal(t.includes('.save('), false, name);
            assert.equal(t.includes('.create('), false, name);
            assert.equal(t.includes('insertMany'), false, name);
            assert.equal(t.includes('fetch('), false, name);
        }
    });

    it('22. no network / provider SDK strings', () => {
        for (const name of fs.readdirSync(knowledgeDir)) {
            if (!name.endsWith('.js')) continue;
            const t = fs.readFileSync(path.join(knowledgeDir, name), 'utf8').toLowerCase();
            assert.equal(t.includes('openai'), false, name);
            assert.equal(t.includes('gemini'), false, name);
            assert.equal(t.includes('anthropic'), false, name);
        }
    });

    it('brain result attaches groundingPack', async () => {
        const conversations = [{ _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', companyId: companyA, normalizedMobile: '9198', source: 'internal_test', preferredLanguage: 'en', isDeleted: false }];
        const messages = [{ _id: 'cccccccccccccccccccccccc', companyId: companyA, conversationId: 'bbbbbbbbbbbbbbbbbbbbbbbb', direction: 'in', messageType: 'text', text: 'DALI Driver DT8', isDeleted: false }];
        const Conversation = { async findOne(filter) { return conversations.find((c) => String(c._id) === String(filter._id)) || null; } };
        const Message = { find() { const api = { sort() { return api; }, limit() { return api; }, lean() { return Promise.resolve(messages); }, then(r, j) { return Promise.resolve(messages).then(r, j); } }; return api; } };
        const brain = createAiBrain({
            deps: { Conversation, Message, Knowledge: makeKnowledgeModel(baseDocs()), DocumentRef: makeKnowledgeModel([]) },
        });
        const result = await brain.run({ companyId: companyA, conversationId: 'bbbbbbbbbbbbbbbbbbbbbbbb', sourceMessageId: 'cccccccccccccccccccccccc' });
        assert.ok(result.productIntelligence);
        assert.ok(result.groundingPack);
        assert.equal(result.groundingPack.emptyGrounding, false);
        assert.equal(result.networkCalled, false);
        assert.equal(result.outboundSent, false);
    });
});
