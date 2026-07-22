/**
 * Phase 1B-2 — deterministic dry-run draft generation tests (in-memory deps).
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
    WHATSAPP_AI_DEFAULT_PROCESSING_VERSION,
    WHATSAPP_AI_REPLY_DRAFT_STATUSES,
} from '../src/modules/whatsappAi/constants/whatsappAi.constants.js';
import * as validation from '../src/modules/whatsappAi/validations/whatsappAi.validation.js';
import { createIntentClassifier } from '../src/modules/whatsappAi/services/intentClassifier.js';
import { createDraftGenerator } from '../src/modules/whatsappAi/services/draftGenerator.js';
import { validateDraftText } from '../src/modules/whatsappAi/services/draftSafety.service.js';
import {
    generateTestDraft,
    getTestDraft,
} from '../src/modules/whatsappAi/services/generateDraftTest.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const moduleDir = path.join(__dirname, '..', 'src', 'modules', 'whatsappAi');
const companyA = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const companyB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const userId = 'cccccccccccccccccccccccc';

function oid() {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`.slice(0, 24).padEnd(24, 'a');
}

function makeMem(mode = 'dry_run') {
    const conversations = [];
    const messages = [];
    const drafts = [];
    const audits = [];

    const Conversation = {
        async findOne(filter) {
            return conversations.find((c) => {
                if (filter._id && String(c._id) !== String(filter._id)) return false;
                if (filter.companyId && String(c.companyId) !== String(filter.companyId)) return false;
                if (filter.isDeleted === false && c.isDeleted !== false) return false;
                return true;
            }) || null;
        },
    };

    const Message = {
        async findOne(filter) {
            return messages.find((m) => {
                if (filter._id && String(m._id) !== String(filter._id)) return false;
                if (filter.companyId && String(m.companyId) !== String(filter.companyId)) return false;
                if (filter.isDeleted === false && m.isDeleted !== false) return false;
                return true;
            }) || null;
        },
        find(filter) {
            const rows = messages.filter((m) =>
                String(m.companyId) === String(filter.companyId)
                && String(m.conversationId) === String(filter.conversationId)
                && m.isDeleted === false);
            const api = {
                sort() { return api; },
                limit(n) { api._rows = rows.slice(0, n); return api; },
                lean() { return Promise.resolve(api._rows || rows); },
                then(resolve, reject) { return Promise.resolve(api._rows || rows).then(resolve, reject); },
            };
            api._rows = rows;
            return api;
        },
    };

    const ReplyDraft = {
        async findOne(filter) {
            return drafts.find((d) => {
                if (filter._id && String(d._id) !== String(filter._id)) return false;
                if (filter.companyId && String(d.companyId) !== String(filter.companyId)) return false;
                if (filter.sourceMessageId && String(d.sourceMessageId) !== String(filter.sourceMessageId)) return false;
                if (filter.processingVersion && d.processingVersion !== filter.processingVersion) return false;
                if (filter.isDeleted === false && d.isDeleted !== false) return false;
                return true;
            }) || null;
        },
        async create(doc) {
            const dup = drafts.find((d) =>
                String(d.companyId) === String(doc.companyId)
                && String(d.sourceMessageId) === String(doc.sourceMessageId)
                && d.processingVersion === doc.processingVersion
                && d.isDeleted === false);
            if (dup) {
                const err = new Error('duplicate key');
                err.code = 11000;
                throw err;
            }
            const row = { _id: oid(), isDeleted: false, createdAt: new Date(), updatedAt: new Date(), ...doc };
            drafts.push(row);
            return row;
        },
    };

    function seedInternalMessage({ companyId = companyA, text = 'Hello, I need DALI driver info' } = {}) {
        const conversationId = oid();
        const messageId = oid();
        conversations.push({
            _id: conversationId,
            companyId,
            normalizedMobile: '919876543210',
            source: 'internal_test',
            isDeleted: false,
        });
        messages.push({
            _id: messageId,
            companyId,
            conversationId,
            direction: 'in',
            messageType: 'text',
            text,
            idempotencyKey: `internal_test:seed-${messageId}`,
            isDeleted: false,
            createdAt: new Date(),
        });
        return { conversationId, messageId };
    }

    return {
        deps: {
            Conversation,
            Message,
            ReplyDraft,
            getSettings: async () => ({ mode }),
            appendActionLog: async (e) => { audits.push(e); return e; },
        },
        conversations,
        messages,
        drafts,
        audits,
        seedInternalMessage,
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
                if (!settled) { settled = true; reject(err); }
            });
        } catch (err) {
            if (!settled) { settled = true; reject(err); }
        }
    });
}

describe('whatsappAi phase1b2 generate draft', () => {
    it('permission denial is 403', () => {
        const user = {
            roleName: 'staff',
            role: { permissions: { whatsapp_ai: { testing: { inbound: true } } } },
        };
        assert.throws(
            () => checkPermission(WHATSAPP_AI_PERMISSIONS.TESTING_GENERATE_DRAFT)({ user }, {}, () => {}),
            (err) => err.statusCode === 403,
        );
    });

    it('feature flag off is rejected', async () => {
        const mw = requireCompanyFeature(WHATSAPP_AI_FEATURE_PATH);
        await assert.rejects(
            () => invokeMiddleware(mw, {
                companyId: companyA,
                featureSettings: DEFAULT_COMPANY_FEATURE_SETTINGS,
            }),
            (err) => err.statusCode === 403,
        );
    });

    it('invalid payload and unknown fields rejected', () => {
        assert.ok(validation.testGenerateDraft.body.validate({}).error);
        assert.ok(validation.testGenerateDraft.body.validate({ messageId: 'bad' }).error);
        assert.ok(validation.testGenerateDraft.body.validate({
            messageId: companyA,
            companyId: companyB,
        }).error);
    });

    it('status enum includes future values', () => {
        for (const s of ['pending_review', 'approved', 'edited', 'sent', 'rejected', 'expired']) {
            assert.ok(WHATSAPP_AI_REPLY_DRAFT_STATUSES.includes(s));
        }
        assert.equal(WHATSAPP_AI_DEFAULT_PROCESSING_VERSION, 'deterministic_stub_v1');
    });

    it('deterministic classification and draft generation', () => {
        const classifier = createIntentClassifier();
        const generator = createDraftGenerator();
        const g = classifier.classify('Hello there');
        assert.equal(g.intent, 'greeting');
        assert.equal(g.confidence, 1);
        assert.ok(g.intentReason);
        assert.equal(g.detectedLanguage, 'en');
        assert.match(generator.generate({ intent: 'greeting' }).draftText, /Thank you for contacting us/);
        assert.match(generator.generate({ intent: 'unknown' }).draftText, /team member will review/);
    });

    it('safety validation rejects urls and html', () => {
        assert.equal(validateDraftText('See https://evil.example').ok, false);
        assert.equal(validateDraftText('<script>x</script>').ok, false);
        assert.equal(validateDraftText('Thank you for contacting us. How may we assist you?').ok, true);
    });

    it('mode disabled rejected', async () => {
        const mem = makeMem('disabled');
        const { messageId } = mem.seedInternalMessage();
        await assert.rejects(
            () => generateTestDraft(companyA, { messageId }, userId, mem.deps),
            (err) => err.statusCode === 400,
        );
    });

    it('cross-company message access is denied', async () => {
        const mem = makeMem('dry_run');
        const { messageId } = mem.seedInternalMessage({ companyId: companyB });
        await assert.rejects(
            () => generateTestDraft(companyA, { messageId }, userId, mem.deps),
            (err) => err.statusCode === 404,
        );
    });

    it('non-test source message rejected', async () => {
        const mem = makeMem('dry_run');
        const conversationId = oid();
        const messageId = oid();
        mem.conversations.push({
            _id: conversationId,
            companyId: companyA,
            source: 'whatsapp_ai',
            normalizedMobile: '919876543210',
            isDeleted: false,
        });
        mem.messages.push({
            _id: messageId,
            companyId: companyA,
            conversationId,
            direction: 'in',
            messageType: 'text',
            text: 'Hello',
            idempotencyKey: null,
            isDeleted: false,
            createdAt: new Date(),
        });
        await assert.rejects(
            () => generateTestDraft(companyA, { messageId }, userId, mem.deps),
            (err) => err.statusCode === 400 && /internal_test/.test(err.message),
        );
    });

    it('non-text rejection', async () => {
        const mem = makeMem('dry_run');
        const { conversationId } = mem.seedInternalMessage();
        const messageId = oid();
        mem.messages.push({
            _id: messageId,
            companyId: companyA,
            conversationId,
            direction: 'in',
            messageType: 'image',
            text: '',
            idempotencyKey: 'internal_test:img',
            isDeleted: false,
            createdAt: new Date(),
        });
        await assert.rejects(
            () => generateTestDraft(companyA, { messageId }, userId, mem.deps),
            (err) => err.statusCode === 400 && /text/.test(err.message),
        );
    });

    it('creates pending_review draft without exposing draftText in summary', async () => {
        const mem = makeMem('dry_run');
        const { messageId } = mem.seedInternalMessage({ text: 'Hello' });
        const summary = await generateTestDraft(companyA, { messageId }, userId, mem.deps);
        assert.equal(summary.success, true);
        assert.equal(summary.duplicate, false);
        assert.equal(summary.status, 'pending_review');
        assert.equal(summary.intent, 'greeting');
        assert.equal(summary.outboundSent, false);
        assert.equal(summary.aiCalled, false);
        assert.equal(summary.leadCreated, false);
        assert.equal(Object.prototype.hasOwnProperty.call(summary, 'draftText'), false);
        assert.ok(summary.draftId);
        assert.ok(mem.audits.some((a) => a.actionType === 'test_draft_requested'));
        assert.ok(mem.audits.some((a) => a.actionType === 'test_draft_created'));

        const detail = await getTestDraft(companyA, summary.draftId, mem.deps);
        assert.ok(detail.draftText);
        assert.ok(detail.intentReason);
        assert.equal(detail.status, 'pending_review');
    });

    it('idempotent duplicate request', async () => {
        const mem = makeMem('scripted');
        const { messageId } = mem.seedInternalMessage({ text: 'I need product information' });
        const first = await generateTestDraft(companyA, { messageId }, userId, mem.deps);
        const second = await generateTestDraft(companyA, { messageId }, userId, mem.deps);
        assert.equal(first.duplicate, false);
        assert.equal(second.duplicate, true);
        assert.equal(first.draftId, second.draftId);
        assert.equal(mem.drafts.length, 1);
        assert.ok(mem.audits.some((a) => a.actionType === 'test_draft_duplicate'));
    });

    it('no outbound send AI SDK or CRM mutation imports in draft services', () => {
        const files = [
            'services/generateDraftTest.service.js',
            'services/intentClassifier.js',
            'services/draftGenerator.js',
            'services/contextLoader.service.js',
            'services/draftSafety.service.js',
        ];
        const combined = files.map((f) => fs.readFileSync(path.join(moduleDir, f), 'utf8')).join('\n');
        assert.doesNotMatch(combined, /@whiskeysockets\/baileys/);
        assert.doesNotMatch(combined, /whatsapp\.service/);
        assert.doesNotMatch(combined, /socket\.io|openai|anthropic|langchain|gemini/i);
        assert.doesNotMatch(combined, /Customer\.create|Lead\.create|promote/);
        assert.doesNotMatch(combined, /sendMessage|sendRawToJid/);
    });
});
