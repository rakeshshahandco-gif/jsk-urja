import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    classifyLeadRecord,
    defaultAiSettings,
} from '../../src/services/dataExtractor/aiLeadIntelligence.service.js';

const settings = {
    aiEnabled: true,
    aiLeadIntelligence: {
        enabled: true,
        classificationMode: 'rule_based',
        requireManualReviewBelowConfidence: 60,
    },
};

const masters = {
    industries: [
        {
            parentIndustry: 'Lighting',
            subIndustry: 'LED Manufacturing',
            keywords: ['led manufacturer', 'led driver', 'lighting manufacturer'],
            negativeKeywords: ['restaurant'],
            productKeywords: ['led bulb', 'led panel', 'street light'],
            websiteKeywords: ['lighting', 'led'],
        },
        {
            parentIndustry: 'Industrial Automation',
            subIndustry: 'Panel Builder',
            keywords: ['control panel', 'automation panel'],
            negativeKeywords: [],
            productKeywords: ['plc panel', 'mcc panel'],
            websiteKeywords: ['automation'],
        },
    ],
    customerTypes: [
        { name: 'Manufacturer', keywords: ['manufacturer', 'factory'], negativeKeywords: ['dealer'] },
        { name: 'Distributor', keywords: ['distributor', 'dealer'], negativeKeywords: ['manufacturer'] },
    ],
    opportunityMaps: [
        {
            parentIndustry: 'Lighting',
            subIndustry: 'LED Manufacturing',
            customerType: 'Manufacturer',
            opportunityItems: [
                {
                    productName: 'LED Driver',
                    priority: 'high',
                    salesStrategy: 'Discuss OEM supply and energy efficiency',
                    positiveSignals: ['oem', 'exports', 'street light'],
                    negativeSignals: ['retail only'],
                    recommendedFollowUp: 'Share OEM datasheet and schedule technical call',
                    recommendedSalesperson: 'industrial_sales',
                },
            ],
        },
    ],
};

describe('Phase 5 default AI lead intelligence settings', () => {
    it('normalizes settings safely', () => {
        const out = defaultAiSettings({});
        assert.equal(out.classificationMode, 'rule_based');
        assert.equal(out.enabled, false);
    });
});

describe('Phase 5 rule-based classification', () => {
    it('classifies multi-industry leads with explainability and opportunity mapping', async () => {
        const result = await classifyLeadRecord({
            companyName: 'Bright LED Works Pvt Ltd',
            website: 'https://brightlighting.in',
            businessDescription: 'LED manufacturer for OEM street light and panel applications with exports.',
            keywords: ['led manufacturer', 'oem'],
            productCategories: ['LED Driver', 'Street Light'],
            sourceUrl: 'https://brightlighting.in/about',
        }, settings, masters);

        assert.equal(result.industry.parentIndustry, 'Lighting');
        assert.equal(result.industry.subIndustry, 'LED Manufacturing');
        assert.equal(result.customerType.name, 'Manufacturer');
        assert.equal(result.engineUsed, 'rule_based');
        assert.ok(result.explainability.confidence > 0);
        assert.ok(result.explainability.evidence.length > 0);
        assert.ok(result.explainability.keywordsFound.includes('led manufacturer'));
        assert.ok(result.opportunities.some((x) => x.productName === 'LED Driver'));
    });

    it('supports manual review mode without stopping processing', async () => {
        const result = await classifyLeadRecord({
            companyName: 'ABC Projects',
            website: 'https://abcprojects.in',
            businessDescription: 'General contractor and dealer',
            keywords: ['dealer'],
        }, {
            ...settings,
            aiLeadIntelligence: {
                ...settings.aiLeadIntelligence,
                classificationMode: 'manual_review',
            },
        }, masters);

        assert.equal(result.status, 'manual_review');
        assert.equal(result.engineUsed, 'manual_review');
        assert.equal(result.requiresManualReview, true);
    });
});
