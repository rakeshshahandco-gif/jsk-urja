/**
 * Campaign captured-data visibility + full export (no CRM leads).
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
    listCampaignCapturedData,
    exportAllCurrentCampaignData,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.capturedData.service.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `CAPDATA-${Date.now()}`;
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

describe('SLS campaign captured data visibility + export', () => {
    let sessionId;
    let campaignId;
    let queryId;
    let leadsBefore;

    before(async () => {
        assert.match(String(MONGO_URI), /crm_test|127\.0\.0\.1/);
        await mongoose.connect(MONGO_URI.includes('127.0.0.1') ? MONGO_URI : 'mongodb://127.0.0.1:27017/crm_test');
        leadsBefore = await Lead.countDocuments({ companyId });
        const started = await startSimpleLeadSearch({
            companyId,
            user,
            body: { product: `Captured Data ${TAG}`, city: 'Mumbai', idempotencyKey: `${TAG}-start` },
            headers: {},
        });
        sessionId = started.session._id;
        campaignId = started.campaign._id;
        queryId = started.selectedQuery.id;
        const docs = [];
        for (let i = 0; i < 12; i += 1) {
            docs.push({
                companyId,
                campaignId,
                queryId,
                queryScopeKey: String(queryId),
                source: 'google',
                captureMethod: 'assisted_visible',
                title: `CapData Co ${i} ${TAG}`,
                titleNormalized: `capdata co ${i} ${TAG}`.toLowerCase(),
                snippet: 'home automation',
                resultUrlOriginal: `https://capdata-${TAG}-${i}.example/`,
                resultUrlNormalized: `https://capdata-${TAG}-${i}.example/`,
                displayDomain: `capdata-${TAG}-${i}.example`,
                captureFingerprint: `fp-capdata-${i}-${TAG}`,
                enrichmentStatus: i < 8 ? 'pending' : 'failed',
                enrichmentBlockedReason: i >= 8 ? 'timeout temporary' : '',
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

    it('lists all campaign records with exclusive buckets totaling campaign size', async () => {
        const data = await listCampaignCapturedData({
            companyId,
            user,
            sessionId,
            query: { tab: 'all', limit: 'all' },
        });
        assert.equal(data.pagination.campaignTotal, 12);
        assert.equal(data.tabCounts.all, 12);
        assert.equal(data.items.length, 12);
        assert.equal(data.exclusiveBuckets.total, 12);
        assert.ok(data.tabCounts.waiting >= 8);
        assert.ok(data.tabCounts.failed >= 1);
    });

    it('exports all current rows without creating CRM leads', async () => {
        const exported = await exportAllCurrentCampaignData({ companyId, user, sessionId });
        assert.equal(exported.rowCount, 12);
        assert.ok(Buffer.isBuffer(exported.buffer));
        assert.ok(exported.buffer.length > 1000);
        assert.ok(exported.sheetNames.includes('All Captured Records'));
        assert.ok(exported.sheetNames.includes('Campaign Summary'));
        assert.equal(await Lead.countDocuments({ companyId }), leadsBefore);
    });
});
