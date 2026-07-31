import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicHttpUrl } from '../../src/services/dataExtractor/discovery/ssrfGuard.js';
import {
    normalizeFacebookPageUrl,
    normalizeInstagramProfileUrl,
    validateImportUrls,
} from '../../src/services/dataExtractor/discovery/urlValidation.js';
import {
    assertProvidersExecutable,
    resolveProviderId,
    listDiscoveryProviders,
} from '../../src/services/dataExtractor/discovery/providerRegistry.js';
import {
    mergePreviewList,
    normalizeDomain,
    strongMatchKey,
} from '../../src/services/dataExtractor/discovery/mergeNormalize.service.js';
import { maskApiKey, sanitizeExtractorSettingsForClient } from '../../src/services/dataExtractor/providerSecrets.util.js';
import { JOB_STATUSES, SOURCE_TASK_STATUSES } from '../../src/services/dataExtractor/discovery/providerTypes.js';

describe('discovery SSRF guard', () => {
    it('blocks localhost and private URLs', () => {
        assert.throws(() => assertPublicHttpUrl('http://127.0.0.1/admin'), /Private|local/i);
        assert.throws(() => assertPublicHttpUrl('http://localhost/x'), /Private|local/i);
        assert.throws(() => assertPublicHttpUrl('http://192.168.1.1/'), /Private|local/i);
        assert.throws(() => assertPublicHttpUrl('file:///etc/passwd'), /http/i);
        assert.throws(() => assertPublicHttpUrl('javascript:alert(1)'), /http/i);
        assert.throws(() => assertPublicHttpUrl('https://user:pass@example.com/'), /credential/i);
    });

    it('allows public https URLs', () => {
        const u = assertPublicHttpUrl('https://www.example.com/contact');
        assert.match(u, /^https:\/\//);
    });
});

describe('facebook/instagram URL normalization', () => {
    it('normalizes public Facebook page URLs', () => {
        const u = normalizeFacebookPageUrl('https://facebook.com/SomeBusinessPage/');
        assert.equal(u, 'https://www.facebook.com/SomeBusinessPage');
    });

    it('rejects Facebook groups', () => {
        assert.throws(() => normalizeFacebookPageUrl('https://www.facebook.com/groups/123'), /business Page/i);
    });

    it('normalizes Instagram profile URLs', () => {
        const u = normalizeInstagramProfileUrl('https://www.instagram.com/acme.home.auto/');
        assert.equal(u, 'https://www.instagram.com/acme.home.auto/');
    });

    it('rejects Instagram reels', () => {
        assert.throws(() => normalizeInstagramProfileUrl('https://www.instagram.com/reel/xyz'), /professional/i);
    });
});

describe('manual URL validation', () => {
    it('accepts mixed public URLs and rejects bad ones', () => {
        const { accepted, rejected } = validateImportUrls([
            'https://example.com',
            'https://www.facebook.com/AcmeBiz',
            'https://www.instagram.com/acmebiz/',
            'http://127.0.0.1/secret',
            'not-a-url',
        ]);
        assert.equal(accepted.length, 3);
        assert.ok(rejected.length >= 2);
    });
});

describe('provider registry', () => {
    it('aliases frontend source ids', () => {
        assert.equal(resolveProviderId('company_websites'), 'website_enrichment');
        assert.equal(resolveProviderId('excel_csv'), 'excel_import');
    });

    it('marks future providers as not executable', () => {
        const list = listDiscoveryProviders(null);
        const apify = list.find((p) => p.providerId === 'apify');
        assert.ok(apify);
        assert.equal(apify.comingSoon, true);
        assert.equal(apify.executable, false);
        const { executable, skipped } = assertProvidersExecutable(['apify', 'manual_url'], null);
        assert.deepEqual(executable, ['manual_url']);
        assert.ok(skipped.some((s) => s.providerId === 'apify'));
    });

    it('skips disabled SerpAPI when not configured', () => {
        const { executable, skipped } = assertProvidersExecutable(['serpapi'], { sourceConnectors: {} });
        assert.equal(executable.length, 0);
        assert.ok(skipped[0].reason.includes('Not configured') || skipped[0].reason.includes('Disabled'));
    });
});

describe('merge / normalize', () => {
    it('merges by strong domain key', () => {
        const a = { companyName: 'Acme', website: 'https://www.acme.com', email: '', phone: '', rawExtractedData: { sourceProvider: 'serpapi', sourceProviders: ['serpapi'] } };
        const b = { companyName: 'Acme Pvt', website: 'https://acme.com/about', email: 'sales@acme.com', phone: '9876543210', rawExtractedData: { sourceProvider: 'website_enrichment', sourceProviders: ['website_enrichment'] } };
        a.normalizedDomain = normalizeDomain(a.website);
        b.normalizedDomain = normalizeDomain(b.website);
        assert.equal(strongMatchKey(a), strongMatchKey(b));
        const merged = mergePreviewList([a, b]);
        assert.equal(merged.length, 1);
        assert.equal(merged[0].email, 'sales@acme.com');
        assert.ok(merged[0].rawExtractedData.sourceProviders.includes('serpapi'));
        assert.ok(merged[0].rawExtractedData.sourceProviders.includes('website_enrichment'));
    });
});

describe('API key masking', () => {
    it('never returns full key', () => {
        const masked = maskApiKey('supersecretapikey99');
        assert.ok(!masked.includes('supersecret'));
        assert.match(masked, /99$/);
        const safe = sanitizeExtractorSettingsForClient({
            sourceConnectors: {
                serpapi: { apiKey: 'supersecretapikey99', enabled: true },
                google: { placesApiKey: 'placessecretkey1234' },
            },
        });
        assert.equal(safe.sourceConnectors.serpapi.apiKey, undefined);
        assert.ok(safe.sourceConnectors.serpapi.apiKeyMasked);
        assert.equal(safe.sourceConnectors.google.placesApiKey, undefined);
    });
});

describe('job status enums', () => {
    it('includes required job and task statuses', () => {
        for (const s of ['DRAFT', 'QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'COMPLETED_WITH_WARNINGS', 'STOPPED', 'FAILED']) {
            assert.ok(JOB_STATUSES.includes(s), s);
        }
        for (const s of ['PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'EXHAUSTED', 'FAILED', 'DISABLED', 'NOT_CONFIGURED']) {
            assert.ok(SOURCE_TASK_STATUSES.includes(s), s);
        }
    });
});
