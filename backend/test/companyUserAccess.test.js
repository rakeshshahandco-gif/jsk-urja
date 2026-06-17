import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    hasLegacyCompanyAccess,
    canUserAccessCompany,
    mongooseFilterUsersForCompany,
} from '../src/services/companyUserAccess.service.js';

describe('companyUserAccess.service', () => {
    it('legacy JSK user has access to all companies', () => {
        const user = { roleName: 'admin', companyAccessConfigured: false };
        assert.equal(hasLegacyCompanyAccess(user), true);
        assert.equal(canUserAccessCompany(user, '6a167e78c0ba07a3270cc101'), true);
    });

    it('handloom-only user cannot access JSK company', () => {
        const user = {
            roleName: 'admin',
            companyAccessConfigured: true,
            assignedCompanyIds: ['6a2a4a2f7125d95411650c04'],
        };
        assert.equal(canUserAccessCompany(user, '6a2a4a2f7125d95411650c04'), true);
        assert.equal(canUserAccessCompany(user, '6a167e78c0ba07a3270cc101'), false);
    });

    it('user filter includes legacy and assigned users', () => {
        const filter = mongooseFilterUsersForCompany('6a2a4a2f7125d95411650c04');
        assert.ok(filter.$or);
        assert.equal(filter.$or.length, 3);
    });
});