/**
 * Strict location match + multi-address extraction (Alisan + rule cases).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractLabeledAddressesFromHtml, dedupeAddresses } from '../../src/services/dataExtractor/searchCampaign/rawCaptureEnrichment/addressExtract.util.js';
import { classifyStrictLocation, LOCATION_CLASSIFICATIONS } from '../../src/services/dataExtractor/searchCampaign/rawCaptureQualification/locationMatch.util.js';
import { qualifyWithRules } from '../../src/services/dataExtractor/searchCampaign/rawCaptureQualification/ruleEngine.js';

const ALISAN_HTML = `
<html><body>
<h1>Address</h1>
<p>7-8, Sehrawat Complex, Near Hanuman Mandir, Iffco Chowk, Sukhrali, Gurugram Haryana – 122001</p>
<p>Experience Point - Pillar No 54, Sikanderpur Market, Sikanderpur, DLF Phase 1, Sector 24, Gurugram, Haryana 122002</p>
<p>Noida office - C Block, 24th floor, 16th unit, Bhutani Alphathum, Sec 90, Noida, UP 201305</p>
<p>Manufacturing - Basement and ground floor House at pole no. 5 peregrine building near railway crossing Bijwasan 110061</p>
<p>Home Automation Smart Homes Smart Lighting Smart Switch Zigbee</p>
</body></html>
`;

describe('addressExtract.util', () => {
    it('extracts multiple labelled Alisan addresses without duplicates', () => {
        const addrs = extractLabeledAddressesFromHtml(ALISAN_HTML, 'https://www.alisan.io/contact-us.html');
        assert.ok(addrs.length >= 4, `expected >=4 addresses, got ${addrs.length}: ${JSON.stringify(addrs)}`);
        const cities = [...new Set(addrs.map((a) => a.city).filter(Boolean))];
        assert.ok(cities.includes('Gurugram'));
        assert.ok(cities.includes('Noida'));
        assert.ok(cities.includes('Delhi'));
        assert.equal(dedupeAddresses([...addrs, ...addrs]).length, addrs.length);
        assert.equal(addrs.some((a) => /bangalore|bengaluru/i.test(a.raw)), false);
    });
});

describe('strict location + product rules', () => {
    const bangalore = {
        product: 'Home Automation',
        targetIndustry: 'Home Automation',
        city: 'Bangalore',
        state: 'Karnataka',
        locationScope: 'city',
        name: 'home automation bangalore',
    };

    it('includes official Bangalore / Bengaluru office', () => {
        for (const city of ['Bangalore', 'Bengaluru']) {
            const r = qualifyWithRules({
                campaign: { ...bangalore, city },
                enrichment: {
                    companyName: 'Local HA Co',
                    websiteUrl: 'https://local-ha.test',
                    productsServices: ['home automation', 'smart switch', 'Zigbee'],
                    businessType: 'manufacturer',
                    addresses: [{
                        raw: '12 MG Road, Bengaluru, Karnataka 560001',
                        city: 'Bengaluru',
                        state: 'Karnataka',
                        type: 'Office',
                        sourceUrl: 'https://local-ha.test/contact',
                    }],
                    pagesVisited: ['https://local-ha.test/'],
                    sourceEvidence: [{ field: 'products', value: 'smart switch Zigbee home automation', sourceUrl: 'https://local-ha.test/products' }],
                },
                captures: [{ title: 'Local HA', snippet: 'home automation', resultUrlOriginal: 'https://local-ha.test' }],
            });
            assert.equal(r.locationMatch, 'match');
            assert.equal(r.officeInSelectedCity, true);
            assert.equal(r.systemDecision, 'strong_match');
        }
    });

    it('does not treat Google snippet Bangalore as office confirmation', () => {
        const r = qualifyWithRules({
            campaign: bangalore,
            enrichment: {
                companyName: 'Snippet Co',
                websiteUrl: 'https://snippet.test',
                productsServices: ['home automation systems', 'smart lighting'],
                businessType: 'service_provider',
                addresses: [],
                city: '',
                pagesVisited: ['https://snippet.test/'],
                sourceEvidence: [{ field: 'products', value: 'home automation smart lighting', sourceUrl: 'https://snippet.test/' }],
            },
            captures: [{
                title: 'Snippet Co Home Automation Bangalore',
                snippet: 'Best home automation in Bangalore',
                resultUrlOriginal: 'https://snippet.test',
            }],
        });
        assert.notEqual(r.locationMatch, 'match');
        assert.equal(r.officeInSelectedCity, false);
        assert.notEqual(r.systemDecision, 'strong_match');
    });

    it('marks serves-city without office as partial / not strict strong', () => {
        const r = qualifyWithRules({
            campaign: bangalore,
            enrichment: {
                companyName: 'Pan India HA',
                websiteUrl: 'https://pan.test',
                productsServices: ['home automation', 'smart home', 'serving clients across India including Bangalore installations'],
                manufacturerEvidence: 'We execute projects in Bangalore',
                businessType: 'system_integrator',
                addresses: [],
                city: '',
                pagesVisited: ['https://pan.test/'],
                sourceEvidence: [{ field: 'products', value: 'home automation smart home serving Bangalore', sourceUrl: 'https://pan.test/' }],
            },
            captures: [{ title: 'Pan India', snippet: 'automation', resultUrlOriginal: 'https://pan.test' }],
        });
        assert.equal(r.locationMatch, 'partial');
        assert.equal(r.servesSelectedCity, true);
        assert.equal(r.officeInSelectedCity, false);
        assert.notEqual(r.systemDecision, 'strong_match');
    });

    it('official Gurugram/Noida/Delhi only → Bangalore mismatch exclude', () => {
        const r = qualifyWithRules({
            campaign: bangalore,
            enrichment: {
                companyName: 'North HA',
                websiteUrl: 'https://north.test',
                productsServices: ['home automation', 'smart switch'],
                businessType: 'manufacturer',
                addresses: [
                    { raw: 'Gurugram 122001', city: 'Gurugram', state: 'Haryana', type: 'Office' },
                    { raw: 'Noida 201305', city: 'Noida', state: 'Uttar Pradesh', type: 'Office' },
                ],
                pagesVisited: ['https://north.test/'],
                sourceEvidence: [{ field: 'products', value: 'home automation smart switch', sourceUrl: 'https://north.test/' }],
            },
            captures: [{ title: 'North HA Bangalore', snippet: 'Bangalore', resultUrlOriginal: 'https://north.test' }],
        });
        assert.equal(r.locationMatch, 'mismatch');
        assert.equal(r.systemDecision, 'rejected');
    });

    it('Alisan: strong product, 4 addresses, Bangalore mismatch exclude', () => {
        const addresses = extractLabeledAddressesFromHtml(ALISAN_HTML, 'https://www.alisan.io/contact-us.html');
        const r = qualifyWithRules({
            campaign: bangalore,
            enrichment: {
                companyName: 'Alisan Smart Homes',
                websiteUrl: 'https://www.alisan.io/',
                productsServices: ['Home Automation', 'Smart Homes', 'Smart Lighting', 'Smart Switch', 'Zigbee'],
                businessType: 'system_integrator',
                addresses,
                pagesVisited: ['https://www.alisan.io/', 'https://www.alisan.io/contact-us.html'],
                sourceEvidence: [
                    { field: 'products', value: 'Home Automation Smart Homes Smart Lighting', sourceUrl: 'https://www.alisan.io/' },
                ],
            },
            captures: [{
                title: 'Alisan Smart Homes — Home Automation Bangalore',
                snippet: 'Home automation company Bangalore',
                resultUrlOriginal: 'https://www.alisan.io/',
            }],
        });
        assert.ok(addresses.length >= 4);
        assert.equal(r.addressCount, addresses.length);
        assert.equal(r.locationMatch, 'mismatch');
        assert.equal(r.locationClassification, LOCATION_CLASSIFICATIONS.DIFFERENT_CITY);
        assert.equal(r.officeInSelectedCity, false);
        assert.ok(r.confirmedCities.includes('Gurugram'));
        assert.ok(r.confirmedCities.includes('Noida'));
        assert.ok(r.confirmedCities.includes('Delhi'));
        assert.match(String(r.productMatchStrength), /Strong/i);
        assert.equal(r.systemDecision, 'rejected');
        assert.ok((r.unmatchedOrConflictingEvidence || []).includes('location_mismatch'));
    });

    it('rejects job/course training', () => {
        const r = qualifyWithRules({
            campaign: bangalore,
            enrichment: {
                companyName: 'HA Training',
                websiteUrl: 'https://jobs.test',
                productsServices: ['home automation course', 'training workshop'],
                pagesVisited: ['https://jobs.test/'],
            },
            captures: [{ title: 'Jobs', snippet: 'hiring', resultUrlOriginal: 'https://jobs.test' }],
        });
        assert.equal(r.systemDecision, 'rejected');
    });

    it('classifyStrictLocation bangalore office aliases', () => {
        const loc = classifyStrictLocation({
            campaign: bangalore,
            enrichment: {
                addresses: [{ raw: 'Whitefield Bengaluru 560066', city: 'Bengaluru', type: 'Branch Office' }],
            },
        });
        assert.equal(loc.locationMatch, 'match');
        assert.equal(loc.locationClassification, LOCATION_CLASSIFICATIONS.EXACT_CITY_BRANCH);
    });
});
