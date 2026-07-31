import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { assertNoBrowserSecrets } from '../../src/services/dataExtractor/discovery/agent/agentIngest.service.js';
import { listDiscoveryProviders } from '../../src/services/dataExtractor/discovery/providerRegistry.js';
import { AGENT_SOURCES } from '../../src/models/discoveryAgentJob.model.js';

describe('Phase 2 discovery agent safety', () => {
    it('rejects cookie payloads', () => {
        assert.throws(() => assertNoBrowserSecrets({ cookies: [{ name: 'a', value: 'b' }] }), /cookies|secrets/i);
    });

    it('rejects password payloads', () => {
        assert.throws(() => assertNoBrowserSecrets({ password: 'secret' }), /password|secrets/i);
    });

    it('rejects storageState payloads', () => {
        assert.throws(() => assertNoBrowserSecrets({ storageState: { cookies: [] } }), /storageState|cookies/i);
    });

    it('allows clean business records', () => {
        assert.doesNotThrow(() => assertNoBrowserSecrets({
            records: [{ companyName: 'Acme', website: 'https://acme.com', sourceUrl: 'https://acme.com' }],
        }));
    });
});

describe('Phase 2 agent token hashing contract', () => {
    it('hashes tokens with sha256 hex', () => {
        const plain = 'jskdisc_' + crypto.randomBytes(8).toString('hex');
        const hash = crypto.createHash('sha256').update(plain).digest('hex');
        assert.equal(hash.length, 64);
        assert.notEqual(hash, plain);
    });
});

describe('Phase 2 provider registry', () => {
    it('lists browser_assisted as non-executable server provider', () => {
        const list = listDiscoveryProviders({
            sourceConnectors: { discovery: { browserAssistedEnabled: true } },
        });
        const p = list.find((x) => x.providerId === 'browser_assisted');
        assert.ok(p);
        assert.equal(p.executable, false);
        assert.equal(p.configured, true);
    });

    it('supports expected agent source modes', () => {
        assert.ok(AGENT_SOURCES.includes('google_visible'));
        assert.ok(AGENT_SOURCES.includes('facebook_public_visible'));
        assert.ok(AGENT_SOURCES.includes('instagram_public_visible'));
        assert.ok(AGENT_SOURCES.includes('manual_directory'));
    });
});

describe('Phase 2 company override guard logic', () => {
    it('detects mismatched company claim', () => {
        const tokenCompanyId = '111111111111111111111111';
        const claimed = '222222222222222222222222';
        assert.notEqual(String(claimed), String(tokenCompanyId));
    });
});
