/**
 * Phase 1A.1 - pre-merge hardening tests (permissions + safe modes).
 * No production Mongo / Atlas required for pure helpers and middleware.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    WHATSAPP_AI_MODES,
    WHATSAPP_AI_UNSUPPORTED_MODES,
    WHATSAPP_AI_PERMISSIONS,
    WHATSAPP_AI_DEFAULT_SETTINGS,
    normalizeWhatsAppAiMode,
    assertWhatsAppAiModeAllowed,
} from '../src/modules/whatsappAi/constants/whatsappAi.constants.js';
import {
    resolveConversationAccess,
    isConversationVisibleToAccess,
} from '../src/modules/whatsappAi/services/conversation.service.js';
import { requireAnyPermission } from '../src/modules/whatsappAi/middleware/requireAnyPermission.js';
import { checkPermission } from '../src/middlewares/auth.middleware.js';
import { MODULE_REGISTRY } from '../src/constants/moduleRegistry.constants.js';
import * as validation from '../src/modules/whatsappAi/validations/whatsappAi.validation.js';
import whatsappAiRouter from '../src/modules/whatsappAi/routes/whatsappAi.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const moduleDir = path.join(__dirname, '..', 'src', 'modules', 'whatsappAi');

function userWithPerms(actions) {
    const whatsapp_ai = {};
    for (const key of actions) {
        const [, sub, act] = key.split('.');
        if (!whatsapp_ai[sub]) whatsapp_ai[sub] = {};
        whatsapp_ai[sub][act] = true;
    }
    return {
        _id: 'cccccccccccccccccccccccc',
        id: 'cccccccccccccccccccccccc',
        roleName: 'staff',
        role: { permissions: { whatsapp_ai } },
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

describe('whatsappAi phase1a.1 conversation access', () => {
    it('view_all resolves scope all and may use assignedUserId filter', () => {
        const user = userWithPerms([WHATSAPP_AI_PERMISSIONS.CONVERSATIONS_VIEW_ALL]);
        const access = resolveConversationAccess(user, { assignedUserId: 'dddddddddddddddddddddddd' });
        assert.equal(access.scope, 'all');
        assert.equal(access.assignedUserIdFilter, 'dddddddddddddddddddddddd');
    });

    it('view_assigned forces self and ignores client assignedUserId', () => {
        const user = userWithPerms([WHATSAPP_AI_PERMISSIONS.CONVERSATIONS_VIEW_ASSIGNED]);
        const access = resolveConversationAccess(user, { assignedUserId: 'dddddddddddddddddddddddd' });
        assert.equal(access.scope, 'assigned');
        assert.equal(access.assignedUserIdFilter, String(user._id));
        assert.notEqual(access.assignedUserIdFilter, 'dddddddddddddddddddddddd');
    });

    it('neither view permission receives 403', () => {
        const user = userWithPerms([WHATSAPP_AI_PERMISSIONS.VIEW]);
        assert.throws(
            () => resolveConversationAccess(user, {}),
            (err) => err.statusCode === 403,
        );
    });

    it('view_assigned cannot see another user conversation by id', () => {
        const access = {
            scope: 'assigned',
            userId: 'cccccccccccccccccccccccc',
            assignedUserIdFilter: 'cccccccccccccccccccccccc',
        };
        assert.equal(
            isConversationVisibleToAccess({ assignedUserId: 'cccccccccccccccccccccccc' }, access),
            true,
        );
        assert.equal(
            isConversationVisibleToAccess({ assignedUserId: 'dddddddddddddddddddddddd' }, access),
            false,
        );
        assert.equal(isConversationVisibleToAccess({ assignedUserId: null }, access), false);
    });

    it('view_all sees any assignee in company scope check helper', () => {
        const access = { scope: 'all', userId: 'cccccccccccccccccccccccc', assignedUserIdFilter: null };
        assert.equal(
            isConversationVisibleToAccess({ assignedUserId: 'dddddddddddddddddddddddd' }, access),
            true,
        );
    });

    it('company isolation remains on list/get query pattern (companyId required)', () => {
        const src = fs.readFileSync(path.join(moduleDir, 'services', 'conversation.service.js'), 'utf8');
        assert.match(src, /filter = \{ companyId, isDeleted: false \}/);
        assert.match(src, /findOne\(\{ _id: id, companyId, isDeleted: false \}/);
        const companyA = 'aaaaaaaaaaaaaaaaaaaaaaaa';
        const companyB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
        const records = [
            { _id: '1', companyId: companyA, assignedUserId: 'cccccccccccccccccccccccc' },
            { _id: '2', companyId: companyB, assignedUserId: 'cccccccccccccccccccccccc' },
        ];
        const visible = records.filter((r) => String(r.companyId) === companyA);
        assert.equal(visible.length, 1);
        assert.equal(visible[0]._id, '1');
    });
});

describe('whatsappAi phase1a.1 settings modes', () => {
    it('allows disabled, dry_run, scripted only', () => {
        assert.deepEqual([...WHATSAPP_AI_MODES], ['disabled', 'dry_run', 'scripted']);
        assert.ok(WHATSAPP_AI_UNSUPPORTED_MODES.includes('ai'));
        assert.ok(WHATSAPP_AI_UNSUPPORTED_MODES.includes('live'));
        assert.ok(WHATSAPP_AI_UNSUPPORTED_MODES.includes('autonomous'));
        assert.equal(WHATSAPP_AI_DEFAULT_SETTINGS.mode, 'disabled');
    });

    it('disabled / dry_run / scripted accepted', () => {
        for (const mode of ['disabled', 'dry_run', 'scripted']) {
            assert.doesNotThrow(() => assertWhatsAppAiModeAllowed(mode));
            assert.equal(normalizeWhatsAppAiMode(mode), mode);
            const { error } = validation.updateSettings.body.validate({ mode });
            assert.equal(error, undefined, mode);
        }
    });

    it('ai / live / unknown rejected', () => {
        for (const mode of ['ai', 'live', 'autonomous', 'something_else']) {
            assert.throws(() => assertWhatsAppAiModeAllowed(mode), (err) => err.statusCode === 400);
            assert.equal(normalizeWhatsAppAiMode(mode), 'disabled');
            const { error } = validation.updateSettings.body.validate({ mode });
            assert.ok(error, mode);
        }
    });

    it('omitted mode defaults safely', () => {
        assert.doesNotThrow(() => assertWhatsAppAiModeAllowed(undefined));
        assert.equal(normalizeWhatsAppAiMode(undefined), 'disabled');
        assert.equal(normalizeWhatsAppAiMode(null), 'disabled');
        const { error, value } = validation.updateSettings.body.validate({});
        assert.equal(error, undefined);
        assert.equal(value.mode, undefined);
        assert.equal(WHATSAPP_AI_DEFAULT_SETTINGS.mode, 'disabled');
    });

    it('unsupported stored mode normalizes to disabled', () => {
        assert.equal(normalizeWhatsAppAiMode('ai'), 'disabled');
        assert.equal(normalizeWhatsAppAiMode('live'), 'disabled');
    });
});

describe('whatsappAi phase1a.1 knowledge permissions', () => {
    it('approve-only can pass list/read gate', async () => {
        const mw = requireAnyPermission([
            WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_MANAGE,
            WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_APPROVE,
        ]);
        const user = userWithPerms([WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_APPROVE]);
        assert.equal(await invokeMiddleware(mw, { user }), 'next');
    });

    it('approve-only cannot create/edit/submit/activate', () => {
        const user = userWithPerms([WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_APPROVE]);
        assert.throws(
            () => checkPermission(WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_MANAGE)({ user }, {}, () => {}),
            (err) => err.statusCode === 403,
        );
    });

    it('manage-only can create/edit/submit gate and cannot approve/reject', () => {
        const user = userWithPerms([WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_MANAGE]);
        let passed = false;
        checkPermission(WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_MANAGE)({ user }, {}, () => { passed = true; });
        assert.equal(passed, true);
        assert.throws(
            () => checkPermission(WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_APPROVE)({ user }, {}, () => {}),
            (err) => err.statusCode === 403,
        );
    });

    it('approve permission can approve/reject', () => {
        const user = userWithPerms([WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_APPROVE]);
        let passed = false;
        checkPermission(WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_APPROVE)({ user }, {}, () => { passed = true; });
        assert.equal(passed, true);
    });

    it('activation remains on manage (route + FE design)', () => {
        const routeSrc = fs.readFileSync(path.join(moduleDir, 'routes', 'whatsappAi.routes.js'), 'utf8');
        assert.match(routeSrc, /\/knowledge\/:id\/activate[\s\S]{0,200}KNOWLEDGE_MANAGE/);
        assert.match(routeSrc, /\/knowledge\/:id\/deactivate[\s\S]{0,200}KNOWLEDGE_MANAGE/);
        const listLayer = whatsappAiRouter.stack.find(
            (l) => l.route && l.route.path === '/knowledge' && l.route.methods.get,
        );
        assert.ok(listLayer);
    });

    it('no knowledge permission receives 403 on list gate', async () => {
        const mw = requireAnyPermission([
            WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_MANAGE,
            WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_APPROVE,
        ]);
        const user = userWithPerms([WHATSAPP_AI_PERMISSIONS.VIEW]);
        await assert.rejects(
            () => invokeMiddleware(mw, { user }),
            (err) => err.statusCode === 403,
        );
    });
});

describe('whatsappAi phase1a.1 cleanup', () => {
    it('customer-memory comment has no mojibake', () => {
        const src = fs.readFileSync(
            path.join(moduleDir, 'models', 'WhatsAppAICustomerMemory.model.js'),
            'utf8',
        );
        assert.match(src, /Approved structured context only/);
        assert.equal(src.includes('\u00e2\u20ac'), false);
    });

    it('module registry includes WhatsApp AI menuIds', () => {
        const entry = MODULE_REGISTRY.find((m) => m.code === 'whatsapp_ai');
        assert.ok(entry);
        assert.ok(entry.menuIds.length > 0);
        assert.ok(entry.menuIds.includes('communication-whatsapp-ai-group'));
        assert.ok(entry.menuIds.includes('communication-whatsapp-ai-knowledge'));
        assert.ok(entry.menuIds.includes('communication-whatsapp-ai-settings'));
    });
});
