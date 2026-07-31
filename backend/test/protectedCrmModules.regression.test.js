/**
 * Protected CRM WhatsApp modules — regression suite.
 * Fails the build when approved WhatsApp modules are removed from registries,
 * routes, permissions, or sidebar configuration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    PROTECTED_CRM_MODULE_KEYS,
    PROTECTED_CRM_MODULES,
    JSK_PROTECTED_MODULE_CODES,
    JSK_PROTECTED_FEATURE_PATHS,
    applyJskProtectedCommunicationFlags,
    ensureProtectedModuleCodes,
    assertProtectedModulesNotRemoved,
} from '../src/constants/protectedCrmModules.constants.js';
import { MODULE_REGISTRY, moduleForApiPath } from '../src/constants/moduleRegistry.constants.js';
import { PERMISSION_REGISTRY } from '../src/config/permissionRegistry.js';
import { INDUSTRY_MODULE_DEFAULTS } from '../src/constants/industryModuleDefaults.js';
import { isFeatureEnabled } from '../src/services/companyFeatureSettings.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const frontendMenu = path.join(repoRoot, 'src', 'config', 'menu.config.js');
const frontendPaths = path.join(repoRoot, 'src', 'config', 'menuModuleMap.js');
const frontendApp = path.join(repoRoot, 'src', 'App.jsx');
const v1Index = path.join(__dirname, '..', 'src', 'routes', 'v1', 'index.js');

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

describe('Protected CRM WhatsApp modules', () => {
    it('registers the three protected conceptual keys', () => {
        assert.deepEqual([...PROTECTED_CRM_MODULE_KEYS].sort(), [
            'whatsapp_ai',
            'whatsapp_communication',
            'whatsapp_settings',
        ].sort());
        assert.equal(PROTECTED_CRM_MODULES.length, 3);
        for (const m of PROTECTED_CRM_MODULES) {
            assert.equal(m.protectedFromAccidentalRemoval, true);
            assert.equal(m.jskUrjaDefaultEnabled, true);
        }
    });

    it('keeps WhatsApp Communication / AI / Settings in MODULE_REGISTRY', () => {
        const codes = new Set(MODULE_REGISTRY.map((m) => m.code));
        for (const code of JSK_PROTECTED_MODULE_CODES) {
            assert.ok(codes.has(code), `MODULE_REGISTRY missing ${code}`);
        }
    });

    it('keeps protected module codes in ELECTRONICS_JSK industry defaults', () => {
        const mods = INDUSTRY_MODULE_DEFAULTS.ELECTRONICS_JSK.enabledModules;
        for (const code of JSK_PROTECTED_MODULE_CODES) {
            assert.ok(mods.includes(code), `ELECTRONICS_JSK missing ${code}`);
        }
    });

    it('registers backend WhatsApp route groups', () => {
        const indexSrc = fs.readFileSync(v1Index, 'utf8');
        for (const m of PROTECTED_CRM_MODULES) {
            for (const mount of m.backendRouteGroups) {
                assert.ok(
                    indexSrc.includes(`path: '${mount}'`) || indexSrc.includes(`path: "${mount}"`),
                    `v1 index missing route ${mount}`,
                );
            }
        }
        assert.equal(moduleForApiPath('/whatsapp-ai/settings'), 'whatsapp_ai');
        assert.equal(moduleForApiPath('/whatsapp-bulk/campaigns'), 'whatsapp_bulk');
        assert.equal(moduleForApiPath('/whatsapp-settings'), 'whatsapp');
        assert.equal(moduleForApiPath('/whatsapp-chat'), 'whatsapp');
    });

    it('keeps WhatsApp permission keys in the permission registry', () => {
        const keys = new Set(flattenPermissionKeys(PERMISSION_REGISTRY));
        const required = [
            'whatsapp.whatsapp_settings.view',
            'whatsapp.whatsapp_settings.edit',
            'whatsapp_bulk.campaigns.view',
            'whatsapp_bulk.settings.view',
            'whatsapp_ai.module.view',
            'whatsapp_ai.settings.manage',
            'whatsapp_ai.conversations.view_assigned',
            'whatsapp_ai.testing.inbound',
            'whatsapp_ai.module.takeover',
            'whatsapp_ai.audit.view',
            'whatsapp_ai.dashboard.view',
        ];
        for (const k of required) {
            assert.ok(keys.has(k), `permission registry missing ${k}`);
        }
    });

    it('forces JSK protected feature flags ON without wiping other communication keys', () => {
        const out = applyJskProtectedCommunicationFlags({
            communication: { enableEmail: true, enableWhatsappBulk: false, whatsappAiEnabled: false },
        });
        assert.equal(out.communication.enableWhatsappBulk, true);
        assert.equal(out.communication.whatsappAiEnabled, true);
        assert.equal(out.communication.enableEmail, true);
        for (const featurePath of JSK_PROTECTED_FEATURE_PATHS) {
            assert.equal(isFeatureEnabled(out, featurePath), true);
        }
    });

    it('rejects accidental removal of protected module codes', () => {
        const bad = assertProtectedModulesNotRemoved(['crm', 'whatsapp']);
        assert.equal(bad.ok, false);
        assert.ok(bad.missing.includes('whatsapp_ai'));
        assert.ok(bad.missing.includes('whatsapp_bulk'));

        const ok = assertProtectedModulesNotRemoved(
            ensureProtectedModuleCodes(['crm']),
        );
        assert.equal(ok.ok, true);

        const allowed = assertProtectedModulesNotRemoved(['crm'], {
            allowDisableProtectedModules: true,
        });
        assert.equal(allowed.ok, true);
    });

    it('keeps WhatsApp sidebar group and children in frontend menu.config.js', () => {
        const menuSrc = fs.readFileSync(frontendMenu, 'utf8');
        const requiredIds = [
            "id: 'whatsapp-root'",
            "title: 'WhatsApp'",
            "id: 'whatsapp-communication-group'",
            "title: 'WhatsApp Communication'",
            "id: 'communication-whatsapp-ai-group'",
            "title: 'WhatsApp AI'",
            "title: 'WhatsApp Settings'",
            "id: 'whatsapp'",
            "id: 'whatsapp-chat'",
        ];
        for (const needle of requiredIds) {
            assert.ok(menuSrc.includes(needle), `menu.config.js missing ${needle}`);
        }
        // No duplicate top-level WhatsApp Chat leaf outside the group
        const chatMatches = menuSrc.match(/id: 'whatsapp-chat'/g) || [];
        assert.equal(chatMatches.length, 1, 'duplicate whatsapp-chat menu ids');
        const settingsMatches = menuSrc.match(/id: 'whatsapp'/g) || [];
        assert.equal(settingsMatches.length, 1, 'duplicate whatsapp settings menu ids');
    });

    it('keeps frontend module map + App routes for WhatsApp pages', () => {
        const mapSrc = fs.readFileSync(frontendPaths, 'utf8');
        assert.ok(mapSrc.includes("code: 'whatsapp_ai'"));
        assert.ok(mapSrc.includes("'/communication/whatsapp-ai', 'whatsapp_ai'"));

        const appSrc = fs.readFileSync(frontendApp, 'utf8');
        assert.ok(appSrc.includes('path="/whatsapp"'));
        assert.ok(appSrc.includes('path="/whatsapp/chat"'));
        assert.ok(appSrc.includes('WHATSAPP_BULK.CAMPAIGNS'));
        assert.ok(appSrc.includes('WHATSAPP_AI.DASHBOARD'));
        assert.ok(appSrc.includes('WhatsAppAiFeatureGuard'));
    });

    it('does not let Data Extractor registry overwrite WhatsApp module codes', () => {
        const de = MODULE_REGISTRY.find((m) => m.code === 'data_extractor');
        assert.ok(de);
        assert.ok(!de.menuIds.some((id) => String(id).includes('whatsapp')));
        assert.ok(!de.apiPrefixes.some((p) => String(p).includes('whatsapp')));
    });
});
