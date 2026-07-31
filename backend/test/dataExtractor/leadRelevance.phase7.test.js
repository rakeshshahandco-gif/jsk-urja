/**
 * Phase 7 — AI Lead Relevance / Target-Market Fit tests.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { scoreLeadRelevance } from '../../src/services/dataExtractor/leadRelevance/relevanceEngine.service.js';
import {
    evaluateRelevance,
    excludeRelevance,
    restoreRelevance,
    getRelevanceHistory,
    listRelevance,
    getRelevance,
} from '../../src/services/dataExtractor/leadRelevance/relevanceStore.service.js';
import { AiLeadRelevance } from '../../src/models/aiLeadRelevance.model.js';
import { ExtractorSettings } from '../../src/models/extractorSettings.model.js';
import { checkUserPermission } from '../../src/utils/permissionUtils.js';
import dataExtractorRouter from '../../src/routes/v1/dataExtractor.routes.js';

const MONGO_URI = process.env.P7_MONGO_URI || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `P7-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userA = new mongoose.Types.ObjectId();
const createdIds = [];

function settingsDoc(extra = {}) {
    return {
        aiLeadIntelligence: {
            enabled: true,
            targetMarket: {
                relevantMinScore: 70,
                possiblyRelevantMinScore: 45,
                targetParentIndustries: ['Lighting', 'Electronics', 'Home Automation'],
                targetSubIndustries: ['LED Lighting', 'Smart Building'],
                targetProducts: ['LED driver', 'smart switch', 'zigbee'],
                targetLocations: ['Mumbai'],
                negativeKeywords: ['recruitment agency'],
                exclusionKeywords: ['taxi service'],
                ...extra,
            },
        },
    };
}

describe('Phase 7 relevance engine (pure)', () => {
    it('marks recruitment driver agency IRRELEVANT for LED Driver Manufacturer search', () => {
        const out = scoreLeadRelevance({
            record: {
                companyName: 'ABC Recruitment Driver Services',
                businessDescription: 'Driver recruitment agency for logistics and taxi hiring',
            },
            classification: {
                status: 'IRRELEVANT',
                parentIndustry: '',
                subIndustry: '',
                confidenceScore: 0,
                manualReviewReason: 'Ambiguous driver context',
            },
            searchContext: {
                searchKeyword: 'LED Driver Manufacturer',
                selectedIndustry: 'Lighting',
                selectedProduct: 'LED driver',
            },
            settingsDoc: settingsDoc(),
        });
        assert.equal(out.status, 'IRRELEVANT');
        assert.ok(out.exclusionReason || out.explanation);
        assert.ok(out.relevanceScore <= 25);
    });

    it('marks taxi driver company IRRELEVANT', () => {
        const out = scoreLeadRelevance({
            record: {
                companyName: 'City Taxi Driver Service',
                businessDescription: 'Taxi driver and cab transport service',
            },
            searchContext: { searchKeyword: 'LED Driver Manufacturer', selectedIndustry: 'Lighting' },
            settingsDoc: settingsDoc(),
        });
        assert.equal(out.status, 'IRRELEVANT');
    });

    it('scores home automation company RELEVANT for Home Automation Mumbai', () => {
        const out = scoreLeadRelevance({
            record: {
                companyName: 'XYZ Smart Living Systems',
                businessDescription: 'Website mentions smart switches, Zigbee automation and residential control in Mumbai',
                city: 'Mumbai',
                keywords: ['smart switch', 'zigbee', 'home automation'],
            },
            classification: {
                status: 'CLASSIFIED',
                parentIndustry: 'Home Automation',
                subIndustry: 'Smart Building',
                primaryIndustry: 'Home Automation / Smart Building',
                confidenceScore: 88,
                evidenceSnippets: ['zigbee automation', 'smart switches'],
            },
            searchContext: {
                searchKeyword: 'Home Automation Mumbai',
                selectedIndustry: 'Home Automation',
                selectedLocation: 'Mumbai',
                selectedProduct: 'smart switch',
            },
            settingsDoc: settingsDoc(),
            opportunityMaps: [{
                parentIndustry: 'Home Automation',
                opportunityItems: [{ productName: 'smart switch', positiveSignals: ['zigbee'], negativeSignals: [] }],
            }],
        });
        assert.equal(out.status, 'RELEVANT');
        assert.ok(out.relevanceScore >= 70);
        assert.ok((out.matchingProducts || []).length >= 1);
    });

    it('applies negative keyword handling', () => {
        const base = scoreLeadRelevance({
            record: {
                companyName: 'Bright LED Works',
                businessDescription: 'LED lighting manufacturer LED driver products Mumbai',
            },
            classification: {
                status: 'CLASSIFIED',
                parentIndustry: 'Lighting',
                subIndustry: 'LED Lighting',
                primaryIndustry: 'Lighting / LED Lighting',
                confidenceScore: 80,
            },
            searchContext: { searchKeyword: 'LED lighting', selectedIndustry: 'Lighting' },
            settingsDoc: settingsDoc(),
        });
        const withNeg = scoreLeadRelevance({
            record: {
                companyName: 'Bright LED Works',
                businessDescription: 'LED lighting manufacturer and recruitment agency services Mumbai',
            },
            classification: {
                status: 'CLASSIFIED',
                parentIndustry: 'Lighting',
                subIndustry: 'LED Lighting',
                primaryIndustry: 'Lighting / LED Lighting',
                confidenceScore: 80,
            },
            searchContext: { searchKeyword: 'LED lighting', selectedIndustry: 'Lighting' },
            settingsDoc: settingsDoc(),
        });
        assert.ok(withNeg.relevanceScore < base.relevanceScore);
        assert.ok((withNeg.conflictingKeywords || []).some((k) => String(k).includes('recruitment')));
    });

    it('compares search intent — LED manufacturer relevant', () => {
        const out = scoreLeadRelevance({
            record: {
                companyName: 'Photon LED OEM',
                businessDescription: 'LED driver manufacturer and LED panel electronics factory',
            },
            classification: {
                status: 'CLASSIFIED',
                parentIndustry: 'Lighting',
                subIndustry: 'LED Lighting',
                primaryIndustry: 'Lighting / LED Lighting',
                confidenceScore: 90,
                productSignals: ['led driver'],
            },
            searchContext: {
                searchKeyword: 'LED Driver Manufacturer',
                selectedIndustry: 'Lighting',
                selectedProduct: 'LED driver',
            },
            settingsDoc: settingsDoc(),
        });
        assert.ok(['RELEVANT', 'POSSIBLY_RELEVANT'].includes(out.status));
        assert.ok(out.relevanceScore >= 45);
    });

    it('does not expose secrets in output', () => {
        const out = scoreLeadRelevance({
            record: { companyName: 'Test', businessDescription: 'LED lighting' },
            searchContext: { searchKeyword: 'LED' },
            settingsDoc: settingsDoc(),
        });
        const blob = JSON.stringify(out);
        assert.equal(blob.includes('sk-'), false);
        assert.equal(blob.toLowerCase().includes('openai_api_key'), false);
    });

    it('view-only cannot run/exclude/restore relevance', () => {
        const viewOnly = { roleName: 'staff', permissions: ['data_extractor.lead_intelligence.view'] };
        assert.equal(checkUserPermission(viewOnly, 'data_extractor.lead_intelligence.relevance_run'), false);
        assert.equal(checkUserPermission(viewOnly, 'data_extractor.lead_intelligence.relevance_exclude'), false);
        assert.equal(checkUserPermission(viewOnly, 'data_extractor.lead_intelligence.relevance_restore'), false);
    });

    it('registers relevance routes', () => {
        const expected = [
            { method: 'get', path: '/ai-lead-intelligence/relevance' },
            { method: 'post', path: '/ai-lead-intelligence/relevance/evaluate' },
            { method: 'post', path: '/ai-lead-intelligence/relevance/:id/exclude' },
            { method: 'post', path: '/ai-lead-intelligence/relevance/:id/restore' },
            { method: 'get', path: '/ai-lead-intelligence/relevance/:id/history' },
        ];
        const layers = dataExtractorRouter.stack.filter((l) => l.route && String(l.route.path).includes('/relevance'));
        for (const exp of expected) {
            const layer = layers.find((l) => l.route.path === exp.path && l.route.methods[exp.method]);
            assert.ok(layer, `Missing ${exp.method} ${exp.path}`);
        }
    });
});

describe('Phase 7 MongoDB relevance workflows', () => {
    before(async () => {
        assert.ok(MONGO_URI.includes('crm_test'));
        assert.ok(MONGO_URI.includes('127.0.0.1') || MONGO_URI.includes('localhost'));
        await mongoose.connect(MONGO_URI);
        await ExtractorSettings.findOneAndUpdate(
            { companyId: companyA },
            { $set: { aiLeadIntelligence: settingsDoc().aiLeadIntelligence } },
            { upsert: true },
        );
    });

    after(async () => {
        try {
            if (createdIds.length) await AiLeadRelevance.deleteMany({ _id: { $in: createdIds } });
            await AiLeadRelevance.deleteMany({ companyId: { $in: [companyA, companyB] } });
            await ExtractorSettings.deleteMany({ companyId: { $in: [companyA, companyB] } });
        } finally {
            await mongoose.disconnect();
        }
    });

    it('persists evaluation, exclude, restore and audit log', async () => {
        const doc = await evaluateRelevance(companyA, userA, {
            searchKeyword: 'Home Automation Mumbai',
            selectedIndustry: 'Home Automation',
            selectedLocation: 'Mumbai',
            selectedProduct: 'smart switch',
            adhocKey: `${TAG}-smart`,
            record: {
                companyName: `${TAG} XYZ Smart Living Systems`,
                businessDescription: 'smart switches Zigbee automation residential control Mumbai',
                city: 'Mumbai',
                keywords: ['zigbee', 'smart switch'],
            },
            classification: {
                status: 'CLASSIFIED',
                parentIndustry: 'Home Automation',
                subIndustry: 'Smart Building',
                primaryIndustry: 'Home Automation / Smart Building',
                confidenceScore: 85,
                evidenceSnippets: ['zigbee automation'],
            },
        });
        createdIds.push(doc._id);
        assert.ok(doc._id);
        assert.equal(String(doc.companyId), String(companyA));
        assert.ok(['RELEVANT', 'POSSIBLY_RELEVANT'].includes(doc.status));

        const excluded = await excludeRelevance(companyA, userA, doc._id, { reason: 'Park for now' });
        assert.equal(excluded.excluded, true);
        assert.equal(String(excluded.excludedBy), String(userA));
        assert.equal(excluded.history[excluded.history.length - 1].action, 'exclude');

        const restored = await restoreRelevance(companyA, userA, doc._id, { reason: 'Still a fit' });
        assert.equal(restored.excluded, false);
        assert.equal(String(restored.restoredBy), String(userA));
        assert.equal(restored.history[restored.history.length - 1].action, 'restore');

        const hist = await getRelevanceHistory(companyA, doc._id);
        assert.ok((hist.history || []).length >= 3);
        assert.ok(hist.history.some((h) => h.action === 'exclude'));
        assert.ok(hist.history.some((h) => h.action === 'restore'));
    });

    it('places IRRELEVANT into excluded queue without deleting', async () => {
        const doc = await evaluateRelevance(companyA, userA, {
            searchKeyword: 'LED Driver Manufacturer',
            selectedIndustry: 'Lighting',
            adhocKey: `${TAG}-recruit`,
            record: {
                companyName: `${TAG} ABC Recruitment Driver Services`,
                businessDescription: 'Driver recruitment agency hiring taxi drivers',
            },
            classification: { status: 'IRRELEVANT', confidenceScore: 0, manualReviewReason: 'Ambiguous driver' },
        });
        createdIds.push(doc._id);
        assert.equal(doc.status, 'IRRELEVANT');
        assert.equal(doc.excluded, true);
        const still = await AiLeadRelevance.findById(doc._id).lean();
        assert.ok(still);
        assert.equal(still.isDeleted, false);
        const listed = await listRelevance(companyA, { excluded: 'true' });
        assert.ok(listed.results.some((r) => String(r._id) === String(doc._id)));
    });

    it('rejects companyId override and isolates tenants', async () => {
        await assert.rejects(
            () => evaluateRelevance(companyA, userA, { companyId: companyB, record: { companyName: 'x' } }),
            /companyId\/tenantId overrides are rejected/,
        );
        const doc = await evaluateRelevance(companyA, userA, {
            adhocKey: `${TAG}-iso`,
            searchKeyword: 'LED',
            record: { companyName: `${TAG} Iso LED`, businessDescription: 'LED lighting' },
            classification: { status: 'CLASSIFIED', parentIndustry: 'Lighting', subIndustry: 'LED Lighting', confidenceScore: 70 },
        });
        createdIds.push(doc._id);
        await assert.rejects(() => getRelevance(companyB, doc._id), /not found/i);
    });
});
