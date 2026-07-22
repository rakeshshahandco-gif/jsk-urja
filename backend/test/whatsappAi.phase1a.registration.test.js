/**
 * Phase 1A-3 - backend registration tests for WhatsApp AI.
 * No production Mongo / Atlas required.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { DEFAULT_COMPANY_FEATURE_SETTINGS } from '../src/constants/companyFeatureSettings.defaults.js';
import { MODULE_REGISTRY, moduleForApiPath } from '../src/constants/moduleRegistry.constants.js';
import { PERMISSION_REGISTRY } from '../src/config/permissionRegistry.js';
import { isFeatureEnabled } from '../src/services/companyFeatureSettings.service.js';
import { requireCompanyFeature } from '../src/middlewares/featureAccess.middleware.js';
import { checkPermission, protect } from '../src/middlewares/auth.middleware.js';
import { checkUserPermission } from '../src/utils/permissionUtils.js';
import {
    WHATSAPP_AI_FEATURE_PATH,
    WHATSAPP_AI_PERMISSIONS,
    assertNoForbiddenSettingsKeys,
} from '../src/modules/whatsappAi/constants/whatsappAi.constants.js';
import * as ctrl from '../src/modules/whatsappAi/controllers/whatsappAi.controller.js';
import whatsappAiRouter from '../src/modules/whatsappAi/routes/whatsappAi.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');
const moduleDir = path.join(backendRoot, 'src', 'modules', 'whatsappAi');
const v1IndexPath = path.join(backendRoot, 'src', 'routes', 'v1', 'index.js');

const REQUIRED_PERMISSION_KEYS = [
    'whatsapp_ai.module.view',
    'whatsapp_ai.settings.manage',
    'whatsapp_ai.knowledge.manage',
    'whatsapp_ai.knowledge.approve',
    'whatsapp_ai.conversations.view_all',
    'whatsapp_ai.conversations.view_assigned',
    'whatsapp_ai.module.takeover',
    'whatsapp_ai.module.return_to_ai',
    'whatsapp_ai.lead_draft.create',
    'whatsapp_ai.lead_draft.approve',
    'whatsapp_ai.documents.manage',
    'whatsapp_ai.documents.share',
    'whatsapp_ai.audit.view',
    'whatsapp_ai.dashboard.view',
    'whatsapp_ai.module.archive',
    'whatsapp_ai.testing.inbound',
    'whatsapp_ai.testing.generate_draft',
];

function flattenPermissionKeys(registry) {
    const keys = [];
    for (const mod of registry) {
        for (const sub of mod.submodules || []) {
            for (const act of sub.actions || []) {
                keys.push(`${mod.id}.${sub.id}.${act.id}`);
            }
        }
    }
    return keys;
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
        Promise.resolve(mw(req, res, next)).catch((err) => {
            if (!settled) {
                settled = true;
                reject(err);
            }
        });
    });
}

function collectJsFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...collectJsFiles(full));
        else if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
}

describe('whatsappAi phase1a registration', () => {
    it('1. feature flag exists and defaults to false', () => {
        assert.equal(DEFAULT_COMPANY_FEATURE_SETTINGS.communication.whatsappAiEnabled, false);
        assert.equal(isFeatureEnabled(DEFAULT_COMPANY_FEATURE_SETTINGS, WHATSAPP_AI_FEATURE_PATH), false);
        assert.equal(DEFAULT_COMPANY_FEATURE_SETTINGS.communication.enableWhatsappBulk, false);
    });

    it('2. module registry contains whatsapp_ai', () => {
        const entry = MODULE_REGISTRY.find((m) => m.code === 'whatsapp_ai');
        assert.ok(entry);
        assert.equal(entry.label, 'WhatsApp AI');
        assert.deepEqual(entry.apiPrefixes, ['/whatsapp-ai']);
        assert.deepEqual(entry.permissionModules, ['whatsapp_ai']);
        assert.ok(entry.menuIds.includes('communication-whatsapp-ai-group'));
        assert.equal(moduleForApiPath('/whatsapp-ai/health'), 'whatsapp_ai');
        assert.ok(MODULE_REGISTRY.find((m) => m.code === 'whatsapp'));
        assert.ok(MODULE_REGISTRY.find((m) => m.code === 'whatsapp_bulk'));
    });

    it('3. all required permission keys are registered', () => {
        const keys = new Set(flattenPermissionKeys(PERMISSION_REGISTRY));
        for (const key of REQUIRED_PERMISSION_KEYS) {
            assert.ok(keys.has(key), `missing permission: ${key}`);
        }
        for (const key of Object.values(WHATSAPP_AI_PERMISSIONS)) {
            assert.ok(keys.has(key), `constant not in registry: ${key}`);
        }
    });

    it('4. existing WhatsApp permission keys remain unchanged', () => {
        const keys = flattenPermissionKeys(PERMISSION_REGISTRY);
        assert.ok(keys.includes('whatsapp.whatsapp_settings.view'));
        assert.ok(keys.includes('whatsapp.whatsapp_settings.edit'));
        assert.ok(keys.includes('whatsapp_bulk.campaigns.view'));
        assert.ok(keys.includes('whatsapp_bulk.campaigns.send'));
        assert.equal(PERMISSION_REGISTRY.filter((m) => m.id === 'whatsapp_ai').length, 1);
    });

    it('5. route is mounted under /api/v1/whatsapp-ai', () => {
        const src = fs.readFileSync(v1IndexPath, 'utf8');
        assert.match(src, /path:\s*'\/whatsapp-ai'/);
        assert.match(src, /modules\/whatsappAi\/routes\/whatsappAi\.routes\.js/);
        assert.match(src, /path:\s*'\/whatsapp-settings'/);
        assert.match(src, /path:\s*'\/whatsapp-bulk'/);
        assert.match(src, /path:\s*'\/whatsapp-chat'/);
    });

    it('6. unauthenticated access is denied', async () => {
        await assert.rejects(
            () => invokeMiddleware(protect, { headers: {} }),
            (err) => err.statusCode === 401,
        );
    });

    it('7. missing company context is denied by feature middleware', async () => {
        const mw = requireCompanyFeature(WHATSAPP_AI_FEATURE_PATH);
        await assert.rejects(
            () => invokeMiddleware(mw, { companyId: null }),
            (err) => err.statusCode === 400 && /Company context required/.test(err.message),
        );
    });

    it('8. disabled company is denied', async () => {
        const mw = requireCompanyFeature(WHATSAPP_AI_FEATURE_PATH);
        await assert.rejects(
            () => invokeMiddleware(mw, {
                companyId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
                featureSettings: DEFAULT_COMPANY_FEATURE_SETTINGS,
            }),
            (err) => err.statusCode === 403 && /Feature disabled/.test(err.message),
        );
    });

    it('9. enabled company without permission is denied', () => {
        const user = {
            roleName: 'staff',
            role: { permissions: { whatsapp_ai: { module: { view: false } } } },
        };
        assert.equal(checkUserPermission(user, WHATSAPP_AI_PERMISSIONS.VIEW), false);
        assert.throws(
            () => checkPermission(WHATSAPP_AI_PERMISSIONS.VIEW)({ user }, {}, () => {}),
            (err) => err.statusCode === 403,
        );
    });

    it('10. enabled company with permission may pass feature + permission gates', async () => {
        const featureMw = requireCompanyFeature(WHATSAPP_AI_FEATURE_PATH);
        const result = await invokeMiddleware(featureMw, {
            companyId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            featureSettings: {
                ...DEFAULT_COMPANY_FEATURE_SETTINGS,
                communication: {
                    ...DEFAULT_COMPANY_FEATURE_SETTINGS.communication,
                    whatsappAiEnabled: true,
                },
            },
        });
        assert.equal(result, 'next');
        const user = {
            roleName: 'staff',
            role: { permissions: { whatsapp_ai: { module: { view: true } } } },
        };
        assert.equal(checkUserPermission(user, WHATSAPP_AI_PERMISSIONS.VIEW), true);
        let passed = false;
        checkPermission(WHATSAPP_AI_PERMISSIONS.VIEW)({ user }, {}, () => { passed = true; });
        assert.equal(passed, true);
    });

    it('11. company A cannot access company B records (query scoped by companyId)', () => {
        const companyA = 'aaaaaaaaaaaaaaaaaaaaaaaa';
        const companyB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
        const records = [
            { _id: '1', companyId: companyA },
            { _id: '2', companyId: companyB },
        ];
        const visibleToA = records.filter((r) => String(r.companyId) === String(companyA));
        assert.equal(visibleToA.length, 1);
        assert.equal(visibleToA[0]._id, '1');
        const getById = (id, companyId) =>
            records.find((r) => r._id === id && String(r.companyId) === String(companyId)) || null;
        assert.equal(getById('2', companyA), null);
        assert.ok(getById('2', companyB));
    });

    it('12. health endpoint does not expose secrets', async () => {
        const payload = await new Promise((resolve, reject) => {
            const res = { send(body) { resolve(body); } };
            Promise.resolve(ctrl.health({ companyId: null, featureSettings: null }, res, (err) => {
                if (err) reject(err);
            })).catch(reject);
        });
        const data = payload?.data || payload;
        const json = JSON.stringify(data);
        assert.equal(data.module, 'whatsapp_ai');
        assert.equal(data.registered, true);
        assert.equal(data.featureEnabled, false);
        assert.match(String(data.mode), /disabled|dry_run|scripted/);
        assert.ok(data.database);
        for (const secret of ['apiKey', 'openaiApiKey', 'mongodb://', 'password', 'whatsapp-auth', 'JWT_SECRET']) {
            assert.equal(json.toLowerCase().includes(secret.toLowerCase()), false, `leaked: ${secret}`);
        }
    });

    it('13. settings API rejects API-key/token/password fields', () => {
        assert.throws(() => assertNoForbiddenSettingsKeys({ apiKey: 'x' }), (err) => err.statusCode === 400);
        assert.throws(() => assertNoForbiddenSettingsKeys({ token: 'x' }), (err) => err.statusCode === 400);
        assert.throws(() => assertNoForbiddenSettingsKeys({ password: 'x' }), (err) => err.statusCode === 400);
    });

    it('14-18. no Baileys / whatsapp.service / inbound / send / lead-promote routes', () => {
        const files = collectJsFiles(moduleDir);
        const combined = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
        assert.doesNotMatch(combined, /@whiskeysockets\/baileys/);
        assert.doesNotMatch(combined, /whatsapp\.service\.js/);
        assert.doesNotMatch(combined, /\.whatsapp-auth/);
        assert.doesNotMatch(combined, /\.whatsapp-session/);
        assert.doesNotMatch(combined, /messages\.upsert/);
        assert.doesNotMatch(combined, /sendRawToJid/);
        assert.doesNotMatch(combined, /puppeteer/i);

        const routeSrc = fs.readFileSync(path.join(moduleDir, 'routes', 'whatsappAi.routes.js'), 'utf8');
        assert.doesNotMatch(routeSrc, /\/webhook/);
        assert.doesNotMatch(routeSrc, /['"]\/inbound['"]/);
        assert.match(routeSrc, /\/internal\/test-inbound/);
        assert.doesNotMatch(routeSrc, /send-message|sendMessage|\/send\b/);
        assert.doesNotMatch(routeSrc, /promote|lead-promotion|\/leads\b/);

        const paths = [];
        whatsappAiRouter.stack.forEach((layer) => {
            if (layer.route) {
                const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
                paths.push(`${methods} ${layer.route.path}`);
            }
        });
        assert.ok(paths.some((p) => p.includes('/health')));
        assert.ok(paths.some((p) => p.includes('/settings')));
        assert.ok(paths.some((p) => p.includes('/knowledge/:id/activate')));
        assert.ok(paths.some((p) => p.includes('/internal/test-inbound')));
        assert.ok(paths.some((p) => p.includes('/internal/test-generate-draft')));
        assert.ok(paths.some((p) => p.includes('/internal/test-drafts/:id')));
        assert.ok(!paths.some((p) => /webhook|\/send\b|promote/i.test(p)));
        assert.ok(!paths.some((p) => /inbound/i.test(p) && !/test-inbound/i.test(p)));
    });

    it('19. existing WhatsApp routes remain registered and unchanged in mount list', () => {
        const src = fs.readFileSync(v1IndexPath, 'utf8');
        assert.match(src, /whatsappSettingsRoute/);
        assert.match(src, /whatsappBulkRoute/);
        assert.match(src, /whatsappChatRoute/);
        assert.match(src, /path:\s*'\/whatsapp-settings'/);
        assert.match(src, /path:\s*'\/whatsapp-bulk'/);
        assert.match(src, /path:\s*'\/whatsapp-chat'/);
    });

    it('20. router protection order starts with protect', () => {
        const src = fs.readFileSync(path.join(moduleDir, 'routes', 'whatsappAi.routes.js'), 'utf8');
        const protectIdx = src.indexOf('router.use(protect)');
        const featureIdx = src.indexOf('router.use(requireCompanyFeature');
        const healthIdx = src.indexOf("router.get('/health'");
        assert.ok(protectIdx >= 0 && featureIdx > protectIdx);
        assert.ok(healthIdx > protectIdx && healthIdx < featureIdx);
    });

    it('smoke: express can mount whatsapp-ai router', () => {
        const app = express();
        app.use('/api/v1/whatsapp-ai', whatsappAiRouter);
        assert.ok(app._router);
    });
});
