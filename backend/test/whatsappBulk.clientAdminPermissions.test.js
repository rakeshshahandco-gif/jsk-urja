import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureClientAdminWhatsappBulkPermissions,
  ensureModulePermissions,
  isClientAdminRole,
  syncPermissionsWithRegistry,
} from '../src/utils/permission.utils.js';
import { checkUserPermission } from '../src/utils/permissionUtils.js';
import { PERMISSION_REGISTRY } from '../src/config/permissionRegistry.js';

const REQUIRED_BULK_KEYS = [
  'whatsapp_bulk.campaigns.view',
  'whatsapp_bulk.campaigns.add',
  'whatsapp_bulk.campaigns.edit',
  'whatsapp_bulk.campaigns.send',
  'whatsapp_bulk.campaigns.export',
  'whatsapp_bulk.matter_master.view',
  'whatsapp_bulk.blacklist.view',
  'whatsapp_bulk.blacklist.add',
  'whatsapp_bulk.settings.view',
  'whatsapp_bulk.settings.edit',
  'whatsapp_bulk.number_health.view',
  'whatsapp_bulk.number_health.validate',
  'whatsapp_bulk.number_health.lookup',
  'whatsapp_bulk.number_health.export',
  'whatsapp_bulk.report.view',
  'whatsapp_bulk.ai_assist.generate',
];

describe('Client Admin whatsapp_bulk permission grant', () => {
  it('registry contains whatsapp_bulk module with required submodules', () => {
    const mod = PERMISSION_REGISTRY.find((m) => m.id === 'whatsapp_bulk');
    assert.ok(mod);
    const ids = mod.submodules.map((s) => s.id);
    for (const need of ['campaigns', 'matter_master', 'blacklist', 'settings', 'number_health', 'report', 'ai_assist', 'history']) {
      assert.ok(ids.includes(need), `missing submodule ${need}`);
    }
  });

  it('ensureClientAdminWhatsappBulkPermissions fills missing keys as true', () => {
    const next = ensureClientAdminWhatsappBulkPermissions({ whatsapp_ai: { module: { view: true } } });
    assert.equal(next.whatsapp_ai.module.view, true);
    assert.equal(next.whatsapp_bulk.campaigns.view, true);
    assert.equal(next.whatsapp_bulk.campaigns.send, true);
    assert.equal(next.whatsapp_bulk.number_health.view, true);
    assert.equal(next.whatsapp_bulk.settings.edit, true);
    assert.equal(next.whatsapp_bulk.ai_assist.generate, true);
  });

  it('is idempotent', () => {
    const once = ensureClientAdminWhatsappBulkPermissions({});
    const twice = ensureClientAdminWhatsappBulkPermissions(once);
    assert.deepEqual(twice, once);
  });

  it('preserves explicit deny (false)', () => {
    const next = ensureClientAdminWhatsappBulkPermissions({
      whatsapp_bulk: { settings: { edit: false }, campaigns: { send: false } },
    });
    assert.equal(next.whatsapp_bulk.settings.edit, false);
    assert.equal(next.whatsapp_bulk.campaigns.send, false);
    assert.equal(next.whatsapp_bulk.campaigns.view, true);
    assert.equal(next.whatsapp_bulk.settings.view, true);
  });

  it('does not grant other modules when only ensuring whatsapp_bulk', () => {
    const next = ensureClientAdminWhatsappBulkPermissions({});
    assert.equal(next.sales, undefined);
    assert.equal(next.purchase, undefined);
  });

  it('isClientAdminRole matches admin only', () => {
    assert.equal(isClientAdminRole({ name: 'admin' }), true);
    assert.equal(isClientAdminRole({ name: 'Admin' }), true);
    assert.equal(isClientAdminRole({ name: 'superadmin' }), false);
    assert.equal(isClientAdminRole({ name: 'viewer' }), false);
    assert.equal(isClientAdminRole({ name: 'staff' }), false);
  });

  it('checkUserPermission: Client Admin with granted tree can access Bulk keys', () => {
    const permissions = ensureClientAdminWhatsappBulkPermissions({});
    const user = { roleName: 'admin', role: { name: 'admin', permissions } };
    for (const key of REQUIRED_BULK_KEYS) {
      assert.equal(checkUserPermission(user, key), true, key);
    }
  });

  it('checkUserPermission: Client Admin without Bulk tree is denied', () => {
    const user = {
      roleName: 'admin',
      role: { name: 'admin', permissions: { whatsapp_ai: { module: { view: true } } } },
    };
    assert.equal(checkUserPermission(user, 'whatsapp_bulk.campaigns.view'), false);
  });

  it('checkUserPermission: view-only tree cannot send/settings.edit/lookup', () => {
    const permissions = ensureModulePermissions({}, 'whatsapp_bulk', false);
    permissions.whatsapp_bulk.campaigns.view = true;
    permissions.whatsapp_bulk.matter_master.view = true;
    permissions.whatsapp_bulk.blacklist.view = true;
    permissions.whatsapp_bulk.settings.view = true;
    permissions.whatsapp_bulk.number_health.view = true;
    permissions.whatsapp_bulk.report.view = true;
    const user = { roleName: 'viewer', role: { name: 'viewer', permissions } };
    assert.equal(checkUserPermission(user, 'whatsapp_bulk.campaigns.view'), true);
    assert.equal(checkUserPermission(user, 'whatsapp_bulk.campaigns.send'), false);
    assert.equal(checkUserPermission(user, 'whatsapp_bulk.settings.edit'), false);
    assert.equal(checkUserPermission(user, 'whatsapp_bulk.number_health.lookup'), false);
    assert.equal(checkUserPermission(user, 'whatsapp_bulk.blacklist.add'), false);
  });

  it('checkUserPermission: no-bulk user remains denied', () => {
    const user = { roleName: 'staff', role: { name: 'staff', permissions: {} } };
    assert.equal(checkUserPermission(user, 'whatsapp_bulk.campaigns.view'), false);
  });

  it('checkUserPermission: superadmin still bypasses', () => {
    const user = { roleName: 'superadmin', role: { name: 'superadmin', permissions: {} } };
    assert.equal(checkUserPermission(user, 'whatsapp_bulk.campaigns.view'), true);
    assert.equal(checkUserPermission(user, 'whatsapp_bulk.number_health.lookup'), true);
  });

  it('full registry sync for admin still fills whatsapp_bulk (compat)', () => {
    const synced = syncPermissionsWithRegistry({}, true);
    assert.equal(synced.whatsapp_bulk.campaigns.view, true);
  });
});
