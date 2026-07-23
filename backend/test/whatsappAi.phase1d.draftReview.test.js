/**
 * Phase 1D — Human draft review workflow (no WhatsApp send).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    listPendingDrafts,
    getDraftForReview,
    editDraft,
    approveDraft,
    rejectDraft,
    requestRegeneration,
    addReviewNote,
} from '../src/modules/whatsappAi/services/draftReview.service.js';
import { WHATSAPP_AI_PERMISSIONS, WHATSAPP_AI_REPLY_DRAFT_STATUSES } from '../src/modules/whatsappAi/constants/whatsappAi.constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeStore() {
    const companyId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const conversationId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const messageId = 'cccccccccccccccccccccccc';
    const draftId = 'dddddddddddddddddddddddd';
    const userId = 'eeeeeeeeeeeeeeeeeeeeeeee';
    const drafts = [{
        _id: draftId,
        companyId,
        conversationId,
        sourceMessageId: messageId,
        intent: 'product_enquiry',
        intentReason: 'test',
        confidence: 0.9,
        detectedLanguage: 'en',
        draftText: 'Thanks for your enquiry about DALI DT8. Our team will follow up.',
        status: 'pending_review',
        generationMode: 'deterministic_test',
        processingVersion: 'deterministic_stub_v1',
        safetyResult: { ok: true, code: '', reasons: [] },
        reviewNotes: [],
        reviewMeta: { outboundSent: false },
        contextSnapshot: {
            productIntelligence: { family: 'dali_driver' },
            groundingSources: [{ id: 'k1' }],
            provider: { id: 'null', networkCalled: false },
        },
        idempotencyKey: 'idem-1',
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        toObject() { return { ...this }; },
        async save() { this.updatedAt = new Date(); return this; },
    }];
    const messages = [{
        _id: messageId,
        companyId,
        conversationId,
        text: 'Need DT8 info',
        direction: 'in',
        createdAt: new Date(),
        isDeleted: false,
    }];
    const conversations = [{
        _id: conversationId,
        companyId,
        normalizedMobile: '919876543210',
        status: 'active',
        preferredLanguage: 'en',
        isDeleted: false,
    }];

    const ReplyDraft = {
        async findOne(filter) {
            return drafts.find((d) =>
                String(d._id) === String(filter._id)
                && String(d.companyId) === String(filter.companyId)
                && d.isDeleted === false) || null;
        },
        find(filter) {
            let rows = drafts.filter((d) => String(d.companyId) === String(filter.companyId) && d.isDeleted === false);
            const statusFilter = filter.status;
            if (statusFilter && typeof statusFilter === 'object' && Array.isArray(statusFilter.$in)) {
                rows = rows.filter((d) => statusFilter.$in.includes(d.status));
            } else if (typeof statusFilter === 'string') {
                rows = rows.filter((d) => d.status === statusFilter);
            }
            const api = {
                sort() { return api; },
                skip() { return api; },
                limit() { return api; },
                lean() { return Promise.resolve(rows.map((d) => ({ ...d }))); },
            };
            return api;
        },
        async countDocuments(filter) {
            const rows = await this.find(filter).lean();
            return rows.length;
        },
    };
    const Message = {
        async findOne(filter) {
            return messages.find((m) =>
                String(m._id) === String(filter._id)
                && String(m.companyId) === String(filter.companyId)
                && m.isDeleted === false) || null;
        },
    };
    const Conversation = {
        async findOne(filter) {
            return conversations.find((c) =>
                String(c._id) === String(filter._id)
                && String(c.companyId) === String(filter.companyId)
                && c.isDeleted === false) || null;
        },
    };
    const appendActionLog = async () => ({ _id: 'audit' });
    return {
        companyId, conversationId, messageId, draftId, userId, drafts,
        deps: { ReplyDraft, Message, Conversation, appendActionLog },
    };
}

describe('whatsappAi phase1d draft review', () => {
    it('permissions and statuses include Phase 1D values', () => {
        assert.equal(WHATSAPP_AI_PERMISSIONS.DRAFTS_VIEW, 'whatsapp_ai.drafts.view');
        assert.equal(WHATSAPP_AI_PERMISSIONS.DRAFTS_APPROVE, 'whatsapp_ai.drafts.approve');
        assert.ok(WHATSAPP_AI_REPLY_DRAFT_STATUSES.includes('regeneration_requested'));
        assert.ok(WHATSAPP_AI_REPLY_DRAFT_STATUSES.includes('pending_review'));
    });

    it('lists pending drafts company-scoped', async () => {
        const mem = makeStore();
        const data = await listPendingDrafts(mem.companyId, {}, mem.deps);
        assert.equal(data.results.length, 1);
        assert.equal(data.outboundSent, false);
        assert.equal(data.results[0].status, 'pending_review');
    });

    it('opens draft with customer message and context', async () => {
        const mem = makeStore();
        const data = await getDraftForReview(mem.companyId, mem.draftId, mem.userId, mem.deps);
        assert.equal(data.customerMessage.text, 'Need DT8 info');
        assert.equal(data.draft.status, 'pending_review');
        assert.equal(data.outboundSent, false);
        assert.equal(data.sendBlocked, true);
        assert.ok(data.productIntelligence);
    });

    it('edit / approve duplicate / reject / regenerate / note without sending', async () => {
        const mem = makeStore();
        const edited = await editDraft(mem.companyId, mem.draftId, { draftText: 'Edited safe reply for DT8.' }, mem.userId, mem.deps);
        assert.equal(edited.draft.status, 'edited');
        assert.equal(edited.outboundSent, false);

        const approved = await approveDraft(mem.companyId, mem.draftId, mem.userId, mem.deps);
        assert.equal(approved.draft.status, 'approved');
        assert.equal(approved.outboundSent, false);
        assert.equal(approved.draft.reviewMeta.readyForControlledSend, true);

        const dup = await approveDraft(mem.companyId, mem.draftId, mem.userId, mem.deps);
        assert.equal(dup.duplicate, true);
        assert.equal(dup.outboundSent, false);

        mem.drafts[0].status = 'pending_review';
        const rejected = await rejectDraft(mem.companyId, mem.draftId, { reason: 'tone' }, mem.userId, mem.deps);
        assert.equal(rejected.draft.status, 'rejected');
        assert.equal(rejected.outboundSent, false);

        mem.drafts[0].status = 'pending_review';
        const regen = await requestRegeneration(mem.companyId, mem.draftId, mem.userId, mem.deps);
        assert.equal(regen.draft.status, 'regeneration_requested');
        assert.equal(regen.outboundSent, false);

        mem.drafts[0].status = 'pending_review';
        const noted = await addReviewNote(mem.companyId, mem.draftId, { note: 'Check DT8 vs DT6' }, mem.userId, mem.deps);
        assert.ok(noted.draft.reviewNotes.length >= 1);
        assert.equal(noted.outboundSent, false);
    });

    it('cross-company isolation', async () => {
        const mem = makeStore();
        await assert.rejects(
            () => getDraftForReview('ffffffffffffffffffffffff', mem.draftId, mem.userId, mem.deps),
            (err) => err.statusCode === 404,
        );
    });

    it('review service has no WhatsApp send / Baileys / bulk hooks', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '../src/modules/whatsappAi/services/draftReview.service.js'),
            'utf8',
        );
        assert.equal(/from\s+['"].*baileys|require\(['"].*baileys|sendMessage\(|whatsapp-bulk\/|whatsapp-chat\//i.test(src), false);
        assert.ok(src.includes('does NOT send WhatsApp') || src.includes('no WhatsApp'));
    });
});
