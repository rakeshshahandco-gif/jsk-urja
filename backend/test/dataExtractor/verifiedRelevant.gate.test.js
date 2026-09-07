import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { qualifyWithRules } from '../../src/services/dataExtractor/searchCampaign/rawCaptureQualification/ruleEngine.js';
import {
    isEligibleForFinalVerified,
    isIndustryRelevantForVerifiedProspect,
} from '../../src/services/dataExtractor/searchCampaign/rawCaptureGenuineness/canonicalVerifiedCompany.util.js';
import { previewSimpleLeadSearchQueries } from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.service.js';

const ledCampaign = {
    product: 'LED Light Manufacturer',
    targetIndustry: 'LED Light Manufacturer',
    name: 'LED LIGHT — MUMBAI,THANE,VASAI,VIRAR,NALASOPARA,KALYAN',
    city: 'Mumbai',
    businessTypes: ['Manufacturer'],
};

describe('verified relevant vs genuine-only', () => {
    it('does not treat a genuine unrelated website as a verified prospect', () => {
        const qual = qualifyWithRules({
            campaign: ledCampaign,
            enrichment: {
                companyName: 'NoBroker',
                websiteUrl: 'https://www.nobroker.in/',
                productsServices: ['flats for rent', 'owner properties', 'home loan'],
                pagesVisited: ['https://www.nobroker.in/'],
                sourceEvidence: [
                    { field: 'about', value: 'Find flats for rent in Mumbai', sourceUrl: 'https://www.nobroker.in/' },
                ],
            },
            captures: [{
                title: 'Liebherr Fridge Repair Mumbai',
                snippet: 'NoBroker home services',
                resultUrlOriginal: 'https://www.nobroker.in/fridge-repair',
            }],
        });
        assert.match(String(qual.productMatchStrength), /Unrelated/i);
        assert.equal(isIndustryRelevantForVerifiedProspect(qual, {}), false);
        assert.equal(isEligibleForFinalVerified(
            { systemDecision: 'likely_genuine', genuinenessScore: 74 },
            { websiteUrl: 'https://www.nobroker.in/' },
            qual,
        ), false);
    });

    it('does not treat standalone led/light tokens or campaign name as industry evidence', () => {
        const qual = qualifyWithRules({
            campaign: ledCampaign,
            enrichment: {
                companyName: 'CarDekho',
                websiteUrl: 'https://www.cardekho.com/',
                productsServices: ['used cars', 'new car prices'],
                pagesVisited: ['https://www.cardekho.com/'],
                sourceEvidence: [
                    { field: 'page', value: 'Car prices in Mumbai. Some headlights and ambient light options.', sourceUrl: 'https://www.cardekho.com/' },
                ],
            },
            captures: [{
                title: 'Car prices Mumbai',
                snippet: 'light and led mention in trim',
                resultUrlOriginal: 'https://www.cardekho.com/cars',
            }],
        });
        assert.doesNotMatch(String(qual.productMatchStrength), /Strong Product Match/i);
        assert.equal(isEligibleForFinalVerified(
            { systemDecision: 'verified_genuine' },
            { websiteUrl: 'https://www.cardekho.com/' },
            qual,
        ), false);
    });

    it('keeps a genuine LED manufacturer as verified relevant', () => {
        const enrich = {
            companyName: 'Vasai LED Works',
            websiteUrl: 'https://vasailed.example.com',
            businessType: 'manufacturer',
            manufacturerEvidence: 'OEM manufacturer with production facility',
            productsServices: ['LED luminaires', 'LED panel lights', 'LED downlights'],
            pagesVisited: ['https://vasailed.example.com/'],
            sourceEvidence: [
                { field: 'about', value: 'We manufacture LED lighting fixtures at our Vasai factory', sourceUrl: 'https://vasailed.example.com/about' },
            ],
        };
        const qual = qualifyWithRules({
            campaign: ledCampaign,
            enrichment: enrich,
            captures: [{
                title: 'Vasai LED Works — LED lighting manufacturer',
                snippet: 'Factory producing LED panel lights',
                resultUrlOriginal: 'https://vasailed.example.com',
            }],
        });
        assert.match(String(qual.productMatchStrength), /Strong/i);
        assert.equal(qual.businessTypeMatch, 'yes');
        assert.equal(isIndustryRelevantForVerifiedProspect(qual, enrich), true);
        assert.equal(isEligibleForFinalVerified(
            { systemDecision: 'verified_genuine', genuinenessScore: 91 },
            enrich,
            qual,
        ), true);
    });

    it('sends LED company with unclear manufacturer evidence to needs review, not verified manufacturer', () => {
        const enrich = {
            companyName: 'Bright LED Mart',
            websiteUrl: 'https://brightledmart.example.com',
            businessType: 'dealer',
            productsServices: ['LED panel lights', 'LED downlights', 'commercial lighting'],
            pagesVisited: ['https://brightledmart.example.com/'],
        };
        const qual = qualifyWithRules({
            campaign: ledCampaign,
            enrichment: enrich,
            captures: [{
                title: 'Bright LED Mart',
                snippet: 'LED lighting dealer',
                resultUrlOriginal: 'https://brightledmart.example.com',
            }],
        });
        assert.match(String(qual.productMatchStrength), /Strong|Possible/i);
        assert.equal(isEligibleForFinalVerified(
            { systemDecision: 'likely_genuine' },
            enrich,
            qual,
        ), false);
    });

    it('splits comma-separated cities so queries stay city-targeted', () => {
        const preview = previewSimpleLeadSearchQueries({
            body: {
                product: 'LED Light Manufacturer',
                city: 'MUMBAI, THANE, VASAI',
                country: 'India',
                businessTypes: ['Manufacturer'],
            },
        });
        const texts = preview.queries.map((q) => q.queryText).join(' | ');
        assert.doesNotMatch(texts, /MUMBAI,\s*THANE,\s*VASAI/i);
        assert.ok(preview.queries.some((q) => /Mumbai/i.test(q.queryText)));
        assert.ok(preview.queries.some((q) => /Thane/i.test(q.queryText)));
        assert.ok(preview.queries.some((q) => /Vasai/i.test(q.queryText)));
        assert.ok(!preview.queries.some((q) => /manufacturer manufacturers/i.test(q.queryText)));
    });
});
