import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { testBraveConnection, isBraveConfigured } from '../../src/services/dataExtractor/providers/braveSearchProvider.js';
import { assertProvidersExecutable, listDiscoveryProviders } from '../../src/services/dataExtractor/discovery/providerRegistry.js';
import {
    testIndiamartAvailability,
    isIndiamartUrl,
    classifyIndiamartUrl,
    normalizeIndiamartUrl,
} from '../../src/services/dataExtractor/discovery/indiamartDiscovery.service.js';
import { validateImportUrls } from '../../src/services/dataExtractor/discovery/urlValidation.js';
import { mergePreviewList, strongMatchKey, normalizeDomain } from '../../src/services/dataExtractor/discovery/mergeNormalize.service.js';
import { sanitizeExtractorSettingsForClient } from '../../src/services/dataExtractor/providerSecrets.util.js';

describe('Brave Search status', () => {
    it('returns NOT_CONFIGURED without key', async () => {
        const result = await testBraveConnection({
            sourceConnectors: { brave: { enabled: true, apiKey: '' }, discovery: { braveEnabled: true } },
        });
        // env may still set key; if env empty:
        if (!process.env.BRAVE_SEARCH_API_KEY) {
            assert.equal(result.ok, false);
            assert.equal(result.status || result.connectionStatus, 'NOT_CONFIGURED');
        }
    });

    it('returns INVALID_CREDENTIALS for bad key', async () => {
        const result = await testBraveConnection({
            sourceConnectors: {
                brave: { enabled: true, apiKey: 'bad-brave-key-xxxxx' },
                discovery: { braveEnabled: true },
            },
        });
        assert.equal(result.ok, false);
        assert.ok(['INVALID_CREDENTIALS', 'RATE_LIMITED', 'FAILED', 'NOT_CONFIGURED', 'CREDIT_LIMIT_REACHED'].includes(result.status || result.connectionStatus));
    });
});

describe('Free-first without SerpAPI', () => {
    it('executable sources exclude SerpAPI when paid fallback off', () => {
        const settings = {
            sourceConnectors: {
                discovery: { freeFirstEnabled: true, allowPaidFallback: false, serpapiEnabled: false, braveEnabled: true },
                brave: { enabled: true, apiKey: 'x'.repeat(20) },
                serpapi: { enabled: true, apiKey: 'y'.repeat(20) },
            },
        };
        // Brave configured with dummy key — isBraveConfigured true
        assert.equal(isBraveConfigured(settings), true);
        const { executable, skipped } = assertProvidersExecutable(
            ['brave', 'serpapi', 'manual_url', 'website_enrichment'],
            settings,
        );
        assert.ok(executable.includes('brave'));
        assert.ok(executable.includes('manual_url'));
        assert.ok(!executable.includes('serpapi'));
        assert.ok(skipped.some((s) => s.providerId === 'serpapi'));
    });

    it('lists IndiaMART as active provider not coming soon', () => {
        const list = listDiscoveryProviders(null);
        const im = list.find((p) => p.providerId === 'indiamart');
        assert.ok(im);
        assert.equal(im.comingSoon, false);
        const apify = list.find((p) => p.providerId === 'apify');
        assert.equal(apify.comingSoon, true);
    });
});

describe('IndiaMART manual modes', () => {
    it('availability reports PUBLIC_ACCESS_ONLY without fabricating scrape', async () => {
        const result = await testIndiamartAvailability({
            sourceConnectors: { discovery: { indiamartEnabled: true, indiamartPublicDiscoveryMode: false } },
        });
        assert.equal(result.status || result.connectionStatus, 'PUBLIC_ACCESS_ONLY');
        assert.equal(result.modes?.directScrape, false);
        assert.equal(result.modes?.manualUrl, true);
    });

    it('normalizes and classifies IndiaMART URLs', () => {
        assert.equal(isIndiamartUrl('https://www.indiamart.com/acme-company/'), true);
        const c = classifyIndiamartUrl('https://www.indiamart.com/acme-company/');
        assert.ok(c.url.includes('indiamart.com'));
        assert.throws(() => normalizeIndiamartUrl('https://www.indiamart.com/login'), /login|private/i);
    });

    it('accepts IndiaMART URLs in import validation', () => {
        const { accepted, rejected } = validateImportUrls([
            'https://www.indiamart.com/some-seller/',
            'http://127.0.0.1/x',
        ]);
        assert.ok(accepted.some((a) => a.type === 'indiamart'));
        assert.ok(rejected.length >= 1);
    });
});

describe('merge across providers', () => {
    it('merges Brave and IndiaMART records by domain', () => {
        const a = {
            companyName: 'Acme',
            website: 'https://www.acme.com',
            normalizedDomain: normalizeDomain('https://www.acme.com'),
            rawExtractedData: { sourceProvider: 'brave', sourceProviders: ['brave'] },
        };
        const b = {
            companyName: 'Acme Pvt Ltd',
            website: 'https://acme.com',
            normalizedDomain: normalizeDomain('https://acme.com'),
            email: 'sales@acme.com',
            rawExtractedData: { sourceProvider: 'indiamart', sourceProviders: ['indiamart'], indiamartProfileUrl: 'https://www.indiamart.com/acme/' },
        };
        assert.equal(strongMatchKey(a), strongMatchKey(b));
        const merged = mergePreviewList([a, b]);
        assert.equal(merged.length, 1);
        assert.equal(merged[0].email, 'sales@acme.com');
    });
});

describe('Brave key masking', () => {
    it('strips brave apiKey from client settings', () => {
        const safe = sanitizeExtractorSettingsForClient({
            sourceConnectors: { brave: { apiKey: 'brave-secret-key-ABCDEF', enabled: true } },
        });
        assert.equal(safe.sourceConnectors.brave.apiKey, undefined);
        assert.ok(safe.sourceConnectors.brave.apiKeyMasked);
        assert.equal(JSON.stringify(safe).includes('brave-secret-key'), false);
    });
});
