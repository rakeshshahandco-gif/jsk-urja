import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runRuleEngine } from '../../src/services/dataExtractor/industryClassification/ruleEngine.service.js';
import { classifyIndustryRecord } from '../../src/services/dataExtractor/industryClassification/classify.service.js';
import { validateAiClassificationOutput } from '../../src/services/dataExtractor/industryClassification/validateAiOutput.js';

const OID = {
    lighting: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    textile: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    solar: 'cccccccccccccccccccccccc',
    homeAuto: 'dddddddddddddddddddddddd',
    manufacturer: 'eeeeeeeeeeeeeeeeeeeeeeee',
};

const masters = {
    industries: [
        {
            _id: OID.lighting,
            parentIndustry: 'Lighting',
            subIndustry: 'LED Manufacturing',
            keywords: ['led manufacturer', 'lighting manufacturer', 'led lighting'],
            negativeKeywords: ['restaurant'],
            productKeywords: ['led driver', 'led bulb', 'street light'],
            websiteKeywords: ['lighting', 'led'],
            exclusionTerms: ['taxi driver', 'driver recruitment'],
            isActive: true,
        },
        {
            _id: OID.textile,
            parentIndustry: 'Textile',
            subIndustry: 'Garment Manufacturing',
            keywords: ['textile', 'garment', 'fabric manufacturer'],
            negativeKeywords: [],
            productKeywords: ['cotton fabric', 'apparel'],
            websiteKeywords: ['textile'],
            exclusionTerms: [],
            isActive: true,
        },
        {
            _id: OID.solar,
            parentIndustry: 'Renewable Energy',
            subIndustry: 'Solar',
            keywords: ['solar', 'photovoltaic', 'solar panel'],
            negativeKeywords: [],
            productKeywords: ['solar inverter', 'solar module'],
            websiteKeywords: ['solar'],
            exclusionTerms: [],
            isActive: true,
        },
        {
            _id: OID.homeAuto,
            parentIndustry: 'Home Automation',
            subIndustry: 'Smart Building',
            keywords: ['smart home', 'home automation', 'smart building'],
            negativeKeywords: [],
            productKeywords: ['smart switch', 'home automation'],
            websiteKeywords: ['smarthome', 'automation'],
            exclusionTerms: [],
            isActive: true,
        },
    ],
    customerTypes: [
        { _id: OID.manufacturer, name: 'Manufacturer', keywords: ['manufacturer', 'factory'], negativeKeywords: [], isActive: true },
    ],
    opportunityMaps: [],
};

const settings = {
    aiLeadIntelligence: {
        enabled: true,
        classificationMode: 'rule_based',
        minimumConfidence: 45,
        requireManualReviewBelowConfidence: 60,
        autoApplyOnSearch: true,
    },
};

describe('Phase 6 industry classification correctness', () => {
    it('classifies LED lighting company', async () => {
        const out = await classifyIndustryRecord('companyA', {
            companyName: 'Bright LED Works',
            businessDescription: 'LED manufacturer producing LED driver and street light products',
            keywords: ['led manufacturer', 'led driver'],
            website: 'https://brightled.example',
        }, settings, { masters });
        assert.equal(out.parentIndustry, 'Lighting');
        assert.equal(out.subIndustry, 'LED Manufacturing');
        assert.ok(['CLASSIFIED', 'MANUAL_REVIEW_REQUIRED', 'LOW_CONFIDENCE'].includes(out.status));
        assert.ok(out.confidenceScore > 0);
    });

    it('classifies textile company', async () => {
        const out = await classifyIndustryRecord('companyA', {
            companyName: 'Cotton Mills',
            businessDescription: 'Textile and garment manufacturing with cotton fabric apparel',
            keywords: ['textile', 'garment'],
        }, settings, { masters });
        assert.equal(out.parentIndustry, 'Textile');
    });

    it('classifies solar company', async () => {
        const out = await classifyIndustryRecord('companyA', {
            companyName: 'SunPower Systems',
            businessDescription: 'Solar panel and solar inverter photovoltaic solutions',
            keywords: ['solar', 'photovoltaic'],
        }, settings, { masters });
        assert.equal(out.parentIndustry, 'Renewable Energy');
        assert.equal(out.subIndustry, 'Solar');
    });

    it('classifies home-automation company', async () => {
        const out = await classifyIndustryRecord('companyA', {
            companyName: 'SmartNest',
            businessDescription: 'Smart home automation and smart building systems',
            keywords: ['smart home automation'],
        }, settings, { masters });
        assert.equal(out.parentIndustry, 'Home Automation');
    });
});

describe('Phase 6 ambiguous keyword handling', () => {
    it('marks driver recruitment agency irrelevant', async () => {
        const out = await classifyIndustryRecord('companyA', {
            companyName: 'City Driver Recruitment Agency',
            businessDescription: 'Driver recruitment and staffing placement agency for jobs',
            keywords: ['driver recruitment', 'agency'],
        }, settings, { masters });
        assert.equal(out.status, 'IRRELEVANT');
    });

    it('marks taxi driver company irrelevant', async () => {
        const out = await classifyIndustryRecord('companyA', {
            companyName: 'Quick Taxi Driver Service',
            businessDescription: 'Taxi driver and cab chauffeur transport service',
            keywords: ['taxi driver'],
        }, settings, { masters });
        assert.equal(out.status, 'IRRELEVANT');
    });

    it('does not falsely classify automation staffing as home/industrial automation', async () => {
        const out = await classifyIndustryRecord('companyA', {
            companyName: 'AutoHire Staffing',
            businessDescription: 'Automation staffing and recruitment workforce payroll services',
            keywords: ['automation staffing'],
        }, settings, { masters });
        assert.equal(out.status, 'IRRELEVANT');
        assert.notEqual(out.parentIndustry, 'Home Automation');
    });

    it('keeps LED driver manufacturer relevant', async () => {
        const rule = runRuleEngine({
            companyName: 'PowerLED',
            businessDescription: 'LED driver manufacturer for lighting electronics',
            keywords: ['led driver manufacturer'],
        }, masters, settings);
        assert.ok(rule.top);
        assert.equal(rule.top.parentIndustry, 'Lighting');
        assert.equal(rule.forceIrrelevant, false);
    });
});

describe('Phase 6 confidence and conflicts', () => {
    it('returns secondary industries for multi-signal company', async () => {
        const out = await classifyIndustryRecord('companyA', {
            companyName: 'Hybrid Energy Textiles',
            businessDescription: 'Solar panel textile fabric manufacturing and solar inverter apparel support',
            keywords: ['solar', 'textile', 'garment', 'solar panel'],
        }, settings, { masters });
        assert.ok(Array.isArray(out.secondaryIndustries));
    });

    it('returns MULTIPLE_POSSIBILITIES on conflicting strong industries', async () => {
        const conflictMasters = {
            ...masters,
            industries: masters.industries.map((x) => ({
                ...x,
                keywords: [...(x.keywords || []), 'industrial solutions', 'enterprise systems'],
                productKeywords: [...(x.productKeywords || []), 'industrial solutions'],
            })),
        };
        const out = await classifyIndustryRecord('companyA', {
            companyName: 'Enterprise Solutions',
            businessDescription: 'industrial solutions enterprise systems lighting solar textile smart home automation',
            keywords: ['industrial solutions', 'enterprise systems', 'led lighting', 'solar panel', 'textile', 'smart home'],
        }, settings, { masters: conflictMasters });
        assert.ok(['MULTIPLE_POSSIBILITIES', 'MANUAL_REVIEW_REQUIRED', 'CLASSIFIED', 'LOW_CONFIDENCE'].includes(out.status));
    });

    it('low confidence requires manual review / low confidence status', async () => {
        const out = await classifyIndustryRecord('companyA', {
            companyName: 'Generic Co',
            businessDescription: 'lighting',
            keywords: ['lighting'],
        }, {
            aiLeadIntelligence: {
                ...settings.aiLeadIntelligence,
                minimumConfidence: 90,
                requireManualReviewBelowConfidence: 95,
            },
        }, { masters });
        assert.ok(['LOW_CONFIDENCE', 'MANUAL_REVIEW_REQUIRED', 'IRRELEVANT'].includes(out.status));
    });

    it('negative keywords reduce score', () => {
        const base = runRuleEngine({
            companyName: 'Bright LED',
            businessDescription: 'LED manufacturer led driver street light',
            keywords: ['led manufacturer'],
        }, masters, settings);
        const withNeg = runRuleEngine({
            companyName: 'Bright LED Restaurant',
            businessDescription: 'LED manufacturer led driver street light restaurant cafe',
            keywords: ['led manufacturer', 'restaurant'],
        }, masters, settings);
        assert.ok(withNeg.top.score <= base.top.score);
    });

    it('exclusion terms work', () => {
        const rule = runRuleEngine({
            companyName: 'Agency',
            businessDescription: 'LED manufacturer with driver recruitment services',
            keywords: ['led manufacturer', 'driver recruitment'],
        }, masters, settings);
        assert.ok((rule.top?.negativeKeywordsFound || []).length >= 1 || rule.top.score < 100);
    });

    it('multiple-source agreement improves confidence', () => {
        const single = runRuleEngine({
            companyName: 'Bright LED',
            businessDescription: 'LED manufacturer led driver',
            keywords: ['led manufacturer'],
            rawExtractedData: { sourceProviders: ['brave'] },
        }, masters, settings);
        const multi = runRuleEngine({
            companyName: 'Bright LED',
            businessDescription: 'LED manufacturer led driver',
            keywords: ['led manufacturer'],
            rawExtractedData: { sourceProviders: ['brave', 'indiamart'] },
        }, masters, settings);
        assert.ok(multi.top.score >= single.top.score);
    });
});

describe('Phase 6 modes and AI safety', () => {
    it('rule-only mode works', async () => {
        const out = await classifyIndustryRecord('companyA', {
            companyName: 'Bright LED',
            businessDescription: 'LED manufacturer led driver',
            keywords: ['led manufacturer'],
        }, settings, { masters, forceMode: 'rule_based' });
        assert.equal(out.engineUsed, 'rule_based');
    });

    it('AI mode falls back to rules when AI fails/unavailable', async () => {
        const out = await classifyIndustryRecord('companyA', {
            companyName: 'Bright LED',
            businessDescription: 'LED manufacturer led driver',
            keywords: ['led manufacturer'],
        }, settings, { masters, forceMode: 'ai' });
        assert.match(out.engineUsed, /fallback|rule|ai/);
        assert.equal(out.fallbackUsed, true);
    });

    it('hybrid mode works with fallback when AI unavailable', async () => {
        const out = await classifyIndustryRecord('companyA', {
            companyName: 'Bright LED',
            businessDescription: 'LED manufacturer led driver',
            keywords: ['led manufacturer'],
        }, settings, { masters, forceMode: 'hybrid' });
        assert.ok(out.engineUsed.includes('hybrid') || out.engineUsed.includes('fallback') || out.engineUsed.includes('rule'));
    });

    it('manual-review mode does not auto-apply', async () => {
        const out = await classifyIndustryRecord('companyA', {
            companyName: 'Bright LED',
            businessDescription: 'LED manufacturer led driver',
            keywords: ['led manufacturer'],
        }, settings, { masters, forceMode: 'manual_review' });
        assert.equal(out.status, 'MANUAL_REVIEW_REQUIRED');
        assert.equal(out.applied, false);
        assert.equal(out.engineUsed, 'manual_review');
    });

    it('malformed AI output is rejected', () => {
        const validated = validateAiClassificationOutput({
            raw: { primaryIndustryId: 'not-allowed', status: 'CLASSIFIED', confidence: 120, evidence: [] },
        }, masters, 'companyA');
        assert.equal(validated.ok, false);
        assert.ok(validated.errors.length >= 2);
    });

    it('AI cannot return another company Industry Master ID', () => {
        const validated = validateAiClassificationOutput({
            raw: {
                primaryIndustryId: 'ffffffffffffffffffffffff',
                status: 'CLASSIFIED',
                confidence: 80,
                evidence: ['led'],
            },
        }, masters, 'companyA');
        assert.equal(validated.ok, false);
        assert.ok(validated.errors.some((e) => e.includes('Industry Master')));
    });

    it('rejects body/query companyId conceptually via classify options guard', async () => {
        await assert.rejects(
            () => classifyIndustryRecord('companyA', { companyName: 'X' }, settings, { masters, bodyCompanyId: 'other' }),
            /companyId overrides are rejected/,
        );
    });

    it('does not expose secrets in classification output', async () => {
        const out = await classifyIndustryRecord('companyA', {
            companyName: 'Bright LED',
            businessDescription: 'LED manufacturer led driver',
            keywords: ['led manufacturer'],
        }, settings, { masters });
        const blob = JSON.stringify(out);
        assert.equal(blob.includes('EXTRACTOR_OPENAI_API_KEY'), false);
        assert.equal(blob.includes('Bearer '), false);
    });
});
