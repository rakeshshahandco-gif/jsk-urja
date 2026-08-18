import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMergePair } from '../src/services/dataExtractor/discovery/phase2/smartMerge.util.js';
import {
    isTestOnlyRecord,
    collapseUrlDuplicates,
    rawCaptureToEvidence,
    previewRecordToEvidence,
    classifySourcePlatform,
} from '../src/services/dataExtractor/discovery/phase5/identityEvidence.util.js';
import {
    selectCanonicalName,
    selectEmails,
    selectPhones,
    selectPrimaryWebsite,
    countSourcePlatforms,
    verificationSummary,
    buildIdentityFromMembers,
} from '../src/services/dataExtractor/discovery/phase5/fieldSelect.util.js';
import { clusterEvidence, campaignNeedIsBatchOnly, mergeTwoIdentities } from '../src/services/dataExtractor/discovery/phase5/cluster.util.js';

describe('phase5 cross-source consolidation', () => {
    it('same domain → high confidence auto-consolidation', () => {
        const web = {
            companyName: 'ABC Automation Pvt Ltd',
            website: 'https://abcautomation.com',
            normalizedDomain: 'abcautomation.com',
            sourcePlatform: 'web',
            sourceUrl: 'https://abcautomation.com/about',
            kind: 'discovery_preview',
        };
        const fb = {
            companyName: 'ABC Automation Mumbai',
            website: 'https://abcautomation.com',
            normalizedDomain: 'abcautomation.com',
            sourcePlatform: 'facebook',
            sourceUrl: 'https://www.facebook.com/abcautomation',
            socialLinks: { facebook: 'https://www.facebook.com/abcautomation' },
            kind: 'raw_capture',
        };
        const scored = scoreMergePair(web, fb);
        assert.ok(scored.mergeConfidence >= 95, `got ${scored.mergeConfidence}`);
        const clustered = clusterEvidence([web, fb]);
        assert.equal(clustered.identities.length, 1);
        assert.equal(clustered.identities[0].sourcePlatformCount, 2);
        assert.ok(clustered.identities[0].evidenceRecordCount >= 2);
    });

    it('same phone + city + similar name → strong confidence', () => {
        const a = { companyName: 'ABC Automation', phone: '9822000001', city: 'Mumbai', sourcePlatform: 'web', sourceUrl: 'https://a.example/a' };
        const b = { companyName: 'ABC Smart Automation', phone: '9822000001', city: 'Mumbai', sourcePlatform: 'indiamart', sourceUrl: 'https://www.indiamart.com/abc' };
        const scored = scoreMergePair(a, b);
        assert.ok(scored.mergeConfidence >= 75, `got ${scored.mergeConfidence}`);
    });

    it('same name only with different domain/phone/city → keep separate', () => {
        const a = { companyName: 'ABC Automation Mumbai', website: 'https://abc-mumbai.com', normalizedDomain: 'abc-mumbai.com', phone: '9822000001', city: 'Mumbai', sourcePlatform: 'web', sourceUrl: 'https://abc-mumbai.com' };
        const b = { companyName: 'ABC Automation Pune', website: 'https://abc-pune.com', normalizedDomain: 'abc-pune.com', phone: '9822111111', city: 'Pune', sourcePlatform: 'web', sourceUrl: 'https://abc-pune.com' };
        const scored = scoreMergePair(a, b);
        assert.equal(scored.decision, 'keep_separate');
        assert.ok(scored.mergeConfidence < 75);
        const clustered = clusterEvidence([a, b]);
        assert.equal(clustered.identities.length, 2);
    });

    it('conflicting official websites reduce confidence and never auto-merge', () => {
        const a = { companyName: 'ABC Automation', website: 'https://abcautomation.in', normalizedDomain: 'abcautomation.in', phone: '9000000001', city: 'Mumbai', sourcePlatform: 'web', sourceUrl: 'https://abcautomation.in' };
        const b = { companyName: 'ABC Automation', website: 'https://abcautomation.co.in', normalizedDomain: 'abcautomation.co.in', phone: '9000000991', city: 'Pune', sourcePlatform: 'facebook', sourceUrl: 'https://facebook.com/abc' };
        const scored = scoreMergePair(a, b);
        assert.ok(scored.checks.conflict);
        assert.notEqual(scored.decision, 'auto_merge');
    });

    it('testOnly records are excluded from genuine clustering', () => {
        const genuine = { companyName: 'NUOS Home Automation', website: 'https://nuos.in', normalizedDomain: 'nuos.in', sourcePlatform: 'linkedin', sourceUrl: 'https://www.linkedin.com/company/nuos-home-automation' };
        const test = { companyName: 'NUOS Home Automation', testOnly: true, notes: 'testOnly=true', sourcePlatform: 'x', sourceUrl: 'https://x.com/jsk4c_x_fixture' };
        assert.equal(isTestOnlyRecord(test), true);
        const clustered = clusterEvidence([genuine, test]);
        assert.equal(clustered.testOnlyExcluded, 1);
        assert.equal(clustered.identities.length, 1);
        assert.equal(clustered.identities[0].platforms.includes('x'), false);
    });

    it('verified status is preserved on source refs and summary is derived', () => {
        const fb = { companyName: 'ABC', sourcePlatform: 'facebook', sourceUrl: 'https://facebook.com/abc', verificationStatus: 'verified_genuine', ownerDecision: 'verified_genuine', kind: 'raw_capture' };
        const li = { companyName: 'ABC', sourcePlatform: 'linkedin', sourceUrl: 'https://linkedin.com/company/abc', verificationStatus: 'unverified', kind: 'raw_capture', website: 'https://abcautomation.com', normalizedDomain: 'abcautomation.com' };
        const ident = buildIdentityFromMembers([fb, li], { mergeConfidence: 96 });
        assert.equal(ident.sourceRefs.find((r) => r.source === 'facebook').verificationStatus, 'verified_genuine');
        assert.equal(ident.sourceRefs.find((r) => r.source === 'linkedin').verificationStatus, 'unverified');
        assert.equal(ident.verificationSummary.status, 'Partially Verified');
    });

    it('multiple source URLs are preserved and platform vs evidence counts differ', () => {
        const members = [
            { companyName: 'ABC', sourcePlatform: 'web', sourceUrl: 'https://abc.com/a', website: 'https://abc.com', normalizedDomain: 'abc.com', evidenceRecordCount: 10 },
            { companyName: 'ABC', sourcePlatform: 'facebook', sourceUrl: 'https://facebook.com/abc' },
            { companyName: 'ABC', sourcePlatform: 'linkedin', sourceUrl: 'https://linkedin.com/company/abc' },
        ];
        const counts = countSourcePlatforms(members);
        assert.equal(counts.sourcePlatformCount, 3);
        assert.equal(counts.evidenceRecordCount, 12);
    });

    it('primary email prefers sales@ on company domain and keeps additional emails', () => {
        const members = [
            { email: 'info@abc.com', sourcePlatform: 'indiamart', sourceUrl: 'https://indiamart.com/abc', website: 'https://abc.com' },
            { email: 'sales@abc.com', sourcePlatform: 'web', sourceUrl: 'https://abc.com/contact', website: 'https://abc.com', normalizedDomain: 'abc.com' },
        ];
        const emails = selectEmails(members, 'abc.com');
        assert.equal(emails.primaryEmail, 'sales@abc.com');
        assert.ok(emails.additionalEmails.some((e) => e.value === 'info@abc.com'));
    });

    it('primary phone is stored once with multiple supporting sources', () => {
        const members = [
            { phone: '+91 98220 00001', sourcePlatform: 'facebook', sourceUrl: 'https://facebook.com/abc' },
            { phone: '9822000001', sourcePlatform: 'web', sourceUrl: 'https://abc.com/contact' },
        ];
        const phones = selectPhones(members);
        assert.equal(phones.allPhones.length, 1);
        assert.ok(phones.allPhones[0].sources.length >= 2);
    });

    it('canonical name prefers official website / legal name over social handle', () => {
        const name = selectCanonicalName([
            { companyName: 'abcsmart', sourcePlatform: 'instagram', sourceUrl: 'https://instagram.com/abcsmart' },
            { companyName: 'ABC Automation Private Limited', sourcePlatform: 'web', website: 'https://abcautomation.com', normalizedDomain: 'abcautomation.com', sourceUrl: 'https://abcautomation.com' },
            { companyName: 'ABC Automation', sourcePlatform: 'facebook', sourceUrl: 'https://facebook.com/abc' },
        ]);
        assert.match(name.canonicalName, /Private Limited/i);
    });

    it('social profiles consolidate without treating facebook as the company website', () => {
        const site = selectPrimaryWebsite([
            { companyName: 'ABC', sourcePlatform: 'facebook', sourceUrl: 'https://www.facebook.com/abc', website: 'https://www.facebook.com/abc' },
            { companyName: 'ABC', sourcePlatform: 'linkedin', sourceUrl: 'https://www.linkedin.com/company/abc', website: 'https://abcautomation.in', normalizedDomain: 'abcautomation.in' },
        ]);
        assert.equal(site.domain, 'abcautomation.in');
        assert.equal(site.website.includes('facebook'), false);
    });

    it('manual merge / keep-separate helpers do not delete source refs', () => {
        const a = buildIdentityFromMembers([{ companyName: 'A', sourcePlatform: 'web', sourceUrl: 'https://a.com', kind: 'raw_capture' }]);
        const b = buildIdentityFromMembers([{ companyName: 'B', sourcePlatform: 'facebook', sourceUrl: 'https://facebook.com/b', kind: 'raw_capture' }]);
        a._id = '1';
        b._id = '2';
        const merged = mergeTwoIdentities(a, b, { userId: 'u1', reason: 'same phone', confidence: 92 });
        assert.ok(merged.sourceRefs.length >= 2);
        assert.equal(merged.mergeHistory.at(-1).action, 'manually_merged');
        const keep = campaignNeedIsBatchOnly({ batchSize: 250, targetCompanies: 500, metadata: { unlimitedCollection: true } });
        assert.equal(keep.unlimited, true);
        assert.equal(keep.batchSize, 250);
    });

    it('does not auto-create leads and does not change RawCapture shape', () => {
        const cap = rawCaptureToEvidence({
            _id: 'c1',
            source: 'linkedin',
            title: 'NUOS Home Automation',
            resultUrlNormalized: 'https://www.linkedin.com/company/nuos-home-automation',
            notes: 'source=linkedin; mode=public_url_test',
            inboxStatus: 'new',
        });
        assert.equal(cap.inboxStatus, 'new');
        assert.equal(Object.prototype.hasOwnProperty.call(cap, 'promotedExtractedLeadId'), true);
        const prev = previewRecordToEvidence({ companyName: 'X', sourceUrl: 'https://x.com/y', sourcePlatform: 'x' }, { jobId: 'j', previewIndex: 0 });
        assert.equal(classifySourcePlatform({ url: prev.sourceUrl }), 'x');
        const payload = JSON.stringify(clusterEvidence([cap]));
        assert.equal(payload.includes('autoVerify'), false);
        assert.equal(payload.includes('convertToLeadAutomatically'), false);
    });

    it('collapses duplicate URLs before company-level review', () => {
        const list = [
            { companyName: 'ABC', sourceUrl: 'https://abc.com/about', sourcePlatform: 'web' },
            { companyName: 'ABC', sourceUrl: 'https://abc.com/about/', sourcePlatform: 'web' },
            { companyName: 'ABC', sourceUrl: 'https://abc.com/about?utm=1', sourcePlatform: 'web' },
        ];
        const collapsed = collapseUrlDuplicates(list);
        assert.equal(collapsed.length, 1);
        assert.ok(collapsed[0].evidenceRecordCount >= 2);
    });

    it('Phase 2 scoreMergePair remains compatible', () => {
        const scored = scoreMergePair(
            { companyName: 'Same Co', website: 'https://same.com', normalizedDomain: 'same.com', phone: '1111111111', city: 'Mumbai' },
            { companyName: 'Same Co', website: 'https://same.com', normalizedDomain: 'same.com', phone: '1111111111', city: 'Mumbai' },
        );
        assert.equal(scored.decision, 'auto_merge');
    });
});
