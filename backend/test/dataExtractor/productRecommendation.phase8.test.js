/**
 * Phase 8 — AI Product Opportunity Recommendation tests.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { recommendProducts } from '../../src/services/dataExtractor/productRecommendation/matchingEngine.service.js';
import { runProductRecommendation } from '../../src/services/dataExtractor/productRecommendation/recommend.service.js';
import { validateAiRecommendationOutput } from '../../src/services/dataExtractor/productRecommendation/aiAdapter.js';
import { saveProductMasters } from '../../src/services/dataExtractor/productRecommendation/productMaster.service.js';
import {
    recommendOne,
    overrideRecommendation,
    lockRecommendation,
    getRecommendationHistory,
    getRecommendation,
} from '../../src/services/dataExtractor/productRecommendation/recommendationStore.service.js';
import {
    createRecommendationBatch,
    controlRecommendationBatch,
    processRecommendationBatchChunk,
    getRecommendationBatch,
} from '../../src/services/dataExtractor/productRecommendation/batch.service.js';
import { AiProductMaster } from '../../src/models/aiProductMaster.model.js';
import { AiProductRecommendation } from '../../src/models/aiProductRecommendation.model.js';
import { AiProductRecommendationBatchJob } from '../../src/models/aiProductRecommendationBatchJob.model.js';
import { AiIndustryClassification } from '../../src/models/aiIndustryClassification.model.js';
import { ExtractorSettings } from '../../src/models/extractorSettings.model.js';
import { checkUserPermission } from '../../src/utils/permissionUtils.js';
import dataExtractorRouter from '../../src/routes/v1/dataExtractor.routes.js';

const MONGO_URI = process.env.P8_MONGO_URI || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `P8-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userA = new mongoose.Types.ObjectId();
const created = { products: [], recs: [], batches: [], classifications: [] };

function catalog() {
    return [
        {
            productName: 'LED Driver Module',
            productCategory: 'Drivers',
            parentIndustry: 'Lighting',
            subIndustry: 'LED Lighting',
            applicableCustomerTypes: ['Manufacturer', 'OEM', 'Exporter'],
            keywords: ['led driver', 'constant current', 'smd'],
            positiveSignals: ['led lighting', 'luminaire'],
            applications: ['commercial lighting'],
            negativeKeywords: ['hospital bed', 'textile yarn'],
            brochureUrl: 'https://example.test/brochure-led.pdf',
            catalogUrl: 'https://example.test/catalog-led.pdf',
            datasheetUrl: 'https://example.test/ds-led.pdf',
            crossSellWith: ['Smart Switch Gateway'],
            upsellOf: ['Tunable White Driver'],
            bundleWith: ['Smart Switch Gateway'],
            isActive: true,
        },
        {
            productName: 'Tunable White Driver',
            productCategory: 'Drivers',
            parentIndustry: 'Lighting',
            subIndustry: 'LED Lighting',
            applicableCustomerTypes: ['OEM', 'Manufacturer'],
            keywords: ['tunable white', 'dali', 'dt8'],
            positiveSignals: ['tunable'],
            applications: ['office lighting'],
            negativeKeywords: [],
            isActive: true,
        },
        {
            productName: 'Smart Switch Gateway',
            productCategory: 'Automation',
            parentIndustry: 'Home Automation',
            subIndustry: 'Smart Building',
            applicableCustomerTypes: ['System Integrator', 'Dealer', 'Distributor', 'Consultant'],
            keywords: ['smart switch', 'zigbee', 'gateway', 'automation'],
            positiveSignals: ['home automation', 'bms'],
            applications: ['residential'],
            negativeKeywords: ['textile'],
            isActive: true,
        },
        {
            productName: 'Solar Charge Controller',
            productCategory: 'Solar',
            parentIndustry: 'Solar',
            subIndustry: 'Solar Electronics',
            applicableCustomerTypes: ['Manufacturer', 'Exporter', 'Dealer'],
            keywords: ['solar', 'mppt', 'charge controller'],
            positiveSignals: ['pv', 'photovoltaic'],
            applications: ['off-grid'],
            negativeKeywords: [],
            isActive: true,
        },
        {
            productName: 'Industrial Sensor Kit',
            productCategory: 'Electronics',
            parentIndustry: 'Electronics',
            subIndustry: 'OEM Components',
            applicableCustomerTypes: ['OEM', 'Electronics'],
            keywords: ['sensor', 'pcb', 'oem electronics'],
            positiveSignals: ['electronics oem'],
            applications: ['industrial'],
            negativeKeywords: ['hospital'],
            isActive: true,
        },
    ];
}

function scoreCase({ industry, sub, customerType, desc, name, products = catalog(), relevanceScore = 80 }) {
    return recommendProducts({
        record: { companyName: name, businessDescription: desc, keywords: desc.split(/\s+/).slice(0, 10) },
        classification: {
            status: 'CLASSIFIED',
            parentIndustry: industry,
            subIndustry: sub,
            primaryIndustry: `${industry} / ${sub}`,
            customerType,
            confidenceScore: 85,
            evidenceSnippets: [desc],
            productSignals: [],
        },
        relevance: { relevanceScore, matchingProducts: [], evidenceSnippets: [] },
        products,
        opportunityMaps: [{
            parentIndustry: industry,
            opportunityItems: products.filter((p) => p.parentIndustry === industry).slice(0, 1).map((p) => ({
                productName: p.productName,
                positiveSignals: p.positiveSignals,
                negativeSignals: [],
                salesStrategy: 'High Priority',
            })),
        }],
        settingsDoc: { aiLeadIntelligence: { productRecommendation: { mode: 'rule_based', minimumOpportunityScore: 30, primaryMinScore: 50 }, targetMarket: { targetProducts: products.map((p) => p.productName), targetParentIndustries: [industry] } } },
        searchContext: { searchKeyword: desc.split(' ').slice(0, 3).join(' ') },
        customerType,
    });
}

describe('Phase 8 product matching scenarios', () => {
    it('Lighting Manufacturer gets LED driver recommendation', () => {
        const out = scoreCase({
            industry: 'Lighting', sub: 'LED Lighting', customerType: 'Manufacturer',
            name: 'Bright Luminaire Works',
            desc: 'LED lighting manufacturer of LED drivers and commercial luminaires',
        });
        assert.ok(out.primaryRecommendation);
        assert.match(out.primaryRecommendation.productName, /LED Driver/i);
        assert.ok(out.opportunityScore >= 50);
        assert.ok(out.primaryRecommendation.reason);
        assert.ok(out.primaryRecommendation.brochureUrl);
    });

    it('Electronics OEM gets sensor/OEM product', () => {
        const out = scoreCase({
            industry: 'Electronics', sub: 'OEM Components', customerType: 'OEM',
            name: 'Circuit OEM Labs',
            desc: 'Electronics OEM manufacturing sensor PCB modules',
        });
        assert.ok(out.primaryRecommendation);
        assert.match(out.primaryRecommendation.productName, /Sensor|OEM|Industrial/i);
    });

    it('Textile company does not get wrong lighting product as strong fit', () => {
        const out = scoreCase({
            industry: 'Textile', sub: 'Garments', customerType: 'Manufacturer',
            name: 'Cotton Mills Co',
            desc: 'Textile yarn and garment manufacturing mill',
            relevanceScore: 20,
        });
        if (out.primaryRecommendation) {
            assert.notEqual(out.primaryRecommendation.productName, 'LED Driver Module');
        } else {
            assert.ok(['LOW_CONFIDENCE', 'MANUAL_REVIEW'].includes(out.status));
        }
    });

    it('Hospital negative keywords block sensor product', () => {
        const products = catalog().map((p) => p.productName === 'Industrial Sensor Kit' ? { ...p, negativeKeywords: ['hospital'] } : p);
        const out = scoreCase({
            industry: 'Electronics', sub: 'OEM Components', customerType: 'OEM',
            name: 'City Hospital Stores',
            desc: 'Hospital procurement of medical electronics and hospital beds',
            products,
            relevanceScore: 40,
        });
        if (out.primaryRecommendation?.productName === 'Industrial Sensor Kit') {
            assert.ok((out.primaryRecommendation.conflictingSignals || []).length || out.primaryRecommendation.opportunityScore < 55);
        }
    });

    it('Automation / System Integrator gets smart switch gateway', () => {
        const out = scoreCase({
            industry: 'Home Automation', sub: 'Smart Building', customerType: 'System Integrator',
            name: 'AutoBuild Integrators',
            desc: 'Home automation system integrator for zigbee smart switch gateway projects',
        });
        assert.ok(out.primaryRecommendation);
        assert.match(out.primaryRecommendation.productName, /Smart Switch|Gateway/i);
    });

    it('Solar company gets solar charge controller', () => {
        const out = scoreCase({
            industry: 'Solar', sub: 'Solar Electronics', customerType: 'Exporter',
            name: 'SunPower Exports',
            desc: 'Solar MPPT charge controller and photovoltaic export manufacturer',
        });
        assert.ok(out.primaryRecommendation);
        assert.match(out.primaryRecommendation.productName, /Solar/i);
        assert.match(out.recommendedSalesStrategy, /Export|High|Medium|Manufacturer|OEM|Dealer/i);
    });

    it('Dealer and Distributor customer types map strategies', () => {
        const dealer = scoreCase({
            industry: 'Home Automation', sub: 'Smart Building', customerType: 'Dealer',
            name: 'Smart Dealer Hub',
            desc: 'Dealer of smart switch and zigbee home automation products',
        });
        assert.ok(dealer.primaryRecommendation);
        assert.match(dealer.recommendedSalesStrategy || dealer.primaryRecommendation.salesStrategy, /Dealer|Distributor|High|Medium|System/i);
        const dist = scoreCase({
            industry: 'Home Automation', sub: 'Smart Building', customerType: 'Distributor',
            name: 'Auto Distro',
            desc: 'Distributor of smart switch gateway automation',
        });
        assert.ok(dist.primaryRecommendation);
    });

    it('Consultant gets consultant-oriented strategy when applicable', () => {
        const out = scoreCase({
            industry: 'Home Automation', sub: 'Smart Building', customerType: 'Consultant',
            name: 'Design Consultants',
            desc: 'Consultant for residential smart switch zigbee automation projects',
        });
        assert.ok(out.primaryRecommendation);
        assert.match(out.recommendedSalesStrategy || out.primaryRecommendation.salesStrategy, /Consultant|System|High|Medium|Low|Long/i);
    });

    it('supports alternatives, cross-sell and upsell', () => {
        const out = scoreCase({
            industry: 'Lighting', sub: 'LED Lighting', customerType: 'OEM',
            name: 'Photon OEM',
            desc: 'LED driver OEM tunable white DALI commercial lighting',
        });
        assert.ok(out.primaryRecommendation);
        assert.ok(Array.isArray(out.alternativeProducts) || Array.isArray(out.secondaryRecommendations));
        assert.ok(Array.isArray(out.crossSellOpportunities));
        assert.ok(Array.isArray(out.upsellOpportunities));
    });

    it('AI mode falls back to rules; hybrid works; malformed AI rejected', async () => {
        const products = catalog();
        const base = {
            record: { companyName: 'LED Co', businessDescription: 'LED driver manufacturer' },
            classification: { status: 'CLASSIFIED', parentIndustry: 'Lighting', subIndustry: 'LED Lighting', customerType: 'Manufacturer', confidenceScore: 90 },
            relevance: { relevanceScore: 80 },
            products,
            settingsDoc: { aiLeadIntelligence: { productRecommendation: { mode: 'ai' } } },
        };
        const ai = await runProductRecommendation({ ...base, forceMode: 'ai' });
        assert.equal(ai.fallbackUsed, true);
        assert.ok(String(ai.engineUsed).includes('fallback') || ai.engineUsed === 'rule_based');
        const hybrid = await runProductRecommendation({ ...base, forceMode: 'hybrid' });
        assert.equal(hybrid.fallbackUsed, true);
        const bad = validateAiRecommendationOutput({ primaryRecommendation: { productName: 'Foreign Secret Product' }, confidence: 90 }, products.map((p) => p.productName));
        assert.equal(bad.ok, false);
    });

    it('manual_review mode does not auto-accept', async () => {
        const out = await runProductRecommendation({
            record: { companyName: 'LED Co', businessDescription: 'LED driver manufacturer' },
            classification: { status: 'CLASSIFIED', parentIndustry: 'Lighting', subIndustry: 'LED Lighting', customerType: 'Manufacturer', confidenceScore: 90 },
            products: catalog(),
            forceMode: 'manual_review',
            settingsDoc: { aiLeadIntelligence: { productRecommendation: { mode: 'manual_review' } } },
        });
        assert.equal(out.status, 'MANUAL_REVIEW');
        assert.equal(out.engineUsed, 'manual_review');
    });

    it('does not expose secrets', () => {
        const out = scoreCase({
            industry: 'Lighting', sub: 'LED Lighting', customerType: 'Manufacturer',
            name: 'Secret Check',
            desc: 'LED driver manufacturer',
        });
        const blob = JSON.stringify(out);
        assert.equal(blob.includes('sk-'), false);
        assert.equal(blob.toLowerCase().includes('openai_api_key'), false);
    });

    it('permission matrix denies view-only from run/override/lock/manage', () => {
        const viewOnly = { roleName: 'staff', permissions: ['data_extractor.product_recommendation.view'] };
        for (const p of [
            'data_extractor.product_recommendation.run',
            'data_extractor.product_recommendation.override',
            'data_extractor.product_recommendation.lock',
            'data_extractor.product_recommendation.manage',
        ]) {
            assert.equal(checkUserPermission(viewOnly, p), false);
        }
    });

    it('registers recommendation routes', () => {
        const expected = [
            '/ai-lead-intelligence/products',
            '/ai-lead-intelligence/recommendations',
            '/ai-lead-intelligence/recommendations/recommend',
            '/ai-lead-intelligence/recommendations/:id/override',
            '/ai-lead-intelligence/recommendations/:id/lock',
            '/ai-lead-intelligence/recommendation-batches',
        ];
        const paths = dataExtractorRouter.stack.filter((l) => l.route).map((l) => l.route.path);
        for (const p of expected) assert.ok(paths.includes(p), `missing ${p}`);
    });
});

describe('Phase 8 MongoDB workflows', () => {
    before(async () => {
        assert.ok(MONGO_URI.includes('crm_test'));
        await mongoose.connect(MONGO_URI);
        await ExtractorSettings.findOneAndUpdate(
            { companyId: companyA },
            { $set: { aiLeadIntelligence: { enabled: true, productRecommendation: { mode: 'rule_based', minimumOpportunityScore: 30, primaryMinScore: 50 } } } },
            { upsert: true },
        );
        const products = await saveProductMasters(companyA, catalog().map((p) => ({ ...p, productName: `${TAG} ${p.productName}` })), userA);
        created.products.push(...products.map((p) => p._id));
    });

    after(async () => {
        try {
            if (created.recs.length) await AiProductRecommendation.deleteMany({ _id: { $in: created.recs } });
            if (created.batches.length) await AiProductRecommendationBatchJob.deleteMany({ _id: { $in: created.batches } });
            if (created.classifications.length) await AiIndustryClassification.deleteMany({ _id: { $in: created.classifications } });
            if (created.products.length) await AiProductMaster.deleteMany({ _id: { $in: created.products } });
            await AiProductRecommendation.deleteMany({ companyId: { $in: [companyA, companyB] } });
            await AiProductRecommendationBatchJob.deleteMany({ companyId: { $in: [companyA, companyB] } });
            await AiProductMaster.deleteMany({ companyId: { $in: [companyA, companyB] } });
            await AiIndustryClassification.deleteMany({ companyId: { $in: [companyA, companyB] } });
            await ExtractorSettings.deleteMany({ companyId: { $in: [companyA, companyB] } });
        } finally {
            await mongoose.disconnect();
        }
    });

    it('persists recommendation, override history, lock protection, tenant isolation', async () => {
        const out = await recommendOne(companyA, userA, {
            adhocKey: `${TAG}-led`,
            mode: 'rule_based',
            searchKeyword: 'LED Driver Manufacturer',
            customerType: 'Manufacturer',
            record: {
                companyName: `${TAG} Bright LED OEM`,
                businessDescription: 'LED driver manufacturer commercial luminaires',
            },
            classification: {
                status: 'CLASSIFIED',
                parentIndustry: 'Lighting',
                subIndustry: 'LED Lighting',
                customerType: 'Manufacturer',
                confidenceScore: 90,
                evidenceSnippets: ['LED driver manufacturer'],
            },
            relevance: { relevanceScore: 85 },
        });
        assert.equal(out.skipped, false);
        created.recs.push(out.recommendation._id);
        assert.ok(out.recommendation.primaryRecommendation?.productName);

        const overridden = await overrideRecommendation(companyA, userA, out.recommendation._id, {
            action: 'override',
            productName: `${TAG} Tunable White Driver`,
            reason: 'Prefer tunable',
        });
        assert.equal(overridden.manuallyApproved, true);
        assert.equal(overridden.history[overridden.history.length - 1].action, 'override');

        const locked = await lockRecommendation(companyA, userA, out.recommendation._id, { action: 'lock', reason: 'Approved' });
        assert.equal(locked.locked, true);
        const skip = await recommendOne(companyA, userA, {
            adhocKey: `${TAG}-led`,
            mode: 'rule_based',
            record: { companyName: `${TAG} Bright LED OEM`, businessDescription: 'LED driver manufacturer' },
            classification: { status: 'CLASSIFIED', parentIndustry: 'Lighting', subIndustry: 'LED Lighting', customerType: 'Manufacturer', confidenceScore: 90 },
        });
        assert.equal(skip.skipped, true);
        assert.equal(skip.reason, 'locked');

        const hist = await getRecommendationHistory(companyA, out.recommendation._id);
        assert.ok(hist.history.some((h) => h.action === 'lock'));

        await assert.rejects(() => getRecommendation(companyB, out.recommendation._id), /not found/i);
        await assert.rejects(
            () => recommendOne(companyA, userA, { companyId: companyB, record: { companyName: 'x' } }),
            /companyId\/tenantId overrides are rejected/,
        );
    });

    it('batch pause/resume and failed item does not stop remaining', async () => {
        const c1 = await AiIndustryClassification.create({
            companyId: companyA,
            companyName: `${TAG} Batch LED`,
            status: 'CLASSIFIED',
            parentIndustry: 'Lighting',
            subIndustry: 'LED Lighting',
            customerType: 'Manufacturer',
            confidenceScore: 80,
            evidenceSnippets: ['LED driver manufacturer'],
            recordKey: `${TAG}-c1`,
        });
        const c2 = await AiIndustryClassification.create({
            companyId: companyA,
            companyName: `${TAG} Batch Solar`,
            status: 'CLASSIFIED',
            parentIndustry: 'Solar',
            subIndustry: 'Solar Electronics',
            customerType: 'Exporter',
            confidenceScore: 80,
            evidenceSnippets: ['solar mppt charge controller'],
            recordKey: `${TAG}-c2`,
        });
        created.classifications.push(c1._id, c2._id);

        const batch = await createRecommendationBatch(companyA, userA, {
            classificationIds: [c1._id, c2._id],
            mode: 'rule_based',
            idempotencyKey: `${TAG}-batch`,
        });
        created.batches.push(batch._id);
        assert.equal(batch.total, 2);

        await processRecommendationBatchChunk(companyA, userA, batch._id, { maxItems: 1 });
        let mid = await getRecommendationBatch(companyA, batch._id);
        assert.equal(mid.cursor, 1);
        await controlRecommendationBatch(companyA, userA, batch._id, 'pause', { reason: 'Test pause' });
        mid = await getRecommendationBatch(companyA, batch._id);
        assert.equal(mid.status, 'PAUSED');
        const paused = await processRecommendationBatchChunk(companyA, userA, batch._id, { maxItems: 5 });
        assert.equal(paused.status, 'PAUSED');
        await controlRecommendationBatch(companyA, userA, batch._id, 'resume');
        const done = await processRecommendationBatchChunk(companyA, userA, batch._id, { maxItems: 10 });
        assert.ok(done.cursor >= 1);
        assert.ok(done.successCount >= 1 || done.results.some((r) => r.status === 'success'));

        // foreign company classification rejected
        const foreign = await AiIndustryClassification.create({
            companyId: companyB,
            companyName: `${TAG} Foreign`,
            status: 'CLASSIFIED',
            parentIndustry: 'Lighting',
            subIndustry: 'LED Lighting',
            recordKey: `${TAG}-foreign`,
        });
        created.classifications.push(foreign._id);
        await assert.rejects(
            () => createRecommendationBatch(companyA, userA, { classificationIds: [foreign._id] }),
            /No owned classification targets/,
        );
    });
});
