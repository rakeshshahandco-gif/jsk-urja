/**
 * Simple Lead Search — Auto Collection (unlimited default + fixed target + worker cycle).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { AssistedCaptureSession } from '../../src/models/assistedCaptureSession.model.js';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { SearchQuery } from '../../src/models/searchQuery.model.js';
import { RawCapture } from '../../src/models/rawCapture.model.js';
import { Lead } from '../../src/models/lead.model.js';
import { DiscoveryAgentToken } from '../../src/models/discoveryAgentToken.model.js';
import { startSimpleLeadSearch } from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.service.js';
import {
    startAutoCollection,
    pauseAutoCollection,
    resumeAutoCollection,
    stopAutoCollection,
    tickAutoCollection,
    readSettings,
    progressView,
    isPageOutcomeFail,
    parsePageKindFromMessage,
    MAX_UNSUPPORTED_PAGE_RETRIES,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.autoCollection.service.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `SLS-AUTO-${Date.now()}`;
const companyId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const user = {
    _id: userId, id: userId, roleName: 'staff',
    additionalPermissions: {
        data_extractor: {
            search_campaign: { view: true, manage: true },
            search_query: { view: true, manage: true, open: true, review: true, generate: true },
            raw_capture: { view: true, ingest: true, manage: true },
            assisted_capture: { view: true, start: true, manage: true },
        },
    },
};

describe('SLS Auto Collection helpers', () => {
    it('defaults to Unlimited with null/zero capture target', () => {
        const d = readSettings({});
        assert.equal(d.collectionMode, 'unlimited');
        assert.equal(d.pageCollectionMode, 'until_no_more');
        assert.equal(d.requestedCaptureTarget, 0);
        assert.equal(d.stopOnNoNewUniquePages, false);
        assert.equal(d.stopAtUnique, 0);
        assert.equal(d.maxQueries, 24);
        assert.equal(d.maxSafetyPagesPerQuery, 30);
    });

    it('supports optional Manual Limit without snapping to 25/50/100', () => {
        const s = readSettings({ collectionMode: 'fixed_target', requestedCaptureTarget: 250 });
        assert.equal(s.collectionMode, 'fixed_target');
        assert.equal(s.requestedCaptureTarget, 250);
        const manual150 = readSettings({ collectionMode: 'manual', requestedCaptureTarget: 150 });
        assert.equal(manual150.collectionMode, 'fixed_target');
        assert.equal(manual150.requestedCaptureTarget, 150);
        const leftover100 = readSettings({ requestedCaptureTarget: 100 });
        assert.equal(leftover100.collectionMode, 'unlimited');
        assert.equal(leftover100.requestedCaptureTarget, 0);
        const missingMode = readSettings({});
        assert.equal(missingMode.collectionMode, 'unlimited');
        assert.equal(missingMode.requestedCaptureTarget, 0);
        const manualWithoutTarget = readSettings({ collectionMode: 'manual' });
        assert.equal(manualWithoutTarget.collectionMode, 'unlimited');
        assert.equal(manualWithoutTarget.requestedCaptureTarget, 0);
    });

    it('never enables unique-company stop rules from body', () => {
        const s = readSettings({
            collectionMode: 'unlimited',
            stopAtUnique: 50,
            stopOnNoNewUniquePages: true,
            pageCollectionMode: 'until_no_more',
            maxSafetyPagesPerQuery: 40,
        });
        assert.equal(s.stopAtUnique, 0);
        assert.equal(s.stopOnNoNewUniquePages, false);
        assert.equal(s.maxSafetyPagesPerQuery, 40);
    });

    it('clamps owner settings', () => {
        const s = readSettings({
            collectionMode: 'fixed_target',
            pageCollectionMode: 'fixed',
            maxPagesPerQuery: 99,
            maxQueries: 0,
            delayMinSec: 1,
            delayMaxSec: 500,
            requestedCaptureTarget: 100,
        });
        assert.equal(s.pageCollectionMode, 'fixed');
        assert.equal(s.maxPagesPerQuery, 10);
        assert.equal(s.maxQueries, 1);
        assert.equal(s.delayMinSec, 5);
        assert.equal(s.delayMaxSec, 180);
    });

    it('progressView exposes unlimited KPIs and null target', () => {
        const view = progressView({
            status: 'awaiting_user', googlePageIndex: 2, visibleResultCount: 12, acceptedCount: 12,
            autoCollection: {
                status: 'running', phase: 'decide_next', collectionMode: 'unlimited',
                requestedCaptureTarget: 0, sourceResultsFound: 24, rawRecordsCaptured: 24,
                pagesInWorkerCycle: 5, workerCycleCount: 1, queriesCompleted: 0, totalApprovedQueries: 8,
                discoveryStatus: 'running', lastDiscoveryAt: new Date(), summary: {},
            },
        }, { queryIndex: 1, queryTotal: 8, googlePage: 2, totalCampaignUniqueRecords: 10 });
        assert.equal(view.collectionMode, 'unlimited');
        assert.equal(view.requestedCaptureTarget, null);
        assert.equal(view.sourceResultsFound, 24);
        assert.equal(view.rawRecordsCaptured, 24);
        assert.equal(view.uniqueCompanies, 10);
        assert.equal(view.pagesInWorkerCycle, 5);
        assert.equal(view.queriesCompleted, 0);
        assert.equal(view.totalApprovedQueries, 8);
    });

    it('detects Page kind: unsupported as a page-outcome fail, including ignored-fail leftover', () => {
        assert.equal(parsePageKindFromMessage('Page kind: unsupported'), 'unsupported');
        assert.equal(parsePageKindFromMessage('Page kind: captcha'), 'captcha');
        assert.equal(isPageOutcomeFail({
            failCode: 'UNSUPPORTED_LAYOUT',
            failMessage: 'Page kind: unsupported',
        }), true);
        assert.equal(isPageOutcomeFail({
            autoCollection: {
                lastErrorCode: 'agent_fail_ignored_after_accepted_ingest',
                lastErrorMessage: 'Page kind: unsupported',
            },
        }), true);
        assert.equal(isPageOutcomeFail({
            autoCollection: {
                lastErrorCode: 'unsupported_page_retry',
                lastErrorMessage: 'Waiting on provider / retrying page 12 (attempt 1/2).',
            },
        }), false);
        assert.equal(isPageOutcomeFail({
            failCode: 'ASSISTED_SESSION_FAILED',
            failMessage: 'bookkeeping',
        }), false);
    });

    it('progressView exposes query progress label and retry owner status', () => {
        const view = progressView({
            status: 'awaiting_user', googlePageIndex: 12, acceptedCount: 110,
            autoCollection: {
                status: 'running', phase: 'await_capture', collectionMode: 'unlimited',
                lastQueryIndex: 1, queriesCompleted: 0, totalApprovedQueries: 14,
                pauseReason: 'unsupported_page_retry', providerState: 'Retry',
                discoveryStatus: 'running', lastDiscoveryAt: new Date(),
                lastNewResultAt: new Date('2026-09-06T12:15:52.000Z'),
                lastPageAdvancementAt: new Date('2026-09-06T12:15:52.000Z'),
                summary: {},
            },
        }, { queryIndex: 1, queryTotal: 14, googlePage: 12, totalCampaignUniqueRecords: 110 });
        assert.equal(view.queriesCompleted, 0);
        assert.equal(view.pendingQueries, 13);
        assert.match(view.queryProgressLabel, /Query 1\/14 — Page 12/);
        assert.equal(view.providerState, 'Retry');
        assert.equal(view.discoveryDisplayStatus, 'Waiting on provider / retrying');
        assert.match(view.uiLabel, /Waiting on provider/);
    });

    it('progressView labels manual pause', () => {
        const view = progressView({
            status: 'manual_action_required', googlePageIndex: 2, visibleResultCount: 10,
            autoCollection: { status: 'paused_manual', phase: 'none', maxPagesPerQuery: 3, maxQueries: 3, lastPageVisible: 10, lastPageNewUnique: 0, lastPageUpdated: 0, summary: {} },
        }, { queryIndex: 1, queryTotal: 5, googlePage: 2, totalCampaignUniqueRecords: 10 });
        assert.equal(view.manualActionRequired, true);
        assert.match(view.uiLabel, /Manual action required/);
    });
});

describe('SLS Auto Collection orchestration', () => {
    let sessionId; let leadsBefore;
    before(async () => {
        assert.match(MONGO_URI, /crm_test/);
        await mongoose.connect(MONGO_URI);
        leadsBefore = await Lead.countDocuments({ companyId });
        // Keep agent "online" so tickAutoCollection does not soft-pause as agent_offline
        await DiscoveryAgentToken.create({
            companyId,
            name: `${TAG}-agent`,
            tokenHash: `hash-${TAG}`,
            tokenPrefix: 'tst_',
            isActive: true,
            lastUsedAt: new Date(),
            createdBy: userId,
        });
        const started = await startSimpleLeadSearch({ companyId, user, body: { product: 'LED Light Manufacturer', city: 'Ahmedabad', idempotencyKey: `${TAG}-start` }, headers: {} });
        sessionId = started.session._id;
        await AssistedCaptureSession.updateOne({ _id: sessionId }, { $set: { status: 'awaiting_user', browserOpenedAcked: true, googlePageIndex: 1 } });
    });
    after(async () => {
        await AssistedCaptureSession.deleteMany({ companyId });
        await SearchQuery.deleteMany({ companyId });
        await SearchCampaign.deleteMany({ companyId });
        await RawCapture.deleteMany({ companyId });
        await DiscoveryAgentToken.deleteMany({ companyId });
        await mongoose.disconnect();
    });

    it('starts Unlimited by default', async () => {
        const started = await startAutoCollection({
            companyId, user, sessionId,
            body: { delayMinSec: 5, delayMaxSec: 5, autoEnrichAfter: false },
        });
        assert.equal(started.autoCollection.collectionMode, 'unlimited');
        assert.equal(started.autoCollection.requestedCaptureTarget, null);
        assert.equal(started.autoCollection.discoveryStatus, 'running');
        assert.equal(started.autoCollection.settings.stopOnNoNewUniquePages, false);
        await stopAutoCollection({ companyId, user, sessionId });
    });

    it('starts, pauses, resumes, stops without creating Leads', async () => {
        await AssistedCaptureSession.updateOne({ _id: sessionId }, { $set: { status: 'awaiting_user', manualActionMessage: '' } });
        const started = await startAutoCollection({
            companyId, user, sessionId,
            body: {
                collectionMode: 'unlimited',
                maxPagesPerQuery: 2, maxQueries: 2, delayMinSec: 5, delayMaxSec: 5,
                autoEnrichAfter: false, autoQualifyAfterEnrich: false,
            },
        });
        assert.equal(started.autoCollection.status, 'running');
        const paused = await pauseAutoCollection({ companyId, user, sessionId });
        assert.equal(paused.autoCollection.status, 'paused_owner');
        assert.equal(paused.autoCollection.discoveryStatus, 'paused');
        assert.equal(paused.autoCollection.pauseReason, 'owner_pause');
        const resumed = await resumeAutoCollection({ companyId, user, sessionId });
        assert.equal(resumed.autoCollection.status, 'running');
        assert.equal(resumed.autoCollection.pauseReason, '');
        await AssistedCaptureSession.updateOne({ _id: sessionId }, { $set: { status: 'manual_action_required', manualActionMessage: 'Unusual traffic' } });
        const ticked = await tickAutoCollection({ companyId, user, sessionId });
        assert.equal(ticked.autoCollection.status, 'paused_manual');
        assert.equal(ticked.autoCollection.discoveryStatus, 'paused');
        await AssistedCaptureSession.updateOne({ _id: sessionId }, { $set: { status: 'awaiting_user', manualActionMessage: '' } });
        const stopped = await stopAutoCollection({ companyId, user, sessionId });
        assert.equal(stopped.autoCollection.status, 'stopped');
        assert.equal(stopped.autoCollection.discoveryStatus, 'stopped');
        assert.ok(stopped.autoCollection.ownerStoppedAt);
        assert.equal(stopped.preserved.rawCaptures, true);
        assert.equal(await Lead.countDocuments({ companyId }), leadsBefore);
        const again = await stopAutoCollection({ companyId, user, sessionId });
        assert.equal(again.alreadyStopped, true);
        assert.match(String(again.message || ''), /already stopped/i);
        assert.equal(again.preserved.rawCaptures, true);
        assert.equal(await Lead.countDocuments({ companyId }), leadsBefore);
    });

    it('Fixed Target mode persists requestedCaptureTarget', async () => {
        await AssistedCaptureSession.updateOne({ _id: sessionId }, { $set: { status: 'awaiting_user', 'autoCollection.status': 'idle' } });
        const started = await startAutoCollection({
            companyId, user, sessionId,
            body: {
                collectionMode: 'fixed_target',
                requestedCaptureTarget: 50,
                delayMinSec: 5, delayMaxSec: 5,
                autoEnrichAfter: false,
            },
        });
        assert.equal(started.autoCollection.collectionMode, 'fixed_target');
        assert.equal(started.autoCollection.requestedCaptureTarget, 50);
        await stopAutoCollection({ companyId, user, sessionId });
    });

    it('worker-cycle safety persists and continues — does not complete campaign', async () => {
        await AssistedCaptureSession.updateOne({ _id: sessionId }, {
            $set: {
                status: 'awaiting_user',
                acceptedCount: 120,
                googlePageIndex: 12,
                'autoCollection.status': 'idle',
            },
        });
        await startAutoCollection({
            companyId, user, sessionId,
            body: {
                collectionMode: 'unlimited',
                maxSafetyPagesPerQuery: 10,
                delayMinSec: 5, delayMaxSec: 5,
                autoEnrichAfter: false,
            },
        });
        // Simulate end of worker cycle at decide_next with cycle limit reached
        await AssistedCaptureSession.updateOne({ _id: sessionId }, {
            $set: {
                status: 'awaiting_user',
                acceptedCount: 120,
                googlePageIndex: 12,
                'autoCollection.status': 'running',
                'autoCollection.enabled': true,
                'autoCollection.phase': 'decide_next',
                'autoCollection.collectionMode': 'unlimited',
                'autoCollection.pageCollectionMode': 'until_no_more',
                'autoCollection.pagesInWorkerCycle': 10,
                'autoCollection.maxSafetyPagesPerQuery': 10,
                'autoCollection.pagesCapturedThisQuery': 12,
                'autoCollection.rawRecordsCaptured': 120,
                'autoCollection.requestedCaptureTarget': 0,
                'autoCollection.nextActionAt': new Date(Date.now() - 1000),
                'autoCollection.tickLockUntil': null,
                'autoCollection.discoveryStatus': 'running',
            },
        });
        const ticked = await tickAutoCollection({ companyId, user, sessionId });
        assert.notEqual(ticked.autoCollection.status, 'completed');
        assert.notEqual(ticked.autoCollection?.summary?.stopReason, 'max_safety_pages_reached');
        const phase = ticked.autoCollection.phase;
        assert.ok(
            phase === 'await_cycle' || phase === 'next_page' || phase === 'await_nav' || phase === 'delay',
            `expected continuation phase, got ${phase}`,
        );
        assert.ok(Number(ticked.autoCollection.workerCycleCount || 0) >= 1 || phase === 'next_page' || phase === 'await_nav');
        await stopAutoCollection({ companyId, user, sessionId });
    });

    it('Fixed Target completes on raw capture target — not unique companies', async () => {
        await AssistedCaptureSession.updateOne({ _id: sessionId }, {
            $set: {
                status: 'awaiting_user',
                acceptedCount: 25,
                googlePageIndex: 3,
                'autoCollection.status': 'idle',
            },
        });
        await startAutoCollection({
            companyId, user, sessionId,
            body: {
                collectionMode: 'fixed_target',
                requestedCaptureTarget: 25,
                delayMinSec: 5, delayMaxSec: 5,
                autoEnrichAfter: false,
            },
        });
        await AssistedCaptureSession.updateOne({ _id: sessionId }, {
            $set: {
                status: 'awaiting_user',
                acceptedCount: 25,
                'autoCollection.status': 'running',
                'autoCollection.enabled': true,
                'autoCollection.phase': 'decide_next',
                'autoCollection.collectionMode': 'fixed_target',
                'autoCollection.requestedCaptureTarget': 25,
                'autoCollection.rawRecordsCaptured': 25,
                'autoCollection.pagesInWorkerCycle': 1,
                'autoCollection.nextActionAt': new Date(Date.now() - 1000),
                'autoCollection.tickLockUntil': null,
            },
        });
        const ticked = await tickAutoCollection({ companyId, user, sessionId });
        assert.equal(ticked.autoCollection.status, 'completed');
        assert.equal(ticked.autoCollection.summary?.stopReason || ticked.autoCollection.discoveryStatus, 'capture_target_reached');
        // discoveryStatus mapped to target_reached
        assert.ok(
            ticked.autoCollection.discoveryStatus === 'target_reached'
            || ticked.autoCollection.summary?.stopReason === 'capture_target_reached',
        );
    });

    it('Unlimited does not complete merely because raw count exceeds 100 or 500', async () => {
        await AssistedCaptureSession.updateOne({ _id: sessionId }, {
            $set: {
                status: 'awaiting_user',
                acceptedCount: 520,
                googlePageIndex: 45,
                'autoCollection.status': 'idle',
            },
        });
        await startAutoCollection({
            companyId, user, sessionId,
            body: { collectionMode: 'unlimited', delayMinSec: 5, delayMaxSec: 5, autoEnrichAfter: false },
        });
        await AssistedCaptureSession.updateOne({ _id: sessionId }, {
            $set: {
                status: 'awaiting_user',
                acceptedCount: 520,
                googlePageIndex: 45,
                'autoCollection.status': 'running',
                'autoCollection.enabled': true,
                'autoCollection.phase': 'decide_next',
                'autoCollection.collectionMode': 'unlimited',
                'autoCollection.pageCollectionMode': 'until_no_more',
                'autoCollection.requestedCaptureTarget': 0,
                'autoCollection.rawRecordsCaptured': 520,
                'autoCollection.pagesInWorkerCycle': 2,
                'autoCollection.maxSafetyPagesPerQuery': 30,
                'autoCollection.pagesCapturedThisQuery': 45,
                'autoCollection.nextActionAt': new Date(Date.now() - 1000),
                'autoCollection.tickLockUntil': null,
            },
        });
        const ticked = await tickAutoCollection({ companyId, user, sessionId });
        assert.notEqual(ticked.autoCollection.status, 'completed');
        assert.notEqual(ticked.autoCollection.discoveryStatus, 'target_reached');
        await stopAutoCollection({ companyId, user, sessionId });
    });

    it('Page kind: captcha pauses for human verification instead of retrying forever', async () => {
        await AssistedCaptureSession.updateOne({ _id: sessionId }, {
            $set: {
                status: 'awaiting_user',
                acceptedCount: 110,
                googlePageIndex: 12,
                failCode: 'UNSUPPORTED_LAYOUT',
                failMessage: 'Page kind: captcha',
                pendingCaptureStatus: 'none',
                'autoCollection.status': 'running',
                'autoCollection.enabled': true,
                'autoCollection.phase': 'await_capture',
                'autoCollection.collectionMode': 'unlimited',
                'autoCollection.lastErrorCode': 'UNSUPPORTED_LAYOUT',
                'autoCollection.lastErrorMessage': 'Page kind: captcha',
                'autoCollection.discoveryStatus': 'running',
                'autoCollection.ownerStoppedAt': null,
                'autoCollection.stopRequested': false,
                'autoCollection.summary.stopReason': '',
                'autoCollection.nextActionAt': new Date(Date.now() - 1000),
                'autoCollection.tickLockUntil': null,
            },
            $unset: { failedAt: 1 },
        });
        const ticked = await tickAutoCollection({ companyId, user, sessionId });
        assert.equal(ticked.autoCollection.status, 'paused_manual');
        assert.equal(ticked.autoCollection.providerState, 'Human Verification');
        assert.match(String(ticked.autoCollection.lastErrorMessage || ''), /Human verification required/i);
        assert.equal(Number(ticked.autoCollection?.rawRecordsCaptured || ticked.session?.acceptedCount || 0) >= 110, true);
    });

    it('mid-run Page kind: unsupported with accepted>0 retries then does not stay on the same page forever', async () => {
        await AssistedCaptureSession.updateOne({ _id: sessionId }, {
            $set: {
                status: 'awaiting_user',
                acceptedCount: 110,
                googlePageIndex: 12,
                failCode: 'UNSUPPORTED_LAYOUT',
                failMessage: 'Page kind: unsupported',
                pendingCaptureStatus: 'none',
                'autoCollection.status': 'running',
                'autoCollection.enabled': true,
                'autoCollection.phase': 'await_capture',
                'autoCollection.collectionMode': 'unlimited',
                'autoCollection.pageCollectionMode': 'until_no_more',
                'autoCollection.requestedCaptureTarget': 0,
                'autoCollection.rawRecordsCaptured': 110,
                'autoCollection.lastSuccessfullyCapturedPage': 11,
                'autoCollection.pagesCapturedThisQuery': 11,
                'autoCollection.pagesProcessedTotal': 11,
                'autoCollection.queriesProcessedTotal': 0,
                'autoCollection.queriesCompleted': 0,
                'autoCollection.totalApprovedQueries': 14,
                'autoCollection.lastQueryIndex': 1,
                'autoCollection.unsupportedRetryCount': 0,
                'autoCollection.unsupportedPageKey': '',
                'autoCollection.lastErrorCode': 'agent_fail_ignored_after_accepted_ingest',
                'autoCollection.lastErrorMessage': 'Page kind: unsupported',
                'autoCollection.discoveryStatus': 'running',
                'autoCollection.ownerStoppedAt': null,
                'autoCollection.stopRequested': false,
                'autoCollection.summary.stopReason': '',
                'autoCollection.nextActionAt': new Date(Date.now() - 1000),
                'autoCollection.tickLockUntil': null,
                'autoCollection.lastDiscoveryAt': new Date(Date.now() - 180000),
            },
            $unset: { failedAt: 1 },
        });
        const first = await tickAutoCollection({ companyId, user, sessionId });
        assert.equal(first.autoCollection.status, 'running');
        assert.notEqual(first.autoCollection.status, 'completed');
        assert.equal(Number(first.autoCollection.queriesCompleted || 0), 0);
        assert.ok(Number(first.session?.acceptedCount || first.autoCollection?.rawRecordsCaptured || 0) >= 110);
        assert.equal(first.autoCollection.providerState, 'Retry');
        assert.match(String(first.autoCollection.lastErrorMessage || ''), /Waiting on provider|retrying/i);

        await AssistedCaptureSession.updateOne({ _id: sessionId }, {
            $set: {
                status: 'awaiting_user',
                acceptedCount: 110,
                googlePageIndex: 12,
                failCode: 'UNSUPPORTED_LAYOUT',
                failMessage: 'Page kind: unsupported',
                pendingCaptureStatus: 'none',
                'autoCollection.status': 'running',
                'autoCollection.enabled': true,
                'autoCollection.phase': 'await_capture',
                'autoCollection.unsupportedRetryCount': MAX_UNSUPPORTED_PAGE_RETRIES,
                'autoCollection.unsupportedPageKey': `${(await AssistedCaptureSession.findById(sessionId).select('queryId').lean())?.queryId}:12`,
                'autoCollection.lastErrorCode': 'UNSUPPORTED_LAYOUT',
                'autoCollection.lastErrorMessage': 'Page kind: unsupported',
                'autoCollection.ownerStoppedAt': null,
                'autoCollection.stopRequested': false,
                'autoCollection.nextActionAt': new Date(Date.now() - 1000),
                'autoCollection.tickLockUntil': null,
            },
        });
        const advanced = await tickAutoCollection({ companyId, user, sessionId });
        const completed = Number(advanced.autoCollection?.queriesCompleted || 0);
        const phase = String(advanced.autoCollection?.phase || '');
        const lastQuery = Number(advanced.autoCollection?.lastQueryIndex || 0);
        assert.ok(
            completed >= 1 || lastQuery >= 2 || ['next_query', 'await_query_ready', 'complete_query'].includes(phase),
            `expected query advancement, got completed=${completed} lastQuery=${lastQuery} phase=${phase}`,
        );
        assert.ok(Number(advanced.autoCollection?.rawRecordsCaptured || advanced.session?.acceptedCount || 0) >= 110);
    });
});
