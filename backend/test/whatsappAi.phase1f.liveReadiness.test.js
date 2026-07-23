/**
 * Phase 1F — Live-readiness validation (no deploy / no live send).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    evaluateLiveReadiness,
    FINAL_LIVE_STATUS,
    LIVE_READINESS_CHECKLIST,
    READINESS_STATUSES,
} from '../src/modules/whatsappAi/services/readiness/index.js';

describe('whatsappAi phase1f live readiness', () => {
    it('checklist covers required items', () => {
        const ids = LIVE_READINESS_CHECKLIST.map((c) => c.id);
        for (const id of [
            'environment', 'provider_secret', 'channel_health', 'permissions',
            'company_feature_flag', 'kill_switch', 'rate_limit', 'duplicate_protection',
            'data_retention', 'audit', 'rollback_plan', 'production_deployment_plan',
        ]) {
            assert.ok(ids.includes(id), id);
        }
        assert.ok(READINESS_STATUSES.includes(FINAL_LIVE_STATUS));
    });

    it('local dry-run readiness keeps live status requiring owner approval', () => {
        const r = evaluateLiveReadiness({
            env: { NODE_ENV: 'development', WHATSAPP_AI_OUTBOUND_ENABLED: 'false' },
            featureEnabled: true,
            providerRuntime: { providerEnabled: false, killSwitch: true },
        });
        assert.equal(r.liveStatus, FINAL_LIVE_STATUS);
        assert.equal(r.liveActivationRequiresOwnerApproval, true);
        assert.equal(r.liveWhatsAppSendingEnabled, false);
        assert.equal(r.deployed, false);
        assert.equal(r.pushed, false);
        assert.ok(['dry_run_ready', 'review_ready', 'not_ready'].includes(r.stage));
        assert.equal(r.stage === 'live_activation_requires_owner_approval', false);
    });

    it('never reports live sending enabled', () => {
        const r = evaluateLiveReadiness({
            env: { NODE_ENV: 'production', WHATSAPP_AI_OUTBOUND_ENABLED: 'true' },
            allowProductionEval: true,
            featureEnabled: true,
            providerRuntime: { providerEnabled: true, killSwitch: false },
            outboundConfig: { outboundEnabled: true, killSwitch: false },
        });
        assert.equal(r.liveStatus, 'live_activation_requires_owner_approval');
        assert.equal(r.liveWhatsAppSendingEnabled, false);
        assert.equal(r.outboundEnabled, false);
    });
});
