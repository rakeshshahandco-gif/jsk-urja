/**
 * Phase 1E — Controlled outbound gateway (no live WhatsApp send).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createOutboundGateway,
    OUTBOUND_GATEWAY_VERSION,
    DEFAULT_OUTBOUND_CONFIG,
    isOutboundEnvEnabled,
} from '../src/modules/whatsappAi/services/outbound/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function baseInput(overrides = {}) {
    return {
        companyId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        draft: {
            _id: 'dddddddddddddddddddddddd',
            companyId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            status: 'approved',
            reviewMeta: { outboundSent: false },
            updatedAt: 't1',
        },
        conversation: {
            _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            normalizedMobile: '919876543210',
            isDeleted: false,
        },
        user: { _id: 'eeeeeeeeeeeeeeeeeeeeeeee' },
        manualConfirmed: true,
        idempotencyKey: 'idem-outbound-1',
        ...overrides,
    };
}

describe('whatsappAi phase1e outbound gateway', () => {
    it('defaults keep outbound disabled', () => {
        assert.equal(DEFAULT_OUTBOUND_CONFIG.outboundEnabled, false);
        assert.equal(DEFAULT_OUTBOUND_CONFIG.killSwitch, true);
        assert.equal(isOutboundEnvEnabled({ WHATSAPP_AI_OUTBOUND_ENABLED: 'false' }), false);
        assert.equal(isOutboundEnvEnabled({}), false);
    });

    it('blocked by kill switch / env — outboundSent false', async () => {
        const gw = createOutboundGateway({
            env: { WHATSAPP_AI_OUTBOUND_ENABLED: 'false' },
            appendActionLog: async () => ({}),
        });
        assert.equal(gw.version, OUTBOUND_GATEWAY_VERSION);
        const r = await gw.sendApprovedDraft(baseInput());
        assert.equal(r.status, 'send_blocked');
        assert.equal(r.outboundSent, false);
        assert.ok(r.reason);
    });

    it('requires approval and manual confirmation', async () => {
        const gw = createOutboundGateway({ env: { WHATSAPP_AI_OUTBOUND_ENABLED: 'false' } });
        await assert.rejects(
            () => gw.sendApprovedDraft(baseInput({ draft: { ...baseInput().draft, status: 'pending_review' } })),
            (err) => err.code === 'DRAFT_NOT_APPROVED',
        );
        const blocked = await gw.sendApprovedDraft(baseInput({ manualConfirmed: false, idempotencyKey: 'idem-mc' }));
        assert.equal(blocked.status, 'send_blocked');
        assert.equal(blocked.reason, 'manual_confirmation_required');
        assert.equal(blocked.outboundSent, false);
    });

    it('duplicate send protection', async () => {
        const gw = createOutboundGateway({
            env: { WHATSAPP_AI_OUTBOUND_ENABLED: 'false' },
            appendActionLog: async () => ({}),
        });
        const a = await gw.sendApprovedDraft(baseInput({ idempotencyKey: 'dup-key' }));
        const b = await gw.sendApprovedDraft(baseInput({ idempotencyKey: 'dup-key' }));
        assert.equal(a.outboundSent, false);
        assert.equal(b.duplicate, true);
        assert.equal(b.outboundSent, false);
    });

    it('company / recipient / conversation validators', () => {
        const gw = createOutboundGateway();
        assert.throws(() => gw.validateRecipient({ normalizedMobile: '123' }), /Invalid recipient/);
        assert.throws(() => gw.validateCompany(null, {}), /Company required/);
        assert.throws(() => gw.validateConversation(null), /Conversation required/);
        assert.equal(gw.validateProviderSession().live, false);
        assert.equal(gw.validateKillSwitch().ok, false);
    });

    it('static scan: no Baileys / chat / bulk imports', () => {
        const dir = path.join(__dirname, '../src/modules/whatsappAi/services/outbound');
        for (const name of fs.readdirSync(dir)) {
            if (!name.endsWith('.js')) continue;
            const t = fs.readFileSync(path.join(dir, name), 'utf8');
            assert.equal(/from\s+['"].*baileys|whatsapp-chat|whatsapp-bulk|sendRawToJid/i.test(t), false, name);
        }
    });
});
