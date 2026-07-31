import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeCompanyName,
    normalizeEmail,
    normalizePhone,
    normalizeWebsite,
    normalizeGstin,
    normalizeDomainValue,
} from '../../src/services/dataExtractor/discovery/normalization/fieldNormalizers.js';
import {
    mergePreviewList,
    strongMatchKey,
} from '../../src/services/dataExtractor/discovery/mergeNormalize.service.js';
import { normalizeDiscoveryRecord } from '../../src/services/dataExtractor/discovery/normalization/normalizeRecord.service.js';
import { normalizeExtractedRecord } from '../../src/services/dataExtractor/companyNormalizer.service.js';

describe('Phase 3 phone normalization', () => {
    it('normalizes 10-digit Indian mobile', () => {
        const r = normalizePhone('9876543210');
        assert.equal(r.validationStatus, 'valid');
        assert.match(r.normalized, /^\+91 /);
        assert.equal(r.digits, '9876543210');
    });

    it('normalizes +91 prefixed numbers', () => {
        const r = normalizePhone('+91-98765-43210');
        assert.equal(r.validationStatus, 'valid');
        assert.equal(r.digits, '9876543210');
    });
});

describe('Phase 3 email normalization', () => {
    it('lowercases and validates', () => {
        const r = normalizeEmail('Sales@Acme.COM');
        assert.equal(r.normalized, 'sales@acme.com');
        assert.equal(r.validationStatus, 'valid');
        assert.equal(r.isGeneric, false);
    });

    it('flags generic email domains', () => {
        const r = normalizeEmail('owner@gmail.com');
        assert.equal(r.isGeneric, true);
        assert.equal(r.validationStatus, 'valid');
    });

    it('marks invalid emails', () => {
        const r = normalizeEmail('not-an-email');
        assert.equal(r.validationStatus, 'invalid');
    });
});

describe('Phase 3 domain / website normalization', () => {
    it('normalizes domain from website', () => {
        const w = normalizeWebsite('www.Acme.com/about');
        assert.equal(w.domain, 'acme.com');
        assert.equal(w.validationStatus, 'valid');
        const d = normalizeDomainValue('https://www.acme.com');
        assert.equal(d.normalized, 'acme.com');
    });
});

describe('Phase 3 GSTIN validation', () => {
    it('accepts structurally valid GSTIN', () => {
        // 22 + AAAAA + 0000 + A + 1 + Z + 5  (illustrative structural sample)
        const sample = '22AAAAA0000A1Z5';
        const r = normalizeGstin(sample);
        assert.equal(r.validationStatus, 'valid');
        assert.equal(r.normalized, sample);
    });

    it('rejects bad GSTIN format', () => {
        const r = normalizeGstin('INVALID');
        assert.equal(r.validationStatus, 'invalid');
    });
});

describe('Phase 3 company name normalization', () => {
    it('strips legal suffixes for display name but keeps legalName', () => {
        const r = normalizeCompanyName('Acme Lighting Pvt. Ltd.');
        assert.match(r.normalized.toLowerCase(), /acme lighting/);
        assert.match(r.legalName.toLowerCase(), /pvt/);
        assert.equal(r.validationStatus, 'valid');
    });
});

describe('Phase 3 source preservation', () => {
    it('keeps originalSnapshot and does not drop raw source fields', () => {
        const out = normalizeDiscoveryRecord({
            companyName: 'Acme Lighting Pvt Ltd',
            website: 'http://www.acme.com',
            email: 'Info@Acme.com',
            phone: '9876543210',
            city: 'Mumbai',
            sourceUrl: 'https://www.indiamart.com/acme/',
            rawExtractedData: { sourceProvider: 'indiamart', sourceProviders: ['indiamart'] },
        });
        assert.ok(out.fieldProvenance?.companyName?.raw);
        assert.ok(out.rawExtractedData?.originalSnapshot?.companyName);
        assert.equal(out.rawExtractedData.originalSnapshot.companyName, 'Acme Lighting Pvt Ltd');
        assert.equal(out.email, 'info@acme.com');
        assert.equal(out.normalizedDomain, 'acme.com');
        assert.ok(out.dataQualityScore >= 0 && out.dataQualityScore <= 100);
        assert.equal(out.dataQuality.method, 'RULE_BASED');
        assert.ok(Array.isArray(out.dataQuality.components));
    });
});

describe('Phase 3 conflict handling', () => {
    it('flags conflicting cities on merge', () => {
        const merged = mergePreviewList([
            {
                companyName: 'Acme',
                website: 'https://acme.com',
                city: 'Mumbai',
                rawExtractedData: { sourceProvider: 'brave', sourceProviders: ['brave'] },
            },
            {
                companyName: 'Acme Pvt Ltd',
                website: 'https://www.acme.com',
                city: 'Pune',
                email: 'sales@acme.com',
                rawExtractedData: { sourceProvider: 'indiamart', sourceProviders: ['indiamart'] },
            },
        ]);
        assert.equal(merged.length, 1);
        assert.ok(merged[0]._qualityConflicts?.city);
        assert.ok(merged[0].dataQualityFlags.includes('conflicting_city') || merged[0].dataQuality.flags.includes('conflicting_city'));
        assert.equal(merged[0].email, 'sales@acme.com');
    });
});

describe('Phase 3 quality score', () => {
    it('scores high-fit complete records higher than empty ones', () => {
        const good = normalizeExtractedRecord({
            companyName: 'Bright LED Works',
            website: 'https://brightled.example',
            email: 'sales@brightled.example',
            phone: '9123456780',
            address: 'Andheri East',
            city: 'Mumbai',
            stateProvince: 'Maharashtra',
            productCategories: ['LED Drivers'],
            confidenceScore: 70,
            rawExtractedData: { sourceProviders: ['brave', 'website_enrichment'] },
        });
        const bad = normalizeExtractedRecord({
            companyName: '',
            confidenceScore: 10,
            rawExtractedData: { sourceProviders: [] },
        });
        assert.ok(good.dataQualityScore > bad.dataQualityScore);
        assert.ok(good.dataQuality.components.length >= 5);
        assert.ok(bad.dataQualityFlags.includes('missing_company_name'));
    });
});

describe('Phase 3 tenant-safe pure functions', () => {
    it('normalizers do not require companyId (pure)', () => {
        const a = normalizeDiscoveryRecord({ companyName: 'A', website: 'https://a.com', companyId: '111' });
        const b = normalizeDiscoveryRecord({ companyName: 'B', website: 'https://b.com', companyId: '222' });
        assert.equal(a.normalizedDomain, 'a.com');
        assert.equal(b.normalizedDomain, 'b.com');
        assert.notEqual(a.companyId, b.companyId);
    });
});
