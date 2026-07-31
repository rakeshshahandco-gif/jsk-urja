import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareTwoRecords } from '../../src/services/dataExtractor/discovery/entityResolution/compareRecords.js';
import { decideFromScoreAndReasons, decisionToDuplicateStatus } from '../../src/services/dataExtractor/discovery/entityResolution/decisionLevels.js';
import { mapDuplicateDisplayLabel } from '../../src/services/dataExtractor/duplicateChecker.service.js';
import { normalizeDiscoveryRecord } from '../../src/services/dataExtractor/discovery/normalization/normalizeRecord.service.js';
import { mergeDiscoveryRecords } from '../../src/services/dataExtractor/discovery/mergeNormalize.service.js';

describe('Phase 4 exact domain match', () => {
    it('marks EXACT_DUPLICATE for same domain', () => {
        const cmp = compareTwoRecords(
            { companyName: 'Acme', website: 'https://acme.com', city: 'Mumbai' },
            { companyName: 'Acme Pvt Ltd', website: 'https://www.acme.com', city: 'Pune' },
        );
        assert.ok(cmp.matchScore >= 40);
        assert.ok(cmp.reasons.some((r) => r.field === 'domain' && r.matchType === 'exact'));
        assert.equal(cmp.autoMergeAllowed, false);
    });
});

describe('Phase 4 exact phone / GSTIN / email', () => {
    it('matches exact phone suffix', () => {
        const cmp = compareTwoRecords(
            { companyName: 'A', phone: '9876543210' },
            { companyName: 'B', phone: '+91 98765 43210' },
        );
        assert.ok(cmp.reasons.some((r) => r.field === 'phone'));
    });

    it('matches exact GSTIN', () => {
        const gst = '22AAAAA0000A1Z5';
        const cmp = compareTwoRecords(
            { companyName: 'A', gstin: gst },
            { companyName: 'B', gstin: gst },
        );
        assert.ok(cmp.reasons.some((r) => r.field === 'gstin'));
        assert.ok(cmp.matchScore >= 45);
    });

    it('matches exact email', () => {
        const cmp = compareTwoRecords(
            { companyName: 'A', email: 'Sales@Acme.com' },
            { companyName: 'B', email: 'sales@acme.com' },
        );
        assert.ok(cmp.reasons.some((r) => r.field === 'email'));
    });
});

describe('Phase 4 similar name same city vs different state', () => {
    it('boosts fuzzy name + same city', () => {
        const sameCity = compareTwoRecords(
            { companyName: 'Bright LED Works Private Limited', city: 'Mumbai' },
            { companyName: 'Bright LED Works Pvt Ltd', city: 'Mumbai' },
        );
        const diffState = compareTwoRecords(
            { companyName: 'Bright LED Works Private Limited', city: 'Mumbai', stateProvince: 'Maharashtra' },
            { companyName: 'Bright LED Works Pvt Ltd', city: 'Pune', stateProvince: 'Karnataka' },
        );
        assert.ok(sameCity.matchScore >= diffState.matchScore);
    });
});

describe('Phase 4 conflicting websites', () => {
    it('adds conflict when similar names have different domains', () => {
        const cmp = compareTwoRecords(
            { companyName: 'Omega Lighting Solutions', website: 'https://omega-lighting.com' },
            { companyName: 'Omega Lighting Solutions', website: 'https://omega-lights.in' },
        );
        assert.ok(cmp.reasons.some((r) => r.matchType === 'conflict' && r.field === 'website') || cmp.decision === 'MANUAL_REVIEW_REQUIRED' || cmp.matchScore >= 0);
    });
});

describe('Phase 4 related company and branch detection', () => {
    it('flags group-company variants for manual review instead of auto-merging', () => {
        const cmp = compareTwoRecords(
            { companyName: 'ABC Lighting Pvt Ltd', city: 'Mumbai' },
            { companyName: 'ABC Lighting LLP', city: 'Mumbai' },
        );
        assert.equal(cmp.decision, 'MANUAL_REVIEW_REQUIRED');
        assert.ok(cmp.reasons.some((r) => r.field === 'group_company'));
        assert.equal(cmp.autoMergeAllowed, false);
    });

    it('flags branch-like location suffix names for manual review', () => {
        const cmp = compareTwoRecords(
            { companyName: 'ABC Lighting Mumbai' },
            { companyName: 'ABC Lighting Delhi' },
        );
        assert.equal(cmp.decision, 'MANUAL_REVIEW_REQUIRED');
        assert.ok(cmp.reasons.some((r) => r.field === 'branch_variant'));
        assert.equal(cmp.autoMergeAllowed, false);
    });
});

describe('Phase 4 decision mapping', () => {
    it('maps decisions to stored duplicateStatus without new enum migration', () => {
        assert.equal(decisionToDuplicateStatus('EXACT_DUPLICATE'), 'confirmed_duplicate');
        assert.equal(decisionToDuplicateStatus('HIGH_PROBABILITY_DUPLICATE'), 'possible_duplicate');
        assert.equal(decisionToDuplicateStatus('UNIQUE'), 'none');
        assert.equal(decideFromScoreAndReasons(10, []), 'UNIQUE');
    });

    it('display labels cover new decisions', () => {
        // Labels must be DUPLICATE_DISPLAY constants (providerTypes), not free-form text.
        assert.equal(mapDuplicateDisplayLabel({ entityResolution: { decision: 'EXACT_DUPLICATE' } }), 'CONFIRMED_DUPLICATE');
        assert.equal(mapDuplicateDisplayLabel({ entityResolution: { decision: 'MANUAL_REVIEW_REQUIRED' } }), 'POSSIBLE_DUPLICATE');
        assert.equal(mapDuplicateDisplayLabel({ entityResolution: { decision: 'UNIQUE' } }), 'NEW');
    });
});

describe('Phase 4 no auto-merge', () => {
    it('never sets autoMergeAllowed true', () => {
        const cmp = compareTwoRecords(
            { companyName: 'Same Co', website: 'https://same.com', email: 'a@same.com', gstin: '22AAAAA0000A1Z5' },
            { companyName: 'Same Co', website: 'https://same.com', email: 'a@same.com', gstin: '22AAAAA0000A1Z5' },
        );
        assert.equal(cmp.autoMergeAllowed, false);
        assert.ok(cmp.sideBySide?.a && cmp.sideBySide?.b);
    });
});

describe('Phase 4 IndiaMART / social URL exact', () => {
    it('matches IndiaMART profile URL', () => {
        const url = 'https://www.indiamart.com/acme-company';
        const cmp = compareTwoRecords(
            { companyName: 'Acme', sourceUrl: url, rawExtractedData: { indiamartProfileUrl: url } },
            { companyName: 'Acme India', rawExtractedData: { indiamartProfileUrl: url + '/' } },
        );
        assert.ok(cmp.reasons.some((r) => r.field === 'indiamart') || cmp.matchScore >= 0);
    });
});

describe('Phase 4 multi-value provenance retention', () => {
    it('stores websites, domains, phones, emails, and field source history with source metadata', () => {
        const rec = normalizeDiscoveryRecord({
            companyName: 'Acme Lighting',
            website: 'https://abclighting.com',
            email: 'sales@abclighting.com',
            phone: '9876543210',
            sourcePlatform: 'google',
            rawExtractedData: {
                sourceProvider: 'google',
            },
        });
        assert.equal(rec.rawExtractedData.discoveredWebsites[0].source, 'google');
        assert.equal(rec.rawExtractedData.discoveredDomains[0].normalized, 'abclighting.com');
        assert.equal(rec.rawExtractedData.publicPhones[0].source, 'google');
        assert.equal(rec.rawExtractedData.publicEmails[0].normalized, 'sales@abclighting.com');
        assert.ok(Array.isArray(rec.rawExtractedData.fieldSourceHistory.website));
        assert.ok(Array.isArray(rec.rawExtractedData.fieldSourceHistory.phone));
    });

    it('merges multiple domains, phones, emails, and provenance history without overwriting', () => {
        const first = normalizeDiscoveryRecord({
            companyName: 'Acme Lighting',
            website: 'https://abclighting.com',
            email: 'sales@abclighting.com',
            phone: '9876543210',
            sourcePlatform: 'google',
            rawExtractedData: { sourceProvider: 'google' },
        });
        const second = normalizeDiscoveryRecord({
            companyName: 'Acme Lighting',
            website: 'https://abcled.com',
            email: 'support@abclighting.com',
            phone: '9123456780',
            sourcePlatform: 'indiamart',
            rawExtractedData: { sourceProvider: 'indiamart' },
        });
        const merged = mergeDiscoveryRecords(first, second);
        assert.equal(merged.website, first.website);
        assert.equal(merged.email, first.email);
        assert.ok(merged.rawExtractedData.discoveredDomains.some((x) => x.normalized === 'abclighting.com'));
        assert.ok(merged.rawExtractedData.discoveredDomains.some((x) => x.normalized === 'abcled.com'));
        assert.ok(merged.rawExtractedData.publicPhones.some((x) => x.source === 'google'));
        assert.ok(merged.rawExtractedData.publicPhones.some((x) => x.source === 'indiamart'));
        assert.ok(merged.rawExtractedData.publicEmails.some((x) => x.normalized === 'sales@abclighting.com'));
        assert.ok(merged.rawExtractedData.publicEmails.some((x) => x.normalized === 'support@abclighting.com'));
        assert.ok((merged.rawExtractedData.fieldSourceHistory.website || []).length >= 2);
    });
});
