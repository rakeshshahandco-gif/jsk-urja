/**
 * Phase 1B-1 — dry-run internal inbound test pipeline.
 * Uses injectable in-memory stores (no live Mongo required).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireCompanyFeature } from '../src/middlewares/featureAccess.middleware.js';
import { checkPermission } from '../src/middlewares/auth.middleware.js';
import { DEFAULT_COMPANY_FEATURE_SETTINGS } from '../src/constants/companyFeatureSettings.defaults.js';
import {
    WHATSAPP_AI_FEATURE_PATH,
    WHATSAPP_AI_PERMISSIONS,
} from '../src/modules/whatsappAi/constants/whatsappAi.constants.js';
import * as validation from '../src/modules/whatsappAi/validations/whatsappAi.validation.js';
import {
    processTestInbound,
    assertInboundTestModeAllowed,
    assertInboundTestPayloadShape,
    INBOUND_TEST_TEXT_MAX,
} from '../src/modules/whatsappAi/services/inboundTest.service.js';
import { normalizeWhatsAppAiMobile } from '../src/modules/whatsappAi/utils/normalizeMobile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const moduleDir = path.join(__dirname, '..', 'src', 'modules', 'whatsappAi');
const companyA = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const companyB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const userId = 'cccccccccccccccccccccccc';

function oid() {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`.slice(0, 24).padEnd(24, 'a');
}

function makeMemoryDeps(initialSettings = { mode: 'dry_run' }) {
    const conversations = [];
    const messages = [];
    const audits = [];
    const settingsByCompany = { [companyA]: { ...initialSettings }, [companyB]: { ...initialSettings } };

    const Conversation = {
        async findOne(filter) {
            const hit = conversations.find((c) =>
                String(c.companyId) === String(filter.companyId)
                && c.normalizedMobile === filter.normalizedMobile
                && c.isDeleted === false);
            return hit || null;
        },
        async create(doc) {
            const row = { _id: oid(), isDeleted: false, ...doc };
            conversations.push(row);
            return row;
        },
        async updateOne(filter, update) {
            const row = conversations.find((c) => String(c._id) === String(filter._id)
                && String(c.companyId) === String(filter.companyId));
            if (!row) return { matchedCount: 0 };
            if (update.$set) Object.assign(row, update.$set);
            if (update.$inc) {
                for (const [k, v] of Object.entries(update.$inc)) row[k] = (row[k] || 0) + v;
            }
            return { matchedCount: 1 };
        },
    };

    const Message = {
        async findOne(filter) {
            const hit = messages.find((m) =>
                String(m.companyId) === String(filter.companyId)
                && m.providerMessageId === filter.providerMessageId
                && m.isDeleted === false);
            return hit ? { ...hit } : null;
        },
        async create(doc) {
            const dup = messages.find((m) =>
                String(m.companyId) === String(doc.companyId)
                && m.providerMessageId === doc.providerMessageId
                && m.isDeleted === false);
            if (dup) {
                const err = new Error('duplicate key');
                err.code = 11000;
                throw err;
            }
            const row = { _id: oid(), isDeleted: false, ...doc };
            messages.push(row);
            return row;
        },
    };

    return {
        deps: {
            Conversation,
            Message,
            getSettings: async (companyId) => settingsByCompany[String(companyId)] || { mode: 'disabled' },
            appendActionLog: async (entry) => {
                audits.push(entry);
                return entry;
            },
        },
        conversations,
        messages,
        audits,
        settingsByCompany,
    };
}

function basePayload(overrides = {}) {
    return {
        externalMessageId: 'test-message-001',
        mobile: '919876543210',
        contactName: 'Test Customer',
        messageType: 'text',
        text: 'I need information about DALI drivers',
        receivedAt: '2026-07-22T10:30:00.000Z',
        ...overrides,
    };
}

function invokeMiddleware(mw, req, res = {}) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const next = (err) => {
            if (settled) return;
            settled = true;
            if (err) reject(err);
            else resolve('next');
        };
        try {
            Promise.resolve(mw(req, res, next)).catch((err) => {
                if (!settled) {
                    settled = true;
                    reject(err);
                }
            });
        } catch (err) {
            if (!settled) {
                settled = true;
                reject(err);
            }
        }
    });
}

describe('whatsappAi phase1b1 inbound test pipeline', () => {
    it('1. feature disabled is rejected', async () => {
        const mw = requireCompanyFeature(WHATSAPP_AI_FEATURE_PATH);
        await assert.rejects(
            () => invokeMiddleware(mw, {
                companyId: companyA,
                featureSettings: DEFAULT_COMPANY_FEATURE_SETTINGS,
            }),
            (err) => err.statusCode === 403,
        );
    });

    it('2. mode disabled is rejected', async () => {
        const { deps } = makeMemoryDeps({ mode: 'disabled' });
        await assert.rejects(
            () => processTestInbound(companyA, basePayload(), userId, deps),
            (err) => err.statusCode === 400 && /dry_run or scripted/.test(err.message),
        );
    });

    it('3. dry_run accepted', async () => {
        const mem = makeMemoryDeps({ mode: 'dry_run' });
        const result = await processTestInbound(companyA, basePayload(), userId, mem.deps);
        assert.equal(result.success, true);
        assert.equal(result.mode, 'dry_run');
        assert.equal(result.duplicate, false);
        assert.ok(result.conversationId);
        assert.ok(result.messageId);
    });

    it('4. scripted accepted', async () => {
        const mem = makeMemoryDeps({ mode: 'scripted' });
        const result = await processTestInbound(companyA, basePayload({ externalMessageId: 'scripted-1' }), userId, mem.deps);
        assert.equal(result.mode, 'scripted');
        assert.equal(result.duplicate, false);
    });

    it('5. no permission receives 403', () => {
        const user = {
            roleName: 'staff',
            role: { permissions: { whatsapp_ai: { module: { view: true } } } },
        };
        assert.throws(
            () => checkPermission(WHATSAPP_AI_PERMISSIONS.TESTING_INBOUND)({ user }, {}, () => {}),
            (err) => err.statusCode === 403,
        );
    });

    it('6. companyId from body ignored or rejected', () => {
        assert.throws(
            () => assertInboundTestPayloadShape({ ...basePayload(), companyId: companyB }),
            (err) => err.statusCode === 400 && /companyId/.test(err.message),
        );
        const { error } = validation.testInbound.body.validate({ ...basePayload(), companyId: companyB });
        assert.ok(error);
    });

    it('7. valid payload creates one conversation and one message', async () => {
        const mem = makeMemoryDeps({ mode: 'dry_run' });
        await processTestInbound(companyA, basePayload(), userId, mem.deps);
        assert.equal(mem.conversations.length, 1);
        assert.equal(mem.messages.length, 1);
        assert.equal(mem.conversations[0].source, 'internal_test');
        assert.equal(mem.conversations[0].assignedUserId, null);
        assert.equal(mem.messages[0].direction, 'in');
        assert.equal(mem.messages[0].messageType, 'text');
        assert.equal(mem.messages[0].processingStatus, 'received');
        assert.equal(mem.messages[0].providerMessageId, 'test-message-001');
    });

    it('8. duplicate externalMessageId is idempotent', async () => {
        const mem = makeMemoryDeps({ mode: 'dry_run' });
        const first = await processTestInbound(companyA, basePayload(), userId, mem.deps);
        const second = await processTestInbound(companyA, basePayload(), userId, mem.deps);
        assert.equal(first.duplicate, false);
        assert.equal(second.duplicate, true);
        assert.equal(second.messageId, first.messageId);
        assert.equal(mem.messages.length, 1);
        assert.equal(mem.conversations.length, 1);
        assert.ok(mem.audits.some((a) => a.actionType === 'inbound_test_duplicate'));
    });

    it('9. same mobile in different companies remains isolated', async () => {
        const mem = makeMemoryDeps({ mode: 'dry_run' });
        await processTestInbound(companyA, basePayload({ externalMessageId: 'a-1' }), userId, mem.deps);
        await processTestInbound(companyB, basePayload({ externalMessageId: 'b-1' }), userId, mem.deps);
        assert.equal(mem.conversations.filter((c) => String(c.companyId) === companyA).length, 1);
        assert.equal(mem.conversations.filter((c) => String(c.companyId) === companyB).length, 1);
    });

    it('10. same externalMessageId in different companies is allowed separately', async () => {
        const mem = makeMemoryDeps({ mode: 'dry_run' });
        const a = await processTestInbound(companyA, basePayload(), userId, mem.deps);
        const b = await processTestInbound(companyB, basePayload(), userId, mem.deps);
        assert.equal(a.duplicate, false);
        assert.equal(b.duplicate, false);
        assert.notEqual(a.messageId, b.messageId);
        assert.equal(mem.messages.length, 2);
    });

    it('11. text length validation', () => {
        const tooLong = 'x'.repeat(INBOUND_TEST_TEXT_MAX + 1);
        const { error } = validation.testInbound.body.validate(basePayload({ text: tooLong }));
        assert.ok(error);
    });

    it('12. non-text message type rejected', () => {
        const { error } = validation.testInbound.body.validate(basePayload({ messageType: 'image' }));
        assert.ok(error);
    });

    it('13. binary base64 media fields rejected', () => {
        assert.throws(() => assertInboundTestPayloadShape({ ...basePayload(), base64: 'AAAA' }), (e) => e.statusCode === 400);
        assert.throws(() => assertInboundTestPayloadShape({ ...basePayload(), media: 'x' }), (e) => e.statusCode === 400);
        assert.throws(() => assertInboundTestPayloadShape({ ...basePayload(), attachment: {} }), (e) => e.statusCode === 400);
    });

    it('14. forbidden secret-shaped fields rejected', () => {
        assert.throws(() => assertInboundTestPayloadShape({ ...basePayload(), apiKey: 'sk' }), (e) => e.statusCode === 400);
        assert.throws(() => assertInboundTestPayloadShape({ ...basePayload(), token: 't' }), (e) => e.statusCode === 400);
        assert.throws(() => assertInboundTestPayloadShape({ ...basePayload(), password: 'p' }), (e) => e.statusCode === 400);
    });

    it('15-17. response confirms no outbound AI or lead side effects', async () => {
        const mem = makeMemoryDeps({ mode: 'dry_run' });
        const result = await processTestInbound(companyA, basePayload({ externalMessageId: 'flags-1' }), userId, mem.deps);
        assert.equal(result.outboundSent, false);
        assert.equal(result.aiCalled, false);
        assert.equal(result.leadCreated, false);
        assert.equal(result.processing, 'stored_only');
    });

    it('18. audit log is append-only and safely redacted', async () => {
        const mem = makeMemoryDeps({ mode: 'dry_run' });
        await processTestInbound(companyA, basePayload({ externalMessageId: 'audit-1', text: 'secret customer note' }), userId, mem.deps);
        assert.equal(mem.audits.length, 1);
        const meta = mem.audits[0].structuredMetadata;
        assert.equal(meta.externalMessageId, 'audit-1');
        assert.equal(meta.source, 'internal_test');
        assert.equal(meta.textLength, 'secret customer note'.length);
        assert.equal(Object.prototype.hasOwnProperty.call(meta, 'text'), false);
        assert.equal(mem.audits[0].actionType, 'inbound_test_received');
    });

    it('19. no existing WhatsApp service imported by inbound test module', () => {
        const src = fs.readFileSync(path.join(moduleDir, 'services', 'inboundTest.service.js'), 'utf8');
        assert.doesNotMatch(src, /whatsapp\.service/);
        assert.doesNotMatch(src, /whatsappChat/);
        assert.doesNotMatch(src, /whatsappBulk/);
        assert.doesNotMatch(src, /@whiskeysockets\/baileys/);
        assert.doesNotMatch(src, /openai|anthropic|socket\.io/i);
        assert.equal(typeof assertInboundTestModeAllowed, 'function');
        assert.equal(normalizeWhatsAppAiMobile('9876543210'), '919876543210');
    });
});
