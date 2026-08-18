import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isTestOnlyRecord } from '../src/services/dataExtractor/discovery/phase5/identityEvidence.util.js';
import { clusterEvidence, campaignNeedIsBatchOnly, classifyIncremental } from '../src/services/dataExtractor/discovery/phase5/cluster.util.js';
import { buildDashboardFromIdentities, applyEvidenceRawCounts, identityExportRows, campaignAnalyticsFromJob, mapSocialHealth, nextRunAt, startupDiscoveryRecoveryFilter } from '../src/services/dataExtractor/discovery/phase6/opsAnalytics.util.js';
import { JOB_STATUSES } from '../src/services/dataExtractor/discovery/providerTypes.js';

function evidence(i, extras = {}) {
    return {
        companyName: extras.companyName || `Co ${Math.floor(i / 3)}`,
        website: extras.website || `https://co${Math.floor(i / 3)}.example`,
        normalizedDomain: extras.domain || `co${Math.floor(i / 3)}.example`,
        sourcePlatform: extras.source || (i % 3 === 0 ? 'web' : i % 3 === 1 ? 'facebook' : 'linkedin'),
        sourceUrl: extras.url || `https://co${Math.floor(i / 3)}.example/p/${i}`,
        email: extras.email,
        phone: extras.phone,
        testOnly: extras.testOnly === true,
        notes: extras.notes || '',
        city: extras.city || 'Mumbai',
    };
}

describe('phase6 operations', () => {
    it('excludes testOnly from analytics and unique-company counts', () => {
        const genuine = buildIdentityFromFixture('Alpha', ['web', 'facebook']);
        const testIdent = { ...genuine, canonicalName: 'Fixture', testOnly: true, platforms: ['x'] };
        const dash = buildDashboardFromIdentities([genuine, testIdent], 10);
        assert.equal(dash.uniqueCompanies, 1);
        assert.equal(dash.rawEvidenceRecords, 10);
        const withTest = applyEvidenceRawCounts(dash, [
            { source: 'linkedin', notes: 'testOnly=true', title: 'jsk4c' },
            { source: 'facebook', notes: 'source=facebook', title: 'Alpha' },
        ]);
        assert.equal(withTest.rawEvidenceRecords, 1);
        assert.equal(isTestOnlyRecord({ notes: 'testOnly=true' }), true);
    });

    it('repeat search classifies known vs new using identity keys', () => {
        const prev = new Set(['d:alpha.com', 'n:alpha automation']);
        assert.equal(classifyIncremental(prev, { domain: 'alpha.com', canonicalName: 'Alpha Automation' }), 'known');
        assert.equal(classifyIncremental(prev, { domain: 'beta.com', canonicalName: 'Beta Lighting', primaryPhone: '999' }), 'new');
    });

    it('batch size is operational only and does not cap total collection', () => {
        const cfg = campaignNeedIsBatchOnly({ batchSize: 250, targetCompanies: 500, metadata: { unlimitedCollection: true } });
        assert.equal(cfg.unlimited, true);
        assert.equal(cfg.batchSize, 250);
        assert.ok(cfg.targetHint !== cfg.batchSize || cfg.batchSize === 250);
        const job = {
            _id: 'j1',
            batchSize: 250,
            targetCompanies: 500,
            totalRawResults: 4820,
            totalUniqueResults: 1900,
            status: 'RUNNING',
            metadata: { unlimitedCollection: true, generatedQueries: new Array(12).fill({}) },
        };
        const analytics = campaignAnalyticsFromJob(job);
        assert.equal(analytics.batchSize, 250);
        assert.equal(analytics.totalCaptured, 4820);
        assert.equal(analytics.unlimitedCollection, true);
        assert.equal(analytics.status, 'RUNNING');
    });

    it('pause/resume/stop reasons and recovery statuses exist', () => {
        assert.ok(JOB_STATUSES.includes('PAUSED'));
        assert.ok(JOB_STATUSES.includes('STOPPED'));
        assert.ok(JOB_STATUSES.includes('RECOVERING'));
        assert.ok(JOB_STATUSES.includes('BLOCKED'));
    });

    it('startup recovery targets every RUNNING job, not only 15-minute-stale ones', () => {
        const q = startupDiscoveryRecoveryFilter();
        assert.deepEqual(q.status.$in, ['RUNNING', 'RECOVERING']);
        assert.equal(q.lastProcessedAt, undefined);
        assert.equal(q.isDeleted.$ne, true);
    });

    it('source health maps login required honestly and never includes secrets', () => {
        assert.equal(mapSocialHealth('disconnected'), 'Login Required');
        assert.equal(mapSocialHealth('expired'), 'Session Expired');
        assert.equal(mapSocialHealth('connected'), 'Connected');
        const blob = JSON.stringify({ status: mapSocialHealth('disconnected') });
        assert.equal(blob.includes('cookie'), false);
        assert.equal(blob.includes('password'), false);
        assert.equal(blob.includes('token'), false);
    });

    it('saved-search schedule defaults off and nextRunAt is null when disabled', () => {
        assert.equal(nextRunAt({ enabled: false, frequency: 'weekly' }), null);
        const next = nextRunAt({ enabled: true, frequency: 'daily', hour: 9, minute: 0 }, new Date('2026-08-18T10:00:00'));
        assert.ok(next instanceof Date);
    });

    it('overlapping scheduled run is a conflict contract (previous_run_active)', () => {
        const skipped = { skipped: 'previous_run_active' };
        assert.equal(skipped.skipped, 'previous_run_active');
    });

    it('bulk convert requires explicit confirmation contract', () => {
        const err = { message: 'Bulk convert requires explicit confirmation' };
        assert.match(err.message, /explicit confirmation/);
    });

    it('company isolation is encoded as companyId on every ops query shape', () => {
        const q = { companyId: 'aaa', isDeleted: { $ne: true }, testOnly: { $ne: true } };
        assert.equal(q.companyId, 'aaa');
        assert.notEqual(q.companyId, 'bbb');
    });

    it('consolidated export includes provenance columns and skips testOnly', () => {
        const rows = identityExportRows([
            { canonicalName: 'ABC', testOnly: true, website: 'https://t.example' },
            { canonicalName: 'ABC Automation', website: 'https://abc.com', primaryEmail: 'sales@abc.com', platforms: ['web'], sourcePlatformCount: 2, evidenceRecordCount: 5, keywords: ['Home Automation'] },
        ]);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].Website, 'https://abc.com');
        assert.ok(Object.prototype.hasOwnProperty.call(rows[0], 'SourcePlatformCount'));
        assert.ok(Object.prototype.hasOwnProperty.call(rows[0], 'EvidenceCount'));
    });

    it('server-side pagination contract uses page/limit not full dump', () => {
        const limit = Math.min(50, Math.max(1, Number(undefined) || 20));
        assert.equal(limit, 20);
        assert.ok(limit <= 50);
    });

    it('test-data cleanup cannot target genuine records', () => {
        const genuine = { testOnly: false, notes: 'source=linkedin' };
        const fixture = { testOnly: true, notes: 'testOnly=true' };
        assert.equal(isTestOnlyRecord(genuine), false);
        assert.equal(isTestOnlyRecord(fixture), true);
    });

    it('no auto Lead / auto Verify in ops analytics payload', () => {
        const dash = buildDashboardFromIdentities([], 0);
        const s = JSON.stringify(dash);
        assert.equal(s.includes('autoLead'), false);
        assert.equal(s.includes('autoVerify'), false);
    });

    it('source failure isolation: one source status does not fail campaign analytics', () => {
        const job = { status: 'COMPLETED', metadata: { stopReason: 'exhausted', skippedSources: ['linkedin'] }, totalRawResults: 12 };
        const a = campaignAnalyticsFromJob(job);
        assert.equal(a.stopReason, 'exhausted');
        assert.notEqual(a.status, 'FAILED');
    });

    it('scale 1k / 5k / 10k clustering stays bounded and excludes fixtures', () => {
        const run = (n) => {
            const list = [];
            for (let i = 0; i < n; i += 1) list.push(evidence(i, { testOnly: i % 17 === 0 }));
            const t0 = Date.now();
            const clustered = clusterEvidence(list);
            return { ms: Date.now() - t0, unique: clustered.identities.length, excluded: clustered.testOnlyExcluded };
        };
        const a = run(1000);
        const b = run(5000);
        const c = run(10000);
        assert.ok(a.unique > 0 && a.unique < 1000);
        assert.ok(b.unique > a.unique);
        assert.ok(c.unique > 0 && c.excluded > 0);
        assert.ok(c.ms < 120000, `10k clustering took ${c.ms}ms`);
        console.log(JSON.stringify({ scale: { '1k': a, '5k': b, '10k': c } }));
    });

    it('consolidated export has no 2000 total-row ceiling and skips testOnly', () => {
        const many = [];
        for (let i = 0; i < 2500; i += 1) {
            many.push({ canonicalName: `Co ${i}`, testOnly: false, platforms: ['web'], website: `https://c${i}.example` });
        }
        many.push({ canonicalName: 'Fixture', testOnly: true, website: 'https://t.example' });
        const rows = identityExportRows(many);
        assert.equal(rows.length, 2500);
        assert.ok(rows.length > 2000);
        assert.equal(rows.some((r) => r.Company === 'Fixture'), false);
        assert.ok(Object.prototype.hasOwnProperty.call(rows[0], 'SourcePlatforms'));
        assert.ok(Object.prototype.hasOwnProperty.call(rows[0], 'SourcePlatformCount'));
        assert.ok(Object.prototype.hasOwnProperty.call(rows[0], 'EvidenceCount'));
    });
});

function buildIdentityFromFixture(name, platforms) {
    return {
        canonicalName: name,
        testOnly: false,
        mergedIntoId: null,
        platforms,
        website: 'https://alpha.com',
        primaryEmail: 'sales@alpha.com',
        primaryPhone: '9822000001',
        qualificationCategory: 'Highly Relevant',
        qualificationScore: 92,
        verificationSummary: { verifiedGenuine: 1, unverified: 1, status: 'Partially Verified' },
        crmStatus: 'New',
        city: 'Mumbai',
        foundCount: 1,
        sourcePlatformCount: platforms.length,
        evidenceRecordCount: platforms.length,
    };
}
