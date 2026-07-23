/**
 * Phase 1B: WhatsApp AI testing permission visibility (frontend resolver).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    APP_MODULES,
    hasPermission,
    nestedPermissionGrants,
    PERMISSIONS,
} from './permissions.js';
import { WHATSAPP_AI_PERMISSIONS } from '../features/whatsappAi/constants.js';

const INBOUND = WHATSAPP_AI_PERMISSIONS.TESTING_INBOUND;
const DRAFT = WHATSAPP_AI_PERMISSIONS.TESTING_GENERATE_DRAFT;
const SETTINGS_MANAGE = WHATSAPP_AI_PERMISSIONS.SETTINGS_MANAGE;

/** Mirrors WhatsAppAISettingsPage panel gates (permission only). */
function panelVisibility(userPermissions, roleName, additionalPermissions = {}, rolePermissions = {}) {
    return {
        canTestInbound: hasPermission(userPermissions, INBOUND, roleName, additionalPermissions, rolePermissions),
        canGenerateDraft: hasPermission(userPermissions, DRAFT, roleName, additionalPermissions, rolePermissions),
        canManage: hasPermission(userPermissions, SETTINGS_MANAGE, roleName, additionalPermissions, rolePermissions),
    };
}

const roleWithBothTesting = {
    whatsapp_ai: {
        settings: { manage: true },
        testing: { inbound: true, generate_draft: true },
    },
};

const roleInboundOnly = {
    whatsapp_ai: {
        testing: { inbound: true, generate_draft: false },
    },
};

const roleDraftOnly = {
    whatsapp_ai: {
        testing: { inbound: false, generate_draft: true },
    },
};

const additionalAllFalse = {
    whatsapp_ai: {
        settings: { manage: false },
        testing: { inbound: false, generate_draft: false },
    },
};

describe('whatsappAi testing permission visibility', () => {
    it('APP_MODULES includes whatsapp_ai.testing inbound and generate_draft', () => {
        const wa = APP_MODULES.find((m) => m.id === 'whatsapp_ai');
        assert.ok(wa);
        const testing = wa.submodules.find((s) => s.id === 'testing');
        assert.ok(testing);
        assert.deepEqual(testing.actions, ['inbound', 'generate_draft']);
        assert.equal(PERMISSIONS.WHATSAPP_AI_TESTING_INBOUND, INBOUND);
        assert.equal(PERMISSIONS.WHATSAPP_AI_TESTING_GENERATE_DRAFT, DRAFT);
    });

    it('1. superadmin sees both panels', () => {
        const v = panelVisibility([], 'superadmin', additionalAllFalse, {});
        assert.equal(v.canTestInbound, true);
        assert.equal(v.canGenerateDraft, true);
        assert.equal(v.canManage, true);
    });

    it('2. admin sees both panels', () => {
        const v = panelVisibility([], 'admin', additionalAllFalse, {});
        assert.equal(v.canTestInbound, true);
        assert.equal(v.canGenerateDraft, true);
        assert.equal(v.canManage, true);
    });

    it('3. role.permissions with both testing rights sees both panels', () => {
        const v = panelVisibility([], 'staff', additionalAllFalse, roleWithBothTesting);
        assert.equal(v.canTestInbound, true);
        assert.equal(v.canGenerateDraft, true);
        assert.equal(v.canManage, true);
    });

    it('4. normal user without testing permissions does not see panels', () => {
        const v = panelVisibility(
            ['customers.customer_master.view'],
            'staff',
            additionalAllFalse,
            { whatsapp_ai: { module: { view: true } } },
        );
        assert.equal(v.canTestInbound, false);
        assert.equal(v.canGenerateDraft, false);
    });

    it('5. inbound-only role sees inbound panel but not draft panel', () => {
        const v = panelVisibility([], 'staff', {}, roleInboundOnly);
        assert.equal(v.canTestInbound, true);
        assert.equal(v.canGenerateDraft, false);
    });

    it('6. generate_draft-only role sees draft panel only', () => {
        const v = panelVisibility([], 'staff', {}, roleDraftOnly);
        assert.equal(v.canTestInbound, false);
        assert.equal(v.canGenerateDraft, true);
    });

    it('7. unrelated permissions remain unchanged (customer view still works; testing still denied)', () => {
        assert.equal(
            hasPermission(['customers.customer_master.view'], 'customers.customer_master.view', 'staff'),
            true,
        );
        assert.equal(
            hasPermission(['customers.customer_master.view'], INBOUND, 'staff'),
            false,
        );
        assert.equal(
            hasPermission(['sales.sales_orders.view'], 'sales.sales_orders.delete', 'staff'),
            false,
        );
    });

    it('8. Settings Manage behaviour unchanged (array / role tree / admin)', () => {
        assert.equal(hasPermission([SETTINGS_MANAGE], SETTINGS_MANAGE, 'staff'), true);
        assert.equal(hasPermission([], SETTINGS_MANAGE, 'staff', {}, roleWithBothTesting), true);
        assert.equal(hasPermission([], SETTINGS_MANAGE, 'staff', {}, { whatsapp_ai: { module: { view: true } } }), false);
        assert.equal(hasPermission([], SETTINGS_MANAGE, 'superadmin'), true);
    });

    it('explicit additionalPermissions false does not block role.permissions true', () => {
        assert.equal(
            hasPermission([], INBOUND, 'staff', additionalAllFalse, roleInboundOnly),
            true,
        );
    });

    it('nestedPermissionGrants requires explicit true', () => {
        assert.equal(nestedPermissionGrants(roleInboundOnly, INBOUND), true);
        assert.equal(nestedPermissionGrants(roleInboundOnly, DRAFT), false);
        assert.equal(nestedPermissionGrants({ whatsapp_ai: { testing: { inbound: false } } }, INBOUND), false);
    });

    it('does not grant from username alone (no admin role, empty trees)', () => {
        assert.equal(hasPermission([], INBOUND, 'staff', {}, {}), false);
        assert.equal(hasPermission([], DRAFT, 'viewer', {}, {}), false);
    });
});
