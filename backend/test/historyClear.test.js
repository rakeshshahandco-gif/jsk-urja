import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    assertHistoryClearAdmin,
    buildCaptureFilter,
    identityHasRemainingEvidence,
    isProtectedIdentity,
} from '../src/services/dataExtractor/discovery/phase6/historyClear.service.js';

const COMPANY = '6a167e78c0ba07a3270cc101';

describe('extractor history clear safety', () => {
    it('rejects non-admin users', () => {
        assert.throws(() => assertHistoryClearAdmin({ roleName: 'staff' }), /Only admin/);
        assert.doesNotThrow(() => assertHistoryClearAdmin({ roleName: 'admin' }));
        assert.doesNotThrow(() => assertHistoryClearAdmin({ roleName: 'superadmin' }));
    });

    it('facebook_all only targets facebook captures', () => {
        const { mongo, sources } = buildCaptureFilter(COMPANY, { scope: 'facebook_all' });
        assert.equal(mongo.source, 'facebook');
        assert.deepEqual(sources, ['facebook']);
        assert.equal(mongo.$and, undefined);
    });

    it('facebook_current filters keyword and location', () => {
        const { mongo } = buildCaptureFilter(COMPANY, {
            scope: 'facebook_current',
            keyword: 'Home Automation',
            location: 'Mumbai',
        });
        assert.equal(mongo.source, 'facebook');
        assert.ok(Array.isArray(mongo.$and));
        assert.equal(mongo.$and.length, 2);
    });

    it('instagram and web scopes do not include facebook', () => {
        const ig = buildCaptureFilter(COMPANY, { scope: 'instagram' });
        const web = buildCaptureFilter(COMPANY, { scope: 'web' });
        assert.equal(ig.mongo.source, 'instagram');
        assert.ok(web.mongo.source.$in.includes('google'));
        assert.ok(!web.mongo.source.$in.includes('facebook'));
    });

    it('protects converted and verified identities', () => {
        assert.equal(isProtectedIdentity({ promotedExtractedLeadId: 'abc' }), true);
        assert.equal(isProtectedIdentity({ crmStatus: 'Converted to Lead' }), true);
        assert.equal(isProtectedIdentity({ verificationSummary: { verifiedGenuine: 1 } }), true);
        assert.equal(isProtectedIdentity({ canonicalName: 'Home automation' }), false);
    });

    it('facebook_all ignores keyword unless matchKeyword is on', () => {
        const unfiltered = buildCaptureFilter(COMPANY, {
            scope: 'facebook_all',
            keyword: 'Home Automation',
            location: 'Mumbai',
        });
        assert.equal(unfiltered.mongo.$and, undefined);
        const matching = buildCaptureFilter(COMPANY, {
            scope: 'facebook_all',
            keyword: 'Home Automation',
            matchKeyword: true,
        });
        assert.ok(Array.isArray(matching.mongo.$and));
    });

    it('keeps protected records when includeProtected is not true', () => {
        assert.equal(isProtectedIdentity({ promotedExtractedLeadId: 'x' }), true);
        assert.equal(isProtectedIdentity({ verificationSummary: { verifiedGenuine: 2 } }), true);
    });

    it('does not treat a facebook group identity as remaining evidence', () => {
        const ident = {
            canonicalName: 'Homey pro',
            sourceRefs: [],
            social: { facebookUrl: 'https://www.facebook.com/groups/123' },
        };
        assert.equal(identityHasRemainingEvidence(ident), false);
        assert.equal(identityHasRemainingEvidence({
            ...ident,
            primaryPhone: '+91 99232 88899',
        }), true);
    });
});
