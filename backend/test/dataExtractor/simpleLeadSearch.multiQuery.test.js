/**
 * Simple Lead Search — multi-query / next Google page (owner-driven).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { SearchQuery } from '../../src/models/searchQuery.model.js';
import { AssistedCaptureSession } from '../../src/models/assistedCaptureSession.model.js';
import { RawCapture } from '../../src/models/rawCapture.model.js';
import { buildNextGoogleResultsPageUrl, readGooglePageIndexFromUrl } from '../../src/services/dataExtractor/searchCampaign/assistedCapture/googleUrl.util.js';
import {
    startSimpleLeadSearch,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.service.js';
import {
    openNextGeneratedQuery,
    openNextGooglePage,
    skipCurrentQuery,
    markQueryComplete,
    buildCampaignProgress,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.multiQuery.service.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `SLS-MQ-${Date.now()}`;
const companyId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();

const user = {
    _id: userId,
    id: userId,
    roleName: 'staff',
    additionalPermissions: {
        data_extractor: {
            search_campaign: { view: true, manage: true },
            search_query: { view: true, manage: true, open: true, review: true, generate: true },
            raw_capture: { view: true, ingest: true, manage: true },
            assisted_capture: { view: true, start: true, manage: true },
        },
    },
};

describe('SLS multi-query helpers', () => {
    it('builds next Google page URL with start param only (no auto loop)', () => {
        const base = 'https://www.google.com/search?q=home+automation+mumbai';
        const page1 = readGooglePageIndexFromUrl(base);
        assert.equal(page1, 1);
        const next = buildNextGoogleResultsPageUrl(base, 1);
        assert.equal(next.nextPageIndex, 2);
        assert.match(next.url, /[?&]start=10/);
        const page2 = readGooglePageIndexFromUrl(next.url);
        assert.equal(page2, 2);
        const next2 = buildNextGoogleResultsPageUrl(next.url, 2);
        assert.match(next2.url, /[?&]start=20/);
    });
});

describe('SLS multi-query orchestration', () => {
    let sessionId;
    let campaignId;

    before(async () => {
        assert.match(MONGO_URI, /crm_test/);
        await mongoose.connect(MONGO_URI);
        const started = await startSimpleLeadSearch({
            companyId,
            user,
            body: {
                product: 'Home Automation',
                city: 'Mumbai',
                idempotencyKey: `${TAG}-start`,
            },
            headers: {},
        });
        sessionId = started.session._id;
        campaignId = started.campaign._id;
        assert.ok(started.queries.length >= 2);
        // Simulate Google Ready so next-page is allowed
        await AssistedCaptureSession.updateOne(
            { _id: sessionId },
            { $set: { status: 'awaiting_user', browserOpenedAcked: true, googlePageIndex: 1 } },
        );
    });

    after(async () => {
        await RawCapture.deleteMany({ companyId });
        await AssistedCaptureSession.deleteMany({ companyId });
        await SearchQuery.deleteMany({ companyId });
        await SearchCampaign.deleteMany({ companyId });
        await mongoose.disconnect();
    });

    it('open next google page queues owner-driven navigation without capturing', async () => {
        const data = await openNextGooglePage({ companyId, user, sessionId });
        assert.equal(data.session.pendingNavigationStatus, 'pending');
        assert.match(data.session.pendingNavigationTargetUrl, /start=10/);
        assert.equal(data.nextPageIndex, 2);
    });

    it('skip and mark complete update slsCaptureStatus without creating leads', async () => {
        const session = await AssistedCaptureSession.findById(sessionId).lean();
        await skipCurrentQuery({ companyId, user, sessionId });
        const skipped = await SearchQuery.findById(session.queryId).lean();
        assert.equal(skipped.slsCaptureStatus, 'skipped');

        // Reset to ready for mark complete test on same query is fine after skip; use another query via open next
        await SearchQuery.updateOne({ _id: session.queryId }, { $set: { slsCaptureStatus: 'partially_captured' } });
        const marked = await markQueryComplete({ companyId, user, sessionId });
        assert.equal(marked.slsCaptureStatus, 'completed');
        const Lead = mongoose.models.Lead;
        if (Lead) {
            assert.equal(await Lead.countDocuments({ companyId }), 0);
        }
    });

    it('open next generated query creates new session and preserves campaign captures', async () => {
        // Seed one RawCapture on campaign
        const q = await SearchQuery.findOne({ companyId, campaignId }).lean();
        await RawCapture.create({
            companyId,
            campaignId,
            queryId: q._id,
            queryScopeKey: String(q._id),
            source: 'google',
            captureMethod: 'assisted_visible',
            title: `${TAG} Co`,
            titleNormalized: `${TAG} co`,
            snippet: 'home automation',
            resultUrlOriginal: `https://${TAG}.example/a`,
            resultUrlNormalized: `https://${TAG}.example/a`,
            displayDomain: `${TAG}.example`,
            captureFingerprint: `fp-${TAG}`,
        });

        // Ensure a pending next query exists
        await SearchQuery.updateMany(
            { companyId, campaignId, _id: { $ne: q._id } },
            { $set: { slsCaptureStatus: 'pending', status: 'approved' } },
        );
        await AssistedCaptureSession.updateOne(
            { _id: sessionId },
            { $set: { status: 'awaiting_user' } },
        );

        const data = await openNextGeneratedQuery({
            companyId,
            user,
            sessionId,
            headers: {},
        });
        assert.ok(data.session._id);
        assert.notEqual(String(data.session._id), String(sessionId));
        assert.notEqual(String(data.session.queryId), String(q._id));
        const unique = await RawCapture.countDocuments({ companyId, campaignId });
        assert.equal(unique, 1);
        assert.equal(data.campaignProgress.totalCampaignUniqueRecords, 1);
        assert.ok(data.campaignProgress.queryTotal >= 2);
    });

    it('campaign progress distinguishes appearances vs unique', async () => {
        const session = await AssistedCaptureSession.findOne({ companyId }).sort({ createdAt: -1 }).lean();
        await AssistedCaptureSession.updateOne(
            { _id: session._id },
            { $set: { acceptedCount: 70, insertedCount: 20, updatedExistingCount: 50 } },
        );
        const progress = await buildCampaignProgress({
            companyId,
            campaignId,
            session: { ...session, acceptedCount: 70, insertedCount: 20, updatedExistingCount: 50 },
        });
        assert.equal(progress.resultAppearances >= 70, true);
        assert.equal(progress.totalCampaignUniqueRecords, 1);
        assert.notEqual(progress.resultAppearances, progress.totalCampaignUniqueRecords);
    });
});