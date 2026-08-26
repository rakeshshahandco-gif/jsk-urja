import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    classifyEntityType,
    extractDirectoryListings,
    isGenericSeoCompanyTitle,
    isNonCompanyDiscoveryEntity,
    resolveCanonicalCompanyName,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/entityClassification.util.js';
import { isEligibleForFinalVerified } from '../../src/services/dataExtractor/searchCampaign/rawCaptureGenuineness/canonicalVerifiedCompany.util.js';

describe('entity classification for verified companies', () => {
    it('treats IndiaMART and Justdial category pages as discovery sources', () => {
        const im = classifyEntityType({
            url: 'https://dir.indiamart.com/mumbai/led-lights.html',
            title: 'LED Lights in Mumbai, Maharashtra',
            enrichment: { isDirectorySource: true, canonicalDomain: 'dir.indiamart.com' },
        });
        assert.equal(im.entityType, 'MARKETPLACE');
        const jd = classifyEntityType({
            url: 'https://www.justdial.com/Aurangabad/LED-Lighting-Manufacturers/nct-1',
            title: 'Best LED Lighting Manufacturers Aurangabad Maharashtra',
            enrichment: { isDirectorySource: true, canonicalDomain: 'justdial.com' },
        });
        assert.ok(['DIRECTORY', 'MARKETPLACE'].includes(jd.entityType));
        assert.equal(isGenericSeoCompanyTitle('LED Lights in Mumbai, Maharashtra'), true);
        assert.equal(isGenericSeoCompanyTitle('Best LED Lighting Manufacturers Aurangabad Maharashtra'), true);
    });

    it('does not verify directory genuineness as a company', () => {
        const eligible = isEligibleForFinalVerified(
            { systemDecision: 'directory_or_marketplace_only', verificationStatus: 'directory_only' },
            { isDirectorySource: true, websiteUrl: 'https://www.justdial.com/x', canonicalDomain: 'justdial.com' },
            { businessType: 'directory_marketplace' },
        );
        assert.equal(eligible, false);
        assert.equal(isNonCompanyDiscoveryEntity(
            { isDirectorySource: true, canonicalDomain: 'indiamart.com' },
            { systemDecision: 'directory_or_marketplace_only' },
            { businessType: 'directory_marketplace' },
        ), true);
    });

    it('resolves a real company name instead of a generic SEO title', () => {
        const resolved = resolveCanonicalCompanyName({
            jsonLdName: 'Nirvana Lighting',
            legalName: 'Nirvana Lighting Pvt Ltd',
            googleTitle: 'LED Light Manufacturers in Maharashtra',
            isDirectory: false,
        });
        assert.equal(resolved.name, 'Nirvana Lighting Pvt Ltd');
        assert.equal(resolved.confidence, 'High');
        const skipped = resolveCanonicalCompanyName({
            googleTitle: 'LED Light Manufacturers in Maharashtra',
            isDirectory: false,
        });
        assert.equal(skipped.name, '');
        assert.match(skipped.evidence, /Generic SEO/i);
    });

    it('extracts ItemList businesses from directory HTML', () => {
        const html = `<script type="application/ld+json">${JSON.stringify({
            '@type': 'ItemList',
            itemListElement: [
                { item: { name: 'ABC Lighting Pvt Ltd', url: 'https://abclights.example.com/' } },
                { item: { name: 'XYZ Luminaires', url: 'https://xyzluminaires.example.com/' } },
                { item: { name: 'LED Lights in Mumbai, Maharashtra', url: 'https://dir.indiamart.com/mumbai/led' } },
            ],
        })}</script>`;
        const listings = extractDirectoryListings(html, 'https://dir.indiamart.com/mumbai/led-lights.html');
        assert.equal(listings.length, 2);
        assert.equal(listings[0].companyName, 'ABC Lighting Pvt Ltd');
        assert.equal(listings[1].companyName, 'XYZ Luminaires');
        assert.ok(!listings.some((l) => /LED Lights in Mumbai/i.test(l.companyName)));
    });

    it('marks associations as non-company discovery', () => {
        const a = classifyEntityType({
            url: 'https://elcoma.com/members',
            title: 'ELCOMA member directory of lighting manufacturers',
        });
        assert.equal(a.entityType, 'ASSOCIATION');
    });
});
