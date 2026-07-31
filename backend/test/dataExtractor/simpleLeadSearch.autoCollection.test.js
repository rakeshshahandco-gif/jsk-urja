/**
 * Simple Lead Search — Auto Collection (settings + progress helpers).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { AssistedCaptureSession } from '../../src/models/assistedCaptureSession.model.js';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { SearchQuery } from '../../src/models/searchQuery.model.js';
import { RawCapture } from '../../src/models/rawCapture.model.js';
import { Lead } from '../../src/models/lead.model.js';
import { startSimpleLeadSearch } from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.service.js';
import {
    startAutoCollection,
    pauseAutoCollection,
    resumeAutoCollection,
    stopAutoCollection,
    tickAutoCollection,
    readSettings,
    progressView,
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
    it('supports batch page collection settings', () => {
        const s = readSettings({ pageCollectionMode: 'batches', pagesPerBatch: 10, maxSafetyPagesPerQuery: 40, pauseAfterEachBatch: true });
        assert.equal(s.pageCollectionMode, 'batches');
        assert.equal(s.pagesPerBatch, 10);
        assert.equal(s.maxSafetyPagesPerQuery, 40);
        assert.equal(s.pauseAfterEachBatch, true);
        const u = readSettings({ pageCollectionMode: 'until_no_more', maxSafetyPagesPerQuery: 99, stopOnNoNewUniquePages: false });
        assert.equal(u.pageCollectionMode, 'until_no_more');
        assert.equal(u.maxSafetyPagesPerQuery, 50);
        assert.equal(u.stopOnNoNewUniquePages, true);
    });

    it('clamps owner settings', () => {
        const s = readSettings({
            pageCollectionMode: 'fixed',
            maxPagesPerQuery: 99,
            maxQueries: 0,
            delayMinSec: 1,
            delayMaxSec: 500,
            stopAtUnique: -3,
            stopOnNoNewUniquePages: false,
            autoEnrichAfter: true,
            autoQualifyAfterEnrich: true,
        });
        assert.equal(s.pageCollectionMode, 'fixed');
        assert.equal(s.maxPagesPerQuery, 10);
        assert.equal(s.maxQueries, 1);
        assert.equal(s.delayMinSec, 5);
        assert.equal(s.delayMaxSec, 180);
        assert.equal(s.stopAtUnique, 0);
        assert.equal(s.stopOnNoNewUniquePages, false);
        assert.equal(s.autoEnrichAfter, true);
    });

    it('defaults to Until No More Results with forced zero-new stop', () => {
        const d = readSettings({});
        assert.equal(d.pageCollectionMode, 'until_no_more');
        assert.equal(d.stopOnNoNewUniquePages, true);
        assert.equal(d.maxQueries, 24);
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
        const started = await startSimpleLeadSearch({ companyId, user, body: { product: 'LED Light Manufacturer', city: 'Ahmedabad', idempotencyKey: `${TAG}-start` }, headers: {} });
        sessionId = started.session._id;
        await AssistedCaptureSession.updateOne({ _id: sessionId }, { $set: { status: 'awaiting_user', browserOpenedAcked: true, googlePageIndex: 1 } });
    });
    after(async () => {
        await AssistedCaptureSession.deleteMany({ companyId });
        await SearchQuery.deleteMany({ companyId });
        await SearchCampaign.deleteMany({ companyId });
        await RawCapture.deleteMany({ companyId });
        await mongoose.disconnect();
    });
    it('starts, pauses, resumes, stops without creating Leads', async () => {
        const started = await startAutoCollection({ companyId, user, sessionId, body: { maxPagesPerQuery: 2, maxQueries: 2, delayMinSec: 5, delayMaxSec: 5, stopOnNoNewUniquePages: true, autoEnrichAfter: false, autoQualifyAfterEnrich: false } });
        assert.equal(started.autoCollection.status, 'running');
        const paused = await pauseAutoCollection({ companyId, user, sessionId });
        assert.equal(paused.autoCollection.status, 'paused_owner');
        const resumed = await resumeAutoCollection({ companyId, user, sessionId });
        assert.equal(resumed.autoCollection.status, 'running');
        await AssistedCaptureSession.updateOne({ _id: sessionId }, { $set: { status: 'manual_action_required', manualActionMessage: 'Unusual traffic' } });
        const ticked = await tickAutoCollection({ companyId, user, sessionId });
        assert.equal(ticked.autoCollection.status, 'paused_manual');
        await AssistedCaptureSession.updateOne({ _id: sessionId }, { $set: { status: 'awaiting_user', manualActionMessage: '' } });
        const stopped = await stopAutoCollection({ companyId, user, sessionId });
        assert.equal(stopped.autoCollection.status, 'stopped');
        assert.equal(stopped.preserved.rawCaptures, true);
        assert.equal(await Lead.countDocuments({ companyId }), leadsBefore);
    });
});