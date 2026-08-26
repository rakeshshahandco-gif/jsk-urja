import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSimpleQueries } from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/queryBuilder.util.js';
import { qualifyWithRules } from '../../src/services/dataExtractor/searchCampaign/rawCaptureQualification/ruleEngine.js';
import {
    formatSimpleSearchLabel,
    matchRequestedBusinessType,
    buildManufacturerSearchPhrases,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleBusinessType.util.js';

describe('simple business type search', () => {
    it('formats the owner-facing search label without Google operators', () => {
        assert.equal(formatSimpleSearchLabel('LED Light', 'Manufacturer', 'Mumbai'), 'LED Light · Manufacturer · Mumbai');
        assert.equal(
            formatSimpleSearchLabel('LED Light', ['Manufacturer', 'Exporter'], 'Mumbai'),
            'LED Light · Manufacturer + Exporter · Mumbai',
        );
    });

    it('generates manufacturer variants and keeps exclusions internal', () => {
        const queries = buildSimpleQueries({
            product: 'LED Light',
            businessTypes: ['Manufacturer'],
            locationScope: 'city',
            city: 'Mumbai',
        });
        assert.ok(queries.length >= 5);
        assert.equal(queries[0].ownerDisplayLabel, 'LED Light · Manufacturer · Mumbai');
        assert.match(queries[0].queryText, /led light manufacturer Mumbai/i);
        assert.ok(queries.some((q) => /"led light" manufacturers Mumbai/i.test(q.queryText)));
        assert.ok(queries.some((q) => /"led light" manufacturing company Mumbai/i.test(q.queryText)));
        assert.ok(queries.some((q) => /"led light" factory Mumbai/i.test(q.queryText)));
        assert.ok(queries.some((q) => /"led light" OEM manufacturer Mumbai/i.test(q.queryText)));
        for (const q of queries) {
            assert.match(q.queryText, /-jobs/);
            assert.match(q.queryText, /-course/);
            assert.match(q.queryText, /-training/);
            assert.doesNotMatch(q.ownerDisplayLabel, /-jobs/);
        }
    });

    it('does not treat a directory category page as a manufacturer', () => {
        const bt = matchRequestedBusinessType({
            requested: 'Manufacturer',
            internalType: 'manufacturer',
            enrichment: {
                isDirectorySource: true,
                companyName: 'IndiaMART',
                websiteUrl: 'https://www.indiamart.com/led-light-manufacturers-in-mumbai.html',
            },
            captures: [{
                title: 'LED Light Manufacturers in Mumbai',
                snippet: 'Find LED light manufacturers',
                resultUrlOriginal: 'https://www.indiamart.com/led-light-manufacturers-in-mumbai.html',
            }],
            evidenceText: 'LED Light Manufacturers in Mumbai',
        });
        assert.equal(bt.match, 'no');
        assert.equal(bt.detected, 'Directory / Discovery Source');
    });

    it('rejects job/course pages as Manufacturer without factory evidence', () => {
        const bt = matchRequestedBusinessType({
            requested: 'Manufacturer',
            internalType: 'unknown',
            enrichment: { companyName: 'Jobs in LED' },
            captures: [{ title: 'LED Light manufacturing jobs in Mumbai', snippet: 'career vacancy training course' }],
            evidenceText: 'LED Light manufacturing jobs hiring career vacancy course training',
        });
        assert.equal(bt.match, 'no');
    });

    it('matches a real manufacturer from website evidence', () => {
        const bt = matchRequestedBusinessType({
            requested: 'Manufacturer',
            internalType: 'manufacturer',
            enrichment: {
                companyName: 'Acme Lighting Pvt Ltd',
                manufacturerEvidence: 'own manufacturing unit and production facility',
                businessType: 'manufacturer',
                websiteUrl: 'https://acmelights.example.com',
            },
            captures: [{ title: 'Acme Lighting — LED luminaire manufacturer', snippet: 'We manufacture LED luminaires' }],
            evidenceText: 'We manufacture LED luminaires at our production facility',
        });
        assert.equal(bt.match, 'yes');
        assert.match(bt.reason, /Yes/i);
    });

    it('qualifies manufacturer product match without requiring home-automation keywords', () => {
        const result = qualifyWithRules({
            campaign: {
                product: 'LED Light',
                targetIndustry: 'LED Light',
                city: 'Mumbai',
                businessTypes: ['Manufacturer'],
            },
            enrichment: {
                companyName: 'Acme Lighting',
                websiteUrl: 'https://acmelights.example.com',
                businessType: 'manufacturer',
                manufacturerEvidence: 'OEM manufacturer with production facility',
                productsServices: ['LED luminaires'],
                sourceEvidence: [{ field: 'about', value: 'We manufacture LED lights in Mumbai factory' }],
            },
            captures: [{
                title: 'Acme Lighting LED manufacturer',
                snippet: 'Factory in Mumbai producing LED lights',
                resultUrlOriginal: 'https://acmelights.example.com',
            }],
        });
        assert.equal(result.requestedBusinessType, 'Manufacturer');
        assert.equal(result.businessTypeMatch, 'yes');
        assert.notEqual(result.systemDecision, 'rejected');
    });

    it('downranks IndiaMART category pages during qualification', () => {
        const result = qualifyWithRules({
            campaign: { product: 'LED Light', city: 'Mumbai', businessTypes: ['Manufacturer'] },
            enrichment: {
                companyName: 'IndiaMART',
                websiteUrl: 'https://dir.indiamart.com/mumbai/led-light-manufacturers.html',
                isDirectorySource: true,
                businessType: 'marketplace_directory',
            },
            captures: [{
                title: 'LED Light Manufacturers in Mumbai',
                resultUrlOriginal: 'https://dir.indiamart.com/mumbai/led-light-manufacturers.html',
                displayDomain: 'dir.indiamart.com',
            }],
        });
        assert.equal(result.businessType, 'directory_marketplace');
        assert.equal(result.businessTypeMatch, 'no');
        assert.equal(result.systemDecision, 'human_review_required');
    });

    it('lists manufacturer phrases without exclusions', () => {
        const phrases = buildManufacturerSearchPhrases({ product: 'LED Light', location: 'Mumbai' });
        assert.equal(phrases.length, 5);
        assert.ok(phrases.every((p) => !/-jobs/.test(p.core)));
    });

    it('generates manufacturer + exporter queries with a shared owner label', () => {
        const queries = buildSimpleQueries({
            product: 'LED Light',
            businessTypes: ['Manufacturer', 'Exporter'],
            locationScope: 'city',
            city: 'Mumbai',
        });
        assert.ok(queries.every((q) => q.ownerDisplayLabel === 'LED Light · Manufacturer + Exporter · Mumbai'));
        assert.ok(queries.some((q) => /led light manufacturer Mumbai/i.test(q.queryText)));
        assert.ok(queries.some((q) => /"led light" factory Mumbai/i.test(q.queryText)));
        assert.ok(queries.some((q) => /led light exporter Mumbai/i.test(q.queryText)));
        assert.ok(queries.some((q) => /"led light" exporters Mumbai/i.test(q.queryText)));
        assert.ok(queries.some((q) => /"led light" manufacturer exporter Mumbai/i.test(q.queryText)));
        const texts = queries.map((q) => q.queryText);
        assert.equal(texts.length, new Set(texts).size);
    });

    it('OR-matches Manufacturer + Exporter (A manufacturer, B exporter, C both, D dealer-only)', () => {
        const requested = { requested: ['Manufacturer', 'Exporter'] };
        const a = matchRequestedBusinessType({
            ...requested,
            enrichment: { manufacturerEvidence: 'own manufacturing unit', businessType: 'manufacturer' },
            evidenceText: 'We manufacture LED luminaires at our production facility',
        });
        assert.equal(a.match, 'yes');
        assert.ok(a.requestedBusinessTypes.includes('Manufacturer'));
        assert.ok(a.requestedBusinessTypes.includes('Exporter'));

        const b = matchRequestedBusinessType({
            ...requested,
            enrichment: { businessType: 'exporter' },
            evidenceText: 'We export LED lights worldwide as an exporter',
        });
        assert.equal(b.match, 'yes');
        assert.ok(b.detectedBusinessTypes.includes('Exporter'));

        const c = matchRequestedBusinessType({
            ...requested,
            enrichment: { manufacturerEvidence: 'factory production facility', businessType: 'manufacturer' },
            evidenceText: 'OEM manufacturer and exporter of LED lights',
        });
        assert.equal(c.match, 'yes');
        assert.ok(c.detectedBusinessTypes.includes('Manufacturer'));
        assert.ok(c.detectedBusinessTypes.includes('Exporter'));

        const d = matchRequestedBusinessType({
            ...requested,
            enrichment: { businessType: 'dealer' },
            evidenceText: 'Authorized dealer for LED lighting brands',
        });
        assert.equal(d.match, 'no');
    });

    it('keeps old singular requestedBusinessType records readable', () => {
        const bt = matchRequestedBusinessType({
            requested: 'Manufacturer',
            enrichment: { manufacturerEvidence: 'own manufacturing unit', businessType: 'manufacturer' },
            evidenceText: 'We manufacture LED luminaires at our production facility',
        });
        assert.equal(bt.requested, 'Manufacturer');
        assert.deepEqual(bt.requestedBusinessTypes, ['Manufacturer']);
        assert.equal(bt.match, 'yes');
    });
});
