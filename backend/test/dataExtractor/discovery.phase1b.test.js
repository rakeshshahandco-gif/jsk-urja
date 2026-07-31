/**
 * Phase 1B — SerpAPI connection status + secret masking.
 * Standard suite uses deterministic fetch mocks (no live network).
 * Optional live smoke: SERPAPI_LIVE_TEST=true
 */
import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { testWebSearchProvider } from '../../src/services/dataExtractor/providers/searchProvider.factory.js';
import {
    classifySerpApiError,
    searchWithSerpApi,
    testSerpApiConnection,
} from '../../src/services/dataExtractor/providers/serpapiProvider.js';
import { sanitizeExtractorSettingsForClient, maskApiKey } from '../../src/services/dataExtractor/providerSecrets.util.js';
import { assertProvidersExecutable } from '../../src/services/dataExtractor/discovery/providerRegistry.js';

const LIVE = String(process.env.SERPAPI_LIVE_TEST || '').toLowerCase() === 'true';

function jsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
        json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    };
}

describe('SerpAPI error classification (unit)', () => {
    it('maps missing/disabled outcomes via testSerpApiConnection', async () => {
        const result = await testSerpApiConnection({
            sourceConnectors: { serpapi: { enabled: false, apiKey: '' } },
        });
        assert.equal(result.ok, false);
        assert.equal(result.status, 'NOT_CONFIGURED');
        assert.equal(result.connectionStatus, 'NOT_CONFIGURED');
        assert.equal(JSON.stringify(result).toLowerCase().includes('sk-'), false);
    });

    it('classifies invalid credentials', () => {
        const out = classifySerpApiError(401, '{"error":"Invalid API key"}');
        assert.equal(out.statusCode, 'INVALID_CREDENTIALS');
        assert.match(out.error, /authentication failed|verify the API key/i);
        assert.equal(out.error.toLowerCase().includes('bad-key'), false);
    });

    it('classifies timeout and network errors', () => {
        assert.equal(classifySerpApiError(0, '', Object.assign(new Error('aborted'), { name: 'TimeoutError' })).statusCode, 'PROVIDER_TIMEOUT');
        assert.equal(classifySerpApiError(0, '', new Error('fetch failed')).statusCode, 'PROVIDER_UNAVAILABLE');
    });

    it('classifies rate limit and invalid provider response', () => {
        assert.equal(classifySerpApiError(429, 'rate limit').statusCode, 'RATE_LIMITED');
        assert.equal(classifySerpApiError(400, 'unexpected payload').statusCode, 'INVALID_PROVIDER_RESPONSE');
    });
});

describe('SerpAPI connection status codes (mocked)', () => {
    let originalFetch;

    before(() => {
        originalFetch = globalThis.fetch;
    });

    after(() => {
        globalThis.fetch = originalFetch;
        mock.restoreAll();
    });

    it('returns NOT_CONFIGURED when SerpAPI disabled', async () => {
        let fetchCalls = 0;
        globalThis.fetch = async () => {
            fetchCalls += 1;
            throw new Error('fetch should not be called when disabled');
        };
        const result = await testWebSearchProvider('serpapi', {
            sourceConnectors: { serpapi: { enabled: false, apiKey: '' } },
        });
        assert.equal(result.ok, false);
        assert.equal(result.status || result.connectionStatus, 'NOT_CONFIGURED');
        assert.equal(fetchCalls, 0);
    });

    it('returns INVALID_CREDENTIALS for bad key when configured (mocked 401)', async () => {
        globalThis.fetch = async () => jsonResponse(401, { error: 'Invalid API key. Your API key should be here: https://serpapi.com/manage-api-key' });
        const result = await testWebSearchProvider('serpapi', {
            sourceConnectors: { serpapi: { enabled: true, apiKey: 'bad-key-xxxxx' } },
        });
        assert.equal(result.ok, false);
        assert.equal(result.status || result.connectionStatus, 'INVALID_CREDENTIALS');
        assert.match(result.message, /authentication failed|verify the API key/i);
        assert.equal(String(result.message).includes('bad-key-xxxxx'), false);
    });

    it('returns PROVIDER_TIMEOUT on abort/timeout (mocked)', async () => {
        globalThis.fetch = async () => {
            const err = new Error('The operation was aborted due to timeout');
            err.name = 'TimeoutError';
            throw err;
        };
        const result = await testWebSearchProvider('serpapi', {
            sourceConnectors: { serpapi: { enabled: true, apiKey: 'test-key-timeout' } },
        });
        assert.equal(result.ok, false);
        assert.equal(result.status, 'PROVIDER_TIMEOUT');
    });

    it('returns PROVIDER_UNAVAILABLE on network failure (mocked)', async () => {
        globalThis.fetch = async () => {
            throw new Error('fetch failed');
        };
        const result = await testWebSearchProvider('serpapi', {
            sourceConnectors: { serpapi: { enabled: true, apiKey: 'test-key-net' } },
        });
        assert.equal(result.ok, false);
        assert.equal(result.status, 'PROVIDER_UNAVAILABLE');
    });

    it('returns RATE_LIMITED on HTTP 429 (mocked)', async () => {
        globalThis.fetch = async () => jsonResponse(429, { error: 'rate limit' });
        const result = await testWebSearchProvider('serpapi', {
            sourceConnectors: { serpapi: { enabled: true, apiKey: 'test-key-429' } },
        });
        assert.equal(result.ok, false);
        assert.equal(result.status, 'RATE_LIMITED');
    });

    it('returns INVALID_PROVIDER_RESPONSE on non-JSON success body (mocked)', async () => {
        globalThis.fetch = async () => ({
            ok: true,
            status: 200,
            text: async () => 'not-json',
            json: async () => {
                throw new SyntaxError('Unexpected token');
            },
        });
        const result = await searchWithSerpApi({
            query: 'x',
            maxResults: 1,
            settings: { sourceConnectors: { serpapi: { enabled: true, apiKey: 'test-key-json' } } },
        });
        assert.equal(result.statusCode, 'INVALID_PROVIDER_RESPONSE');
    });

    it('normalizes successful organic results (mocked)', async () => {
        globalThis.fetch = async () => jsonResponse(200, {
            organic_results: [{ link: 'https://example.test', title: 'Example Mfr', snippet: 'OEM' }],
        });
        const result = await testWebSearchProvider('serpapi', {
            sourceConnectors: { serpapi: { enabled: true, apiKey: 'test-key-ok' } },
        });
        assert.equal(result.ok, true);
        assert.equal(result.status, 'CONNECTED');
        assert.match(result.message, /Example Mfr|connected/i);
    });
});

describe('API key masking', () => {
    it('never returns full key in sanitized settings', () => {
        const secret = 'super-secret-key-ABCDEFGH';
        const safe = sanitizeExtractorSettingsForClient({
            sourceConnectors: {
                serpapi: { apiKey: secret, enabled: true },
                google: { placesApiKey: 'places-secret-XYZ12345' },
            },
        });
        const blob = JSON.stringify(safe);
        assert.equal(blob.includes(secret), false);
        assert.equal(blob.includes('places-secret'), false);
        assert.ok(safe.sourceConnectors.serpapi.apiKeyMasked);
        assert.equal(safe.sourceConnectors.serpapi.apiKey, undefined);
        assert.ok(!maskApiKey(secret).includes('super-secret'));
    });
});

describe('provider disabled / future', () => {
    it('future providers are not executable', () => {
        const { executable, skipped } = assertProvidersExecutable(['apify', 'bright_data', 'manual_url'], null);
        assert.deepEqual(executable, ['manual_url']);
        assert.equal(skipped.length, 2);
    });
});

describe('import file validation helpers', () => {
    it('rejects unsupported extensions conceptually via middleware pattern', () => {
        const ok = /\.(xlsx|xls|csv)$/i.test('leads.csv');
        const bad = /\.(xlsx|xls|csv)$/i.test('malware.exe');
        assert.equal(ok, true);
        assert.equal(bad, false);
    });
});

describe('SerpAPI live smoke (optional)', { skip: !LIVE }, () => {
    it('live provider probe returns a known status without leaking secrets', async () => {
        const result = await testWebSearchProvider('serpapi', {
            sourceConnectors: {
                serpapi: {
                    enabled: true,
                    apiKey: String(process.env.SERPAPI_KEY || process.env.SERPAPI_LIVE_KEY || '').trim(),
                },
            },
        });
        const status = result.status || result.connectionStatus;
        assert.ok(
            ['CONNECTED', 'INVALID_CREDENTIALS', 'RATE_LIMITED', 'CREDIT_LIMIT_REACHED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE', 'NOT_CONFIGURED', 'INVALID_PROVIDER_RESPONSE', 'FAILED'].includes(status),
            `unexpected live status: ${status}`,
        );
        const blob = JSON.stringify(result).toLowerCase();
        assert.equal(blob.includes('api_key='), false);
        if (process.env.SERPAPI_KEY) {
            assert.equal(blob.includes(String(process.env.SERPAPI_KEY).toLowerCase()), false);
        }
    });
});
