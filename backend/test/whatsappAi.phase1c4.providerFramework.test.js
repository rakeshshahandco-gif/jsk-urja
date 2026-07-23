/**
 * Phase 1C.4 — Provider adapter framework tests.
 * No real network / paid API calls.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    isAiProvider,
    createNullProvider,
    createOpenAIProvider,
    createGeminiProvider,
    createClaudeProvider,
    createLocalLlmProvider,
    createProviderRegistry,
    DEFAULT_PROVIDER_RUNTIME_CONFIG,
    PROVIDER_FRAMEWORK_VERSION,
    PROVIDER_IDS,
    maskSecret,
    assertNoApiKeysInPayload,
    resolveCompanyProviderConfig,
    NULL_PROVIDER_DUMMY_TEXT,
} from '../src/modules/whatsappAi/services/brain/index.js';

const REQ = { systemPrompt: 'sys', userPrompt: 'Need DT8 DALI info' };

describe('whatsappAi phase1c4 provider framework', () => {
    it('defaults keep provider disabled / null / dry_run / no outbound', () => {
        assert.equal(DEFAULT_PROVIDER_RUNTIME_CONFIG.providerEnabled, false);
        assert.equal(DEFAULT_PROVIDER_RUNTIME_CONFIG.provider, null);
        assert.equal(DEFAULT_PROVIDER_RUNTIME_CONFIG.mode, 'dry_run');
        assert.equal(DEFAULT_PROVIDER_RUNTIME_CONFIG.outboundAllowed, false);
        assert.equal(DEFAULT_PROVIDER_RUNTIME_CONFIG.killSwitch, true);
    });

    it('all adapters satisfy full interface', () => {
        for (const p of [
            createNullProvider(),
            createOpenAIProvider(),
            createGeminiProvider(),
            createClaudeProvider(),
            createLocalLlmProvider(),
        ]) {
            assert.equal(isAiProvider(p), true);
            assert.equal(typeof p.healthCheck, 'function');
            assert.equal(typeof p.estimateCost, 'function');
            assert.equal(typeof p.normalizeError, 'function');
            assert.equal(typeof p.supportsStructuredOutput, 'function');
        }
    });

    it('null provider never calls network', async () => {
        const p = createNullProvider();
        const r = await p.complete(REQ);
        assert.equal(r.networkCalled, false);
        assert.equal(r.text, NULL_PROVIDER_DUMMY_TEXT);
        const h = await p.healthCheck();
        assert.equal(h.networkCalled, false);
        assert.equal(p.estimateCost(REQ).estimatedUsd, 0);
    });

    it('vendor adapters inactive without callsEnabled/key fall back without network', async () => {
        for (const p of [
            createOpenAIProvider({ callsEnabled: false, apiKey: 'sk-test-key-123456' }),
            createGeminiProvider({ callsEnabled: true }), // no key
            createClaudeProvider({}),
            createLocalLlmProvider({ callsEnabled: false }),
        ]) {
            const r = await p.complete(REQ);
            assert.equal(r.networkCalled, false);
            assert.ok(r.text.includes('NULL_PROVIDER') || r.text.length > 0);
        }
    });

    it('registry lists providers and defaults to null under kill switch', async () => {
        const registry = createProviderRegistry();
        assert.equal(registry.version, PROVIDER_FRAMEWORK_VERSION);
        for (const id of Object.values(PROVIDER_IDS)) {
            assert.equal(registry.has(id), true);
        }
        const cfg = registry.getRuntimeConfig('co1');
        assert.equal(cfg.providerEnabled, false);
        assert.equal(cfg.killSwitch, true);
        const selected = registry.resolveForCompany('co1');
        assert.equal(selected.id, 'null');
        const result = await registry.completeForCompany('co1', REQ);
        assert.equal(result.networkCalled, false);
        assert.equal(result.meta.outboundAllowed, false);
    });

    it('company-wise provider selection when explicitly enabled', async () => {
        const registry = createProviderRegistry({
            runtime: {
                providerEnabled: true,
                killSwitch: false,
                provider: 'openai',
                mode: 'dry_run',
                outboundAllowed: false,
                companyProviderMap: {
                    coA: { provider: 'gemini' },
                    coB: { provider: 'claude' },
                },
            },
        });
        assert.equal(registry.resolveForCompany('coA').id, 'gemini');
        assert.equal(registry.resolveForCompany('coB').id, 'claude');
        assert.equal(registry.resolveForCompany('coOther').id, 'openai');
        const r = await registry.completeForCompany('coA', REQ);
        assert.equal(r.networkCalled, false);
        assert.equal(r.providerId, 'gemini');
    });

    it('disabled provider / kill switch forces null fallback', async () => {
        const registry = createProviderRegistry({
            runtime: { providerEnabled: true, killSwitch: true, provider: 'openai' },
        });
        assert.equal(registry.resolveForCompany('x').id, 'null');
        registry.updateRuntime({ killSwitch: false, providerEnabled: false, provider: 'openai' });
        assert.equal(registry.resolveForCompany('x').id, 'null');
    });

    it('masks secrets and rejects api keys in settings payloads', () => {
        const m = maskSecret('sk-abcdefghijklmnopqrstuvwxyz');
        assert.equal(m.present, true);
        assert.ok(m.masked.includes('****'));
        assert.equal(m.masked.includes('sk-abcdefghijklmnop'), false);
        assert.throws(() => assertNoApiKeysInPayload({ openaiApiKey: 'sk-test' }), /API keys|Secret/);
        assert.throws(() => assertNoApiKeysInPayload({ nested: { apiKey: 'x' } }), /API keys|Secret/);
        const registry = createProviderRegistry();
        assert.throws(() => registry.updateRuntime({ apiKey: 'sk-leak' }), /API keys|Secret/);
    });

    it('resolveCompanyProviderConfig merges overlays', () => {
        const cfg = resolveCompanyProviderConfig('c1', {
            providerEnabled: true,
            killSwitch: false,
            provider: 'local',
            companyProviderMap: { c1: { model: 'local-special', maxTokens: 100 } },
        });
        assert.equal(cfg.provider, 'local');
        assert.equal(cfg.model, 'local-special');
        assert.equal(cfg.maxTokens, 100);
        assert.equal(cfg.outboundAllowed, false);
    });

    it('supportsStructuredOutput flags', () => {
        assert.equal(createNullProvider().supportsStructuredOutput(), false);
        assert.equal(createOpenAIProvider().supportsStructuredOutput(), true);
        assert.equal(createLocalLlmProvider().supportsStructuredOutput(), false);
    });

    it('normalizeError shapes', () => {
        const err = createOpenAIProvider().normalizeError(new Error('boom'));
        assert.equal(err.providerId, 'openai');
        assert.ok(err.message.includes('boom'));
    });
});
