/**
 * Focused compatibility tests for sanitizeSettingsResponse export.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sanitizeSettingsResponse } from '../../src/services/dataExtractor/extractor.service.js';

describe('sanitizeSettingsResponse contract', () => {
    it('1. null input returns approved safe empty response', () => {
        const safe = sanitizeSettingsResponse(null);
        assert.equal(safe.moduleEnabled, false);
        assert.deepEqual(safe.sourceConnectors, {});
    });

    it('2. undefined input does not throw', () => {
        const safe = sanitizeSettingsResponse(undefined);
        assert.equal(safe.moduleEnabled, false);
        assert.deepEqual(safe.sourceConnectors, {});
    });

    it('3. plain safe settings fields are preserved', () => {
        const safe = sanitizeSettingsResponse({
            moduleEnabled: true,
            maxUrlsPerJob: 25,
            aiEnabled: false,
            sourceConnectors: {
                discovery: {
                    freeFirstEnabled: true,
                    browserAssistedEnabled: true,
                    defaultBatchSize: 10,
                },
                controlledTestMode: { enabled: false },
            },
        });
        assert.equal(safe.moduleEnabled, true);
        assert.equal(safe.maxUrlsPerJob, 25);
        assert.equal(safe.sourceConnectors.discovery.freeFirstEnabled, true);
        assert.equal(safe.sourceConnectors.discovery.browserAssistedEnabled, true);
        assert.equal(safe.sourceConnectors.discovery.defaultBatchSize, 10);
        assert.equal(safe.sourceConnectors.controlledTestMode.enabled, false);
    });

    it('4. original input is not mutated', () => {
        const input = {
            moduleEnabled: true,
            sourceConnectors: {
                brave: { apiKey: 'brave-secret-KEY-123456', enabled: true, perJobLimit: 50 },
                serpapi: { apiKey: 'serp-secret-KEY-ABCDEF', enabled: true },
                google: { placesApiKey: 'places-secret-XYZ99999', cseApiKey: 'cse-secret-AAA11111', cseCx: 'cx-id' },
            },
        };
        const before = JSON.stringify(input);
        sanitizeSettingsResponse(input);
        assert.equal(JSON.stringify(input), before);
        assert.equal(input.sourceConnectors.brave.apiKey, 'brave-secret-KEY-123456');
    });

    it('5. mongoose-like toObject input is handled', () => {
        const doc = {
            moduleEnabled: true,
            sourceConnectors: {
                discovery: { placesEnabled: false },
                brave: { apiKey: 'doc-brave-secret-9999', enabled: true },
            },
            toObject() {
                return {
                    moduleEnabled: true,
                    sourceConnectors: {
                        discovery: { placesEnabled: false },
                        brave: { apiKey: 'doc-brave-secret-9999', enabled: true },
                    },
                };
            },
        };
        const safe = sanitizeSettingsResponse(doc);
        assert.equal(safe.moduleEnabled, true);
        assert.equal(safe.sourceConnectors.discovery.placesEnabled, false);
        assert.equal(safe.sourceConnectors.brave.apiKey, undefined);
        assert.ok(safe.sourceConnectors.brave.apiKeyMasked);
        assert.equal(JSON.stringify(safe).includes('doc-brave-secret'), false);
    });

    it('6. API keys are omitted', () => {
        const secret = 'super-secret-key-ABCDEFGH';
        const safe = sanitizeSettingsResponse({
            sourceConnectors: {
                serpapi: { apiKey: secret, enabled: true },
                brave: { apiKey: 'brave-' + secret, enabled: true },
                google: { cseApiKey: 'cse-' + secret, placesApiKey: 'places-' + secret, cseCx: 'my-cx' },
            },
        });
        assert.equal(safe.sourceConnectors.serpapi.apiKey, undefined);
        assert.equal(safe.sourceConnectors.brave.apiKey, undefined);
        assert.equal(safe.sourceConnectors.google.cseApiKey, undefined);
        assert.equal(safe.sourceConnectors.google.placesApiKey, undefined);
        assert.equal(safe.sourceConnectors.google.cseCx, 'my-cx');
    });

    it('7. tokens are omitted', () => {
        const safe = sanitizeSettingsResponse({
            sourceConnectors: {
                justdial: { webhookToken: 'jd-webhook-token-XYZ', enabled: true },
                discovery: { accessToken: 'access-tok-1', refreshToken: 'refresh-tok-2', browserAssistedEnabled: true },
            },
        });
        assert.equal(safe.sourceConnectors.justdial.webhookToken, undefined);
        assert.equal(safe.sourceConnectors.discovery.accessToken, undefined);
        assert.equal(safe.sourceConnectors.discovery.refreshToken, undefined);
        assert.equal(safe.sourceConnectors.discovery.browserAssistedEnabled, true);
        assert.equal(safe.sourceConnectors.justdial.enabled, true);
    });

    it('8. passwords and secrets are omitted', () => {
        const safe = sanitizeSettingsResponse({
            sourceConnectors: {
                discovery: {
                    password: 'p@ss',
                    clientSecret: 'client-secret-val',
                    privateKey: 'PRIVATE',
                    pairingSecret: 'pair',
                    encryptionKey: 'enc',
                    freeFirstEnabled: true,
                },
            },
        });
        const d = safe.sourceConnectors.discovery;
        assert.equal(d.password, undefined);
        assert.equal(d.clientSecret, undefined);
        assert.equal(d.privateKey, undefined);
        assert.equal(d.pairingSecret, undefined);
        assert.equal(d.encryptionKey, undefined);
        assert.equal(d.freeFirstEnabled, true);
    });

    it('9. nested credentials / headers are omitted', () => {
        const safe = sanitizeSettingsResponse({
            sourceConnectors: {
                google: {
                    cseCx: 'cx',
                    credentials: { apiKey: 'nested-key-should-go' },
                    headers: { Authorization: 'Bearer nested-bearer' },
                    auth: { password: 'nested-pass' },
                },
            },
        });
        assert.equal(safe.sourceConnectors.google.cseCx, 'cx');
        assert.equal(safe.sourceConnectors.google.credentials, undefined);
        assert.equal(safe.sourceConnectors.google.headers, undefined);
        assert.equal(safe.sourceConnectors.google.auth, undefined);
        assert.equal(JSON.stringify(safe).includes('nested-key'), false);
        assert.equal(JSON.stringify(safe).includes('Bearer'), false);
    });

    it('10. unknown sensitive-looking fields are not leaked', () => {
        const safe = sanitizeSettingsResponse({
            moduleEnabled: true,
            mongoUri: 'mongodb://secret',
            databaseUri: 'postgres://secret',
            sourceConnectors: {
                discovery: { sessionToken: 'sess', cookie: 'c=1', authorization: 'Bearer x' },
                unknownProvider: { apiKey: 'should-not-appear-at-all' },
            },
        });
        assert.equal(safe.mongoUri, undefined);
        assert.equal(safe.databaseUri, undefined);
        assert.equal(safe.sourceConnectors.unknownProvider, undefined);
        const blob = JSON.stringify(safe);
        assert.equal(blob.includes('should-not-appear'), false);
        assert.equal(blob.includes('mongodb://'), false);
        assert.equal(blob.includes('Bearer x'), false);
        assert.equal(blob.includes('sess'), false);
    });

    it('11. approved non-secret provider options remain', () => {
        const safe = sanitizeSettingsResponse({
            sourceConnectors: {
                brave: { enabled: true, monthlySafetyLimit: 1000, perJobLimit: 100, apiKey: 'k' },
                serpapi: { enabled: false, apiKey: 'k2' },
                discovery: { serpapiEnabled: false, placesEnabled: true, allowPaidFallback: true },
            },
        });
        assert.equal(safe.sourceConnectors.brave.enabled, true);
        assert.equal(safe.sourceConnectors.brave.monthlySafetyLimit, 1000);
        assert.equal(safe.sourceConnectors.brave.perJobLimit, 100);
        assert.equal(safe.sourceConnectors.serpapi.enabled, false);
        assert.equal(safe.sourceConnectors.discovery.placesEnabled, true);
        assert.equal(safe.sourceConnectors.discovery.allowPaidFallback, true);
    });

    it('12-14. existing masked indicators: empty secret omits mask; present secret yields mask only', () => {
        const empty = sanitizeSettingsResponse({
            sourceConnectors: { brave: { apiKey: '', enabled: true }, serpapi: { enabled: true } },
        });
        assert.equal(empty.sourceConnectors.brave.apiKeyMasked, undefined);
        assert.equal(empty.sourceConnectors.brave.apiKey, undefined);

        const secret = 'present-secret-KEY-ZZZZ';
        const present = sanitizeSettingsResponse({
            sourceConnectors: {
                brave: { apiKey: secret, enabled: true },
                serpapi: { apiKey: secret, enabled: true },
                google: { placesApiKey: secret, cseApiKey: secret },
            },
        });
        assert.ok(present.sourceConnectors.brave.apiKeyMasked);
        assert.ok(present.sourceConnectors.serpapi.apiKeyMasked);
        assert.ok(present.sourceConnectors.google.placesApiKeyMasked);
        assert.ok(present.sourceConnectors.google.cseApiKeyMasked);
        assert.equal(present.sourceConnectors.brave.apiKey, undefined);
    });

    it('15. secret value never appears in serialized output', () => {
        const secret = 'NEVER_LEAK_THIS_VALUE_999';
        const safe = sanitizeSettingsResponse({
            sourceConnectors: {
                brave: { apiKey: secret },
                serpapi: { apiKey: secret },
                google: { placesApiKey: secret, cseApiKey: secret },
                justdial: { webhookToken: secret },
            },
        });
        assert.equal(JSON.stringify(safe).includes(secret), false);
        assert.equal(JSON.stringify(safe).includes('NEVER_LEAK'), false);
    });

    it('16. prototype-pollution-shaped properties are ignored', () => {
        const polluted = JSON.parse('{"moduleEnabled":true,"__proto__":{"polluted":true},"sourceConnectors":{"discovery":{"browserAssistedEnabled":true,"__proto__":{"x":1},"constructor":{"y":1}}}}');
        const safe = sanitizeSettingsResponse(polluted);
        assert.equal(Object.prototype.hasOwnProperty.call(safe, '__proto__'), false);
        assert.equal(safe.sourceConnectors.discovery.browserAssistedEnabled, true);
        assert.equal(Object.prototype.polluted, undefined);
    });

    it('17. Discovery settings response shape remains compatible', () => {
        const safe = sanitizeSettingsResponse({
            moduleEnabled: true,
            sourceConnectors: {
                discovery: { freeFirstEnabled: true, browserAssistedEnabled: false },
                brave: { apiKey: 'brave-key-ABCDEFGH', enabled: true, perJobLimit: 40 },
                serpapi: { apiKey: 'serp-key-ABCDEFGH', enabled: false },
                google: { placesApiKey: 'places-key-ABCDEFGH', cseCx: 'cx' },
                controlledTestMode: { enabled: true, maxJobs: 3 },
            },
        });
        // Mirrors discovery.controller getDiscoverySettings projection.
        const response = {
            discovery: safe?.sourceConnectors?.discovery || {},
            brave: safe?.sourceConnectors?.brave || {},
            serpapi: safe?.sourceConnectors?.serpapi || {},
            google: safe?.sourceConnectors?.google || {},
            controlledTestMode: safe?.sourceConnectors?.controlledTestMode || {},
            moduleEnabled: safe.moduleEnabled,
        };
        assert.equal(response.moduleEnabled, true);
        assert.equal(response.discovery.freeFirstEnabled, true);
        assert.equal(response.brave.enabled, true);
        assert.equal(response.brave.perJobLimit, 40);
        assert.equal(response.brave.apiKey, undefined);
        assert.ok(response.brave.apiKeyMasked);
        assert.equal(response.serpapi.enabled, false);
        assert.equal(response.google.cseCx, 'cx');
        assert.equal(response.google.placesApiKey, undefined);
        assert.equal(response.controlledTestMode.enabled, true);
        assert.equal(response.controlledTestMode.maxJobs, 3);
    });
});
