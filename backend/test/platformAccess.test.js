import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    isPlatformAdminUser,
    isPlatformApiPath,
    PLATFORM_MENU_IDS,
} from '../src/constants/platformAccess.constants.js';

describe('platformAccess.constants', () => {
    it('identifies superadmin as platform admin', () => {
        assert.equal(isPlatformAdminUser({ roleName: 'superadmin' }), true);
        assert.equal(isPlatformAdminUser({ role: { name: 'SuperAdmin' } }), true);
    });

    it('rejects client admin and normal users', () => {
        assert.equal(isPlatformAdminUser({ roleName: 'admin' }), false);
        assert.equal(isPlatformAdminUser({ roleName: 'viewer' }), false);
        assert.equal(isPlatformAdminUser(null), false);
    });

    it('blocks platform API prefixes for non-platform routes', () => {
        assert.equal(isPlatformApiPath('/module-allocation/companies/abc'), true);
        assert.equal(isPlatformApiPath('/industry-templates'), true);
        assert.equal(isPlatformApiPath('/platform-feature-settings'), true);
        assert.equal(isPlatformApiPath('/companies'), false);
        assert.equal(isPlatformApiPath('/users'), false);
    });

    it('lists platform menu ids', () => {
        assert.ok(PLATFORM_MENU_IDS.has('saas-admin'));
        assert.ok(PLATFORM_MENU_IDS.has('company-module-allocation'));
        assert.ok(!PLATFORM_MENU_IDS.has('sales'));
    });
});
