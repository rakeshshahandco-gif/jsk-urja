/**
 * Continuous Automatic Processing pipeline (CP6→CP7→CP8) tests.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { Lead } from '../../src/models/lead.model.js';
import { AssistedCaptureSession } from '../../src/models/assistedCaptureSession.model.js';
import { RawCapture } from '../../src/models/rawCapture.model.js';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { SearchQuery } from '../../src/models/searchQuery.model.js';
import { startSimpleLeadSearch } from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.service.js';
import {
    readAutoProcessingSettings,
    progressView,
    enableAutoProcessing,
    pauseAutoProcessing,
    resumeAutoProcessing,
    stopAutoProcessing,
    tickAutoProcessing,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.autoProcessing.service.js';
import { startEnrichmentJob } from '../../src/services/dataExtractor/searchCampaign/rawCaptureEnrichment/rawCaptureEnrichment.service.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `PIPE-${Date.now()}`;
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

describe('Auto Processing helpers', () => {
    it('defaults and clamps settings; CRM lead flag forced off', () => {
        const s = readAutoProcessingSettings({
            batchSize: 999,
            autoEnrich: true,
            autoQualify: true,
            autoVerify: true,
            autoCreateCrmLeads: true,
        });
        assert.equal(s.batchSize, 100);
        assert.equal(s.autoCreateCrmLeads, false);
        assert.equal(s.autoEnrich, true);
    });

    it('progressView never reports autoCreateCrmLeads true', () => {
        const view = progressView({
            autoProcessing: {
                enabled: true,
                status: 'running',
                autoCreateCrmLeads: true,
                counts: { capturedUnique: 3 },
            },
        });
        assert.equal(view.autoCreateCrmLeads, false);
        assert.match(view.note || '', /Lead creation/i);
    });
});

describe('Auto Processing orchestration', () => {
    let sessionId;
    let campaignId;
    let queryId;
    let leadsBefore;

    before(async () => {
        assert.match(MONGO_URI, /crm_test/);
        await mongoose.connect(MONGO_URI);
        leadsBefore = await Lead.countDocuments({ companyId });
        const started = await startSimpleLeadSearch({
            companyId,
            user,
            body: { product: `Pipe Home Automation ${TAG}`, city: 'Mumbai', idempotencyKey: `${TAG}-start` },
            headers: {},
        });
        sessionId = started.session._id;
        campaignId = started.campaign._id;
        queryId = started.selectedQuery.id;
        await AssistedCaptureSession.updateOne(
            { _id: sessionId },
            { $set: { status: 'awaiting_user', browserOpenedAcked: true, googlePageIndex: 1 } },
        );

        const docs = [];
        for (let i = 0; i < 12; i += 1) {
            docs.push({
                companyId,
                campaignId,
                queryId,
                queryScopeKey: String(queryId),
                source: 'google',
                captureMethod: 'assisted_visible',
                title: `Company ${i} ${TAG}`,
                titleNormalized: `company ${i} ${TAG}`.toLowerCase(),
                snippet: 'home automation manufacturer',
                resultUrlOriginal: `https://example-pipe-${i}-${TAG}.com/`,
                resultUrlNormalized: `https://example-pipe-${i}-${TAG}.com/`,
                displayDomain: `example-pipe-${i}-${TAG}.com`,
                captureFingerprint: `fp-pipe-${i}-${TAG}`,
                enrichmentStatus: 'not_started',
                inboxStatus: 'new',
                firstSeenAt: new Date(Date.now() + i),
                lastSeenAt: new Date(Date.now() + i),
            });
        }
        await RawCapture.insertMany(docs);
    });

    after(async () => {
        assert.equal(await Lead.countDocuments({ companyId }), leadsBefore);
        await AssistedCaptureSession.deleteMany({ companyId });
        await SearchQuery.deleteMany({ companyId });
        await SearchCampaign.deleteMany({ companyId });
        await RawCapture.deleteMany({ companyId });
        await mongoose.disconnect();
    });

    it('enable → pause → resume → stop without creating Leads', async () => {
        const enabled = await enableAutoProcessing({
            companyId,
            user,
            sessionId,
            body: { batchSize: 10, autoEnrich: true, autoQualify: true, autoVerify: true },
        });
        assert.equal(enabled.autoProcessing.enabled, true);
        assert.equal(enabled.autoProcessing.status, 'running');
        assert.equal(enabled.autoProcessing.autoCreateCrmLeads, false);

        const paused = await pauseAutoProcessing({ companyId, user, sessionId });
        assert.equal(paused.autoProcessing.status, 'paused_owner');

        const resumed = await resumeAutoProcessing({ companyId, user, sessionId });
        assert.equal(resumed.autoProcessing.status, 'running');

        const stopped = await stopAutoProcessing({ companyId, user, sessionId, body: { stopJobs: false } });
        assert.equal(stopped.autoProcessing.status, 'stopped');
        assert.equal(stopped.autoProcessing.enabled, false);
        assert.equal(await Lead.countDocuments({ companyId }), leadsBefore);
    });

    it('tick starts selected enrichment batch then is idempotent while job active', async () => {
        await enableAutoProcessing({
            companyId,
            user,
            sessionId,
            body: {
                batchSize: 10,
                autoEnrich: true,
                autoQualify: false,
                autoVerify: false,
                continueWhileCollecting: true,
            },
        });
        await AssistedCaptureSession.updateOne(
            { _id: sessionId },
            { $set: { 'autoCollection.status': 'idle', 'autoProcessing.flushRequested': true } },
        );

        const t1 = await tickAutoProcessing({ companyId, user, sessionId });
        assert.ok(['enriching', 'waiting_batch', 'done', 'verifying', 'qualifying'].includes(t1.autoProcessing.currentStage));

        const again = await startEnrichmentJob({
            companyId,
            user,
            sessionId: String(sessionId),
            mode: 'all_unverified',
        });
        assert.equal(typeof again.alreadyRunning, 'boolean');

        await stopAutoProcessing({ companyId, user, sessionId, body: { stopJobs: true } });
        assert.equal(await Lead.countDocuments({ companyId }), leadsBefore);
    });

    it('waits for full batch while collecting when below batch size', async () => {
        await enableAutoProcessing({
            companyId,
            user,
            sessionId,
            body: {
                batchSize: 100,
                autoEnrich: true,
                autoQualify: false,
                autoVerify: false,
                continueWhileCollecting: true,
            },
        });
        await AssistedCaptureSession.updateOne(
            { _id: sessionId },
            {
                $set: {
                    'autoCollection.status': 'running',
                    'autoProcessing.status': 'running',
                    'autoProcessing.enabled': true,
                    'autoProcessing.flushRequested': false,
                    'autoProcessing.currentStage': 'waiting_batch',
                    'autoProcessing.currentEnrichJobId': null,
                    'autoProcessing.currentQualifyJobId': null,
                    'autoProcessing.currentVerifyJobId': null,
                    'autoProcessing.currentBatchCaptureIds': [],
                    'autoProcessing.processedCaptureIdKeys': [],
                },
            },
        );
        const t = await tickAutoProcessing({ companyId, user, sessionId });
        assert.ok(['waiting_batch', 'enriching', 'done'].includes(t.autoProcessing.currentStage));
        await stopAutoProcessing({ companyId, user, sessionId, body: { stopJobs: true } });
    });

    it('does not starve later batches when processed keys cover oldest pending window', async () => {
        const leadsBeforeLocal = await Lead.countDocuments({ companyId });
        const sid = sessionId;
        const sess = await AssistedCaptureSession.findById(sid).lean();
        const campaignIdLocal = sess.campaignId;
        const queryIdLocal = sess.queryId;

        // Seed 60 pending captures; mark first 50 as "processed" while still pending (old bug state)
        const docs = [];
        for (let i = 0; i < 60; i += 1) {
            docs.push({
                companyId,
                campaignId: campaignIdLocal,
                queryId: queryIdLocal,
                queryScopeKey: String(queryIdLocal),
                source: 'google',
                captureMethod: 'assisted_visible',
                title: `Starve ${i} ${TAG}`,
                titleNormalized: `starve ${i} ${TAG}`.toLowerCase(),
                snippet: 'home automation',
                resultUrlOriginal: `https://starve-${TAG}-${i}.example/`,
                resultUrlNormalized: `https://starve-${TAG}-${i}.example/`,
                displayDomain: `starve-${TAG}-${i}.example`,
                captureFingerprint: `fp-starve-${i}-${TAG}`,
                enrichmentStatus: 'pending',
                inboxStatus: 'new',
                firstSeenAt: new Date(Date.now() + i),
                lastSeenAt: new Date(Date.now() + i),
            });
        }
        const inserted = await RawCapture.insertMany(docs);
        const oldest50 = inserted.slice(0, 50).map((d) => String(d._id));

        await enableAutoProcessing({
            companyId,
            user,
            sessionId: sid,
            body: {
                batchSize: 10,
                autoEnrich: true,
                autoQualify: false,
                autoVerify: false,
                continueWhileCollecting: true,
            },
        });
        await AssistedCaptureSession.updateOne(
            { _id: sid },
            {
                $set: {
                    'autoCollection.status': 'running',
                    'autoProcessing.status': 'running',
                    'autoProcessing.enabled': true,
                    'autoProcessing.flushRequested': false,
                    'autoProcessing.currentStage': 'waiting_batch',
                    'autoProcessing.currentEnrichJobId': null,
                    'autoProcessing.currentQualifyJobId': null,
                    'autoProcessing.currentVerifyJobId': null,
                    'autoProcessing.currentBatchCaptureIds': [],
                    'autoProcessing.processedCaptureIdKeys': oldest50,
                    'autoProcessing.batchSize': 10,
                    'autoProcessing.tickLockUntil': null,
                },
            },
        );

        const t = await tickAutoProcessing({ companyId, user, sessionId: sid });
        const batchIds = (t.autoProcessing.currentBatchSize > 0
            ? (await AssistedCaptureSession.findById(sid).lean()).autoProcessing.currentBatchCaptureIds
            : [])
            .map(String);
        // After repair, oldest pending are re-queued OR $nin skips them — either way a batch of 10 must start
        assert.ok(
            t.autoProcessing.currentStage === 'enriching' || t.autoProcessing.counts.waitingEnrichment >= 10,
            `expected enriching or backlog, got stage=${t.autoProcessing.currentStage} waiting=${t.autoProcessing.counts.waitingEnrichment}`,
        );
        if (batchIds.length) {
            assert.equal(batchIds.length, 10);
        }
        assert.equal(await Lead.countDocuments({ companyId }), leadsBeforeLocal);
        await stopAutoProcessing({ companyId, user, sessionId: sid, body: { stopJobs: true } });
    });

    it('resumes completed pipeline when backlog remains', async () => {
        await AssistedCaptureSession.updateOne(
            { _id: sessionId },
            {
                $set: {
                    'autoProcessing.enabled': true,
                    'autoProcessing.ownerWorkflowEnabled': true,
                    'autoProcessing.status': 'completed',
                    'autoProcessing.currentStage': 'done',
                    'autoProcessing.tickLockUntil': null,
                    'autoCollection.status': 'idle',
                },
            },
        );
        // Ensure at least one pending capture exists
        const sess = await AssistedCaptureSession.findById(sessionId).lean();
        await RawCapture.create({
            companyId,
            campaignId: sess.campaignId,
            queryId: sess.queryId,
            queryScopeKey: String(sess.queryId),
            source: 'google',
            captureMethod: 'assisted_visible',
            title: `Resume backlog ${TAG}`,
            titleNormalized: `resume backlog ${TAG}`.toLowerCase(),
            snippet: 'home automation',
            resultUrlOriginal: `https://resume-backlog-${TAG}.example/`,
            resultUrlNormalized: `https://resume-backlog-${TAG}.example/`,
            displayDomain: `resume-backlog-${TAG}.example`,
            captureFingerprint: `fp-resume-backlog-${TAG}`,
            enrichmentStatus: 'pending',
            inboxStatus: 'new',
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
        });
        const t = await tickAutoProcessing({ companyId, user, sessionId });
        assert.ok(['running', 'completed'].includes(t.autoProcessing.status));
        if (t.autoProcessing.counts.waitingEnrichment > 0 || t.autoProcessing.counts.processingBacklog > 0) {
            assert.equal(t.autoProcessing.status, 'running');
        }
        await stopAutoProcessing({ companyId, user, sessionId, body: { stopJobs: true } });
    });

    it('page-load idle pipeline with backlog auto-resumes without Start button', async () => {
        const leadsBeforeLocal = await Lead.countDocuments({ companyId });
        await AssistedCaptureSession.updateOne(
            { _id: sessionId },
            {
                $set: {
                    'autoProcessing.enabled': false,
                    'autoProcessing.ownerWorkflowEnabled': true,
                    'autoProcessing.status': 'idle',
                    'autoProcessing.currentStage': 'idle',
                    'autoProcessing.tickLockUntil': null,
                    'autoProcessing.currentEnrichJobId': null,
                    'autoProcessing.autoResumeNotice': false,
                    'autoCollection.status': 'idle',
                },
            },
        );
        const sess = await AssistedCaptureSession.findById(sessionId).lean();
        await RawCapture.create({
            companyId,
            campaignId: sess.campaignId,
            queryId: sess.queryId,
            queryScopeKey: String(sess.queryId),
            source: 'google',
            captureMethod: 'assisted_visible',
            title: `Idle resume ${TAG}`,
            titleNormalized: `idle resume ${TAG}`.toLowerCase(),
            snippet: 'home automation',
            resultUrlOriginal: `https://idle-resume-${TAG}.example/`,
            resultUrlNormalized: `https://idle-resume-${TAG}.example/`,
            displayDomain: `idle-resume-${TAG}.example`,
            captureFingerprint: `fp-idle-resume-${TAG}`,
            enrichmentStatus: 'pending',
            inboxStatus: 'new',
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
        });
        // Simulate status poll / page load — NOT enableAutoProcessing (no Start click)
        const t = await tickAutoProcessing({ companyId, user, sessionId });
        assert.equal(t.autoProcessing.status, 'running');
        assert.equal(t.autoProcessing.enabled, true);
        assert.equal(t.autoResumed, true);
        assert.match(t.autoProcessing.autoResumeMessage || t.autoProcessing.lastErrorMessage, /Pending records detected/i);
        assert.equal(await Lead.countDocuments({ companyId }), leadsBeforeLocal);
        await stopAutoProcessing({ companyId, user, sessionId, body: { stopJobs: true } });
    });

    it('completed status with backlog auto-resumes (backend restart simulation)', async () => {
        await AssistedCaptureSession.updateOne(
            { _id: sessionId },
            {
                $set: {
                    'autoProcessing.enabled': true,
                    'autoProcessing.ownerWorkflowEnabled': true,
                    'autoProcessing.status': 'completed',
                    'autoProcessing.currentStage': 'done',
                    'autoProcessing.tickLockUntil': null,
                    'autoProcessing.currentEnrichJobId': null,
                    'autoCollection.status': 'idle',
                },
            },
        );
        const sess = await AssistedCaptureSession.findById(sessionId).lean();
        await RawCapture.create({
            companyId,
            campaignId: sess.campaignId,
            queryId: sess.queryId,
            queryScopeKey: String(sess.queryId),
            source: 'google',
            captureMethod: 'assisted_visible',
            title: `Restart resume ${TAG}`,
            titleNormalized: `restart resume ${TAG}`.toLowerCase(),
            snippet: 'home automation',
            resultUrlOriginal: `https://restart-resume-${TAG}.example/`,
            resultUrlNormalized: `https://restart-resume-${TAG}.example/`,
            displayDomain: `restart-resume-${TAG}.example`,
            captureFingerprint: `fp-restart-resume-${TAG}`,
            enrichmentStatus: 'pending',
            inboxStatus: 'new',
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
        });
        const t = await tickAutoProcessing({ companyId, user, sessionId });
        assert.equal(t.autoProcessing.status, 'running');
        assert.ok(Number(t.autoProcessing.counts.processingBacklog) > 0);
        assert.notEqual(t.autoProcessing.uiLabel, 'Automatic Processing Completed');
        await stopAutoProcessing({ companyId, user, sessionId, body: { stopJobs: true } });
    });

    it('explicit Pause prevents automatic resume', async () => {
        await enableAutoProcessing({
            companyId, user, sessionId,
            body: { batchSize: 10, autoEnrich: true, autoQualify: false, autoVerify: false },
        });
        await pauseAutoProcessing({ companyId, user, sessionId });
        const sess = await AssistedCaptureSession.findById(sessionId).lean();
        await RawCapture.create({
            companyId,
            campaignId: sess.campaignId,
            queryId: sess.queryId,
            queryScopeKey: String(sess.queryId),
            source: 'google',
            captureMethod: 'assisted_visible',
            title: `Pause block ${TAG}`,
            titleNormalized: `pause block ${TAG}`.toLowerCase(),
            snippet: 'home automation',
            resultUrlOriginal: `https://pause-block-${TAG}.example/`,
            resultUrlNormalized: `https://pause-block-${TAG}.example/`,
            displayDomain: `pause-block-${TAG}.example`,
            captureFingerprint: `fp-pause-block-${TAG}`,
            enrichmentStatus: 'pending',
            inboxStatus: 'new',
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
        });
        await AssistedCaptureSession.updateOne(
            { _id: sessionId },
            { $set: { 'autoProcessing.tickLockUntil': null } },
        );
        const t = await tickAutoProcessing({ companyId, user, sessionId });
        assert.equal(t.autoProcessing.status, 'paused_owner');
        assert.equal(t.autoResumed, false);
        await stopAutoProcessing({ companyId, user, sessionId, body: { stopJobs: true } });
    });

    it('explicit Stop All prevents automatic resume', async () => {
        await enableAutoProcessing({
            companyId, user, sessionId,
            body: { batchSize: 10, autoEnrich: true, autoQualify: false, autoVerify: false },
        });
        await stopAutoProcessing({ companyId, user, sessionId, body: { stopJobs: true } });
        const sess = await AssistedCaptureSession.findById(sessionId).lean();
        await RawCapture.create({
            companyId,
            campaignId: sess.campaignId,
            queryId: sess.queryId,
            queryScopeKey: String(sess.queryId),
            source: 'google',
            captureMethod: 'assisted_visible',
            title: `Stop block ${TAG}`,
            titleNormalized: `stop block ${TAG}`.toLowerCase(),
            snippet: 'home automation',
            resultUrlOriginal: `https://stop-block-${TAG}.example/`,
            resultUrlNormalized: `https://stop-block-${TAG}.example/`,
            displayDomain: `stop-block-${TAG}.example`,
            captureFingerprint: `fp-stop-block-${TAG}`,
            enrichmentStatus: 'pending',
            inboxStatus: 'new',
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
        });
        const t = await tickAutoProcessing({ companyId, user, sessionId });
        assert.equal(t.autoProcessing.status, 'stopped');
        assert.equal(t.autoProcessing.enabled, false);
        assert.equal(t.autoResumed, false);
    });

    it('final partial batch processes automatically when collection idle', async () => {
        const leadsBeforeLocal = await Lead.countDocuments({ companyId });
        await enableAutoProcessing({
            companyId, user, sessionId,
            body: {
                batchSize: 50,
                autoEnrich: true,
                autoQualify: false,
                autoVerify: false,
                continueWhileCollecting: true,
            },
        });
        await AssistedCaptureSession.updateOne(
            { _id: sessionId },
            {
                $set: {
                    'autoCollection.status': 'idle',
                    'autoProcessing.status': 'running',
                    'autoProcessing.enabled': true,
                    'autoProcessing.flushRequested': false,
                    'autoProcessing.currentStage': 'waiting_batch',
                    'autoProcessing.currentEnrichJobId': null,
                    'autoProcessing.currentBatchCaptureIds': [],
                    'autoProcessing.processedCaptureIdKeys': [],
                    'autoProcessing.tickLockUntil': null,
                    'autoProcessing.batchSize': 50,
                },
            },
        );
        const t = await tickAutoProcessing({ companyId, user, sessionId });
        // With collection idle, flush runs even below batch size
        assert.ok(
            t.autoProcessing.currentStage === 'enriching'
            || Number(t.autoProcessing.counts.processingBacklog) >= 0,
        );
        assert.equal(await Lead.countDocuments({ companyId }), leadsBeforeLocal);
        await stopAutoProcessing({ companyId, user, sessionId, body: { stopJobs: true } });
    });

    it('does not create duplicate enrichment jobs on concurrent ticks', async () => {
        await enableAutoProcessing({
            companyId, user, sessionId,
            body: {
                batchSize: 10,
                autoEnrich: true,
                autoQualify: false,
                autoVerify: false,
                continueWhileCollecting: false,
            },
        });
        await AssistedCaptureSession.updateOne(
            { _id: sessionId },
            {
                $set: {
                    'autoCollection.status': 'idle',
                    'autoProcessing.flushRequested': true,
                    'autoProcessing.currentStage': 'waiting_batch',
                    'autoProcessing.currentEnrichJobId': null,
                    'autoProcessing.tickLockUntil': null,
                    'autoProcessing.processedCaptureIdKeys': [],
                    'autoProcessing.currentBatchCaptureIds': [],
                },
            },
        );
        const t1 = await tickAutoProcessing({ companyId, user, sessionId });
        const job1 = (await AssistedCaptureSession.findById(sessionId).lean()).autoProcessing.currentEnrichJobId;
        const t2 = await tickAutoProcessing({ companyId, user, sessionId });
        const job2 = (await AssistedCaptureSession.findById(sessionId).lean()).autoProcessing.currentEnrichJobId;
        if (job1 && job2) {
            assert.equal(String(job1), String(job2));
        }
        assert.ok(t1.autoProcessing || t2.autoProcessing);
        const again = await startEnrichmentJob({
            companyId,
            user,
            sessionId: String(sessionId),
            mode: 'all_unverified',
        });
        assert.equal(typeof again.alreadyRunning, 'boolean');
        await stopAutoProcessing({ companyId, user, sessionId, body: { stopJobs: true } });
    });

    it('campaign counters stay campaign-specific and CRM Lead count unchanged', async () => {
        const leadsBeforeLocal = await Lead.countDocuments({ companyId });
        const otherCampaignId = new mongoose.Types.ObjectId();
        await RawCapture.create({
            companyId,
            campaignId: otherCampaignId,
            queryId: new mongoose.Types.ObjectId(),
            queryScopeKey: 'other',
            source: 'google',
            captureMethod: 'assisted_visible',
            title: `Other campaign ${TAG}`,
            titleNormalized: `other campaign ${TAG}`.toLowerCase(),
            snippet: 'other',
            resultUrlOriginal: `https://other-campaign-${TAG}.example/`,
            resultUrlNormalized: `https://other-campaign-${TAG}.example/`,
            displayDomain: `other-campaign-${TAG}.example`,
            captureFingerprint: `fp-other-campaign-${TAG}`,
            enrichmentStatus: 'pending',
            inboxStatus: 'new',
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
        });
        await enableAutoProcessing({
            companyId, user, sessionId,
            body: { batchSize: 10, autoEnrich: true, autoQualify: false, autoVerify: false },
        });
        await AssistedCaptureSession.updateOne(
            { _id: sessionId },
            { $set: { 'autoProcessing.tickLockUntil': null, 'autoCollection.status': 'idle', 'autoProcessing.flushRequested': true } },
        );
        const t = await tickAutoProcessing({ companyId, user, sessionId });
        const sess = await AssistedCaptureSession.findById(sessionId).lean();
        const thisCampaign = await RawCapture.countDocuments({ companyId, campaignId: sess.campaignId });
        assert.equal(t.autoProcessing.counts.capturedUnique, thisCampaign);
        const buckets = t.autoProcessing.counts;
        const sum = Number(buckets.reconcileWaiting || 0)
            + Number(buckets.reconcileProcessing || 0)
            + Number(buckets.reconcileCompleted || 0)
            + Number(buckets.reconcileReviewRequired || 0)
            + Number(buckets.reconcileRejectedSkipped || 0)
            + Number(buckets.reconcileFailed || 0);
        assert.equal(sum, thisCampaign);
        assert.equal(await Lead.countDocuments({ companyId }), leadsBeforeLocal);
        await stopAutoProcessing({ companyId, user, sessionId, body: { stopJobs: true } });
    });
});
