/**
 * Phase 1 S3 archive foundation — copy completed campaign rows via FileStorage.
 * Never deletes Mongo raw data.
 */
import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { SearchQuery } from '../../src/models/searchQuery.model.js';
import { AssistedCaptureSession } from '../../src/models/assistedCaptureSession.model.js';
import { RawCapture } from '../../src/models/rawCapture.model.js';
import { createFileStorageService } from '../../src/services/fileStorage/fileStorage.service.js';
import { createLocalStorageProvider, LOCAL_FILE_STORAGE_ROOT } from '../../src/services/fileStorage/providers/localStorageProvider.js';
import {
    ARCHIVE_STATUSES,
    archiveCampaignRawResults,
    buildArchiveObjectKey,
    getCampaignArchive,
    isArchiveEligible,
    streamRowsToJsonlGz,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.archiveS3.service.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `SLS-ARCH-${Date.now()}`;
const companyId = new mongoose.Types.ObjectId();
const otherCompanyId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const user = { _id: userId, id: userId };

function completedAuto() {
    return {
        enabled: false,
        status: 'completed',
        phase: 'done',
        lastQueryIndex: 3,
        queriesCompleted: 3,
        totalApprovedQueries: 3,
        maxQueries: 3,
        discoveryStatus: 'completed',
        pauseReason: '',
        summary: { stopReason: 'all_queries_exhausted' },
        ownerStoppedAt: null,
        stopRequested: false,
    };
}

async function seedCampaign({ cid = companyId, n = 3, auto = completedAuto(), sessionStatus = 'completed' } = {}) {
    const campaign = await SearchCampaign.create({
        companyId: cid,
        name: `${TAG}-${cid.toString().slice(-4)}`,
        targetIndustry: 'LED',
        status: 'closed',
        createdBy: userId,
    });
    const query = await SearchQuery.create({
        companyId: cid,
        campaignId: campaign._id,
        queryText: 'LED manufacturer',
        queryNormalized: 'led manufacturer',
        sourceHint: 'google',
        status: 'captured',
    });
    const now = new Date();
    const session = await AssistedCaptureSession.create({
        companyId: cid,
        campaignId: campaign._id,
        queryId: query._id,
        searchUrl: 'https://www.google.com/search?q=led',
        searchUrlHash: `hash-${campaign._id}`,
        status: sessionStatus,
        requestFingerprint: `fp-${campaign._id}`,
        tokenHash: `tok-${campaign._id}`,
        tokenExpiresAt: new Date(now.getTime() + 3600000),
        sessionExpiresAt: new Date(now.getTime() + 3600000),
        autoCollection: auto,
    });
    const rows = [];
    for (let i = 0; i < n; i += 1) {
        rows.push({
            companyId: cid,
            campaignId: campaign._id,
            queryId: query._id,
            queryScopeKey: `q-${query._id}`,
            source: 'google',
            captureMethod: 'assisted_visible',
            title: `Company ${i}`,
            snippet: `Snippet ${i}`,
            resultUrlOriginal: `https://example.com/c-${i}`,
            resultUrlNormalized: `https://example.com/c-${i}`,
            displayDomain: 'example.com',
            captureFingerprint: `${TAG}-${campaign._id}-${i}`,
            firstCapturedBy: userId,
            lastCapturedBy: userId,
        });
    }
    if (rows.length) await RawCapture.insertMany(rows);
    return { campaign, query, session };
}

describe('SLS archive helpers', () => {
    it('builds a company-isolated deterministic archive key', () => {
        const key = buildArchiveObjectKey({
            companyId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            financialYearId: 'none',
            campaignId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            now: new Date('2026-09-11T00:00:00Z'),
        });
        assert.equal(
            key,
            'company/aaaaaaaaaaaaaaaaaaaaaaaa/financial-year/none/data-extractor/archives/2026/09/bbbbbbbbbbbbbbbbbbbbbbbb/raw-results.jsonl.gz',
        );
        assert.match(key, /data-extractor\/archives/);
        assert.ok(ARCHIVE_STATUSES.includes('VERIFIED'));
    });

    it('rejects incomplete / paused / agent-offline campaigns', () => {
        assert.equal(isArchiveEligible({
            autoCollection: {
                status: 'running', lastQueryIndex: 1, totalApprovedQueries: 16, queriesCompleted: 0,
            },
        }).ok, false);
        assert.equal(isArchiveEligible({
            autoCollection: {
                status: 'paused', pauseReason: 'DISCOVERY_AGENT_OFFLINE', lastErrorCode: 'DISCOVERY_AGENT_OFFLINE',
                lastQueryIndex: 1, totalApprovedQueries: 16, queriesCompleted: 0,
            },
        }).ok, false);
        assert.equal(isArchiveEligible({
            autoCollection: {
                status: 'running', pauseReason: 'agent_offline', discoveryStatus: 'waiting_for_agent',
                lastQueryIndex: 1, totalApprovedQueries: 5, queriesCompleted: 0,
            },
        }).ok, false);
        assert.equal(isArchiveEligible({
            autoCollection: completedAuto(),
        }).ok, true);
    });

    it('streams JSONL.gz without accumulating rows in memory', async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), 'sls-arch-stream-'));
        const out = path.join(dir, 'raw-results.jsonl.gz');
        async function* fakeRows() {
            for (let i = 0; i < 5000; i += 1) {
                yield {
                    _id: new mongoose.Types.ObjectId(),
                    campaignId: companyId,
                    title: `R${i}`,
                    snippet: 'x',
                    captureFingerprint: `fp-${i}`,
                    source: 'google',
                };
            }
        }
        const written = await streamRowsToJsonlGz(fakeRows(), out);
        assert.equal(written, 5000);
        const gz = await readFile(out);
        assert.equal(gz[0], 0x1f);
        assert.equal(gz[1], 0x8b);
        await rm(dir, { recursive: true, force: true });
    });
});

describe('SLS archive orchestration', () => {
    let storage;
    let uploadCalls;

    before(async () => {
        assert.match(MONGO_URI, /crm_test/);
        await mongoose.connect(MONGO_URI);
        const inner = createFileStorageService({
            provider: 'local',
            providerInstance: createLocalStorageProvider(),
        });
        uploadCalls = 0;
        storage = {
            ...inner,
            async uploadFile(args) {
                uploadCalls += 1;
                return inner.uploadFile(args);
            },
        };
    });

    after(async () => {
        await AssistedCaptureSession.deleteMany({ companyId: { $in: [companyId, otherCompanyId] } });
        await SearchQuery.deleteMany({ companyId: { $in: [companyId, otherCompanyId] } });
        await SearchCampaign.deleteMany({ companyId: { $in: [companyId, otherCompanyId] } });
        await RawCapture.deleteMany({ companyId: { $in: [companyId, otherCompanyId] } });
        await mongoose.disconnect();
        await rm(path.join(LOCAL_FILE_STORAGE_ROOT, 'company', String(companyId)), { recursive: true, force: true }).catch(() => {});
        await rm(path.join(LOCAL_FILE_STORAGE_ROOT, 'company', String(otherCompanyId)), { recursive: true, force: true }).catch(() => {});
    });

    it('archives a small completed campaign, verifies checksum/count, and does not delete Mongo', async () => {
        const { campaign } = await seedCampaign({ n: 3 });
        const before = await RawCapture.countDocuments({ companyId, campaignId: campaign._id });
        const archived = await archiveCampaignRawResults({
            companyId, user, campaignId: campaign._id, storage,
        });
        assert.equal(archived.archiveStatus, 'VERIFIED');
        assert.equal(archived.archiveRecordCount, 3);
        assert.equal(archived.mongoDeleted, false);
        assert.equal(archived.streamed, true);
        assert.match(archived.archiveObjectKey, new RegExp(`company/${companyId}`));
        assert.match(archived.archiveObjectKey, /data-extractor\/archives/);
        assert.match(archived.archiveChecksum, /^[a-f0-9]{64}$/);
        assert.equal(await RawCapture.countDocuments({ companyId, campaignId: campaign._id }), before);
        assert.ok(uploadCalls >= 1, 'upload must go through FileStorageService.uploadFile');
        const exists = await storage.fileExists({ objectKey: archived.archiveObjectKey });
        assert.equal(exists, true);
        const downloaded = await storage.downloadFile({ objectKey: archived.archiveObjectKey });
        const body = downloaded.body;
        assert.equal(body[0], 0x1f);
        assert.equal(body[1], 0x8b);
        assert.equal(createHash('sha256').update(body).digest('hex'), archived.archiveChecksum);
        const status = await getCampaignArchive({ companyId, campaignId: campaign._id });
        assert.equal(status.archiveStatus, 'VERIFIED');
        assert.equal(status.mongoRecordCount, 3);
    });

    it('archives a 1,000-row completed campaign through batched streaming', async () => {
        const { campaign } = await seedCampaign({ n: 1000 });
        const archived = await archiveCampaignRawResults({
            companyId, user, campaignId: campaign._id, storage,
        });
        assert.equal(archived.archiveStatus, 'VERIFIED');
        assert.equal(archived.archiveRecordCount, 1000);
        assert.equal(await RawCapture.countDocuments({ companyId, campaignId: campaign._id }), 1000);
    });

    it('rejects an incomplete campaign', async () => {
        const { campaign } = await seedCampaign({
            n: 5,
            sessionStatus: 'awaiting_user',
            auto: {
                status: 'running',
                lastQueryIndex: 1,
                totalApprovedQueries: 16,
                queriesCompleted: 0,
                discoveryStatus: 'running',
            },
        });
        await assert.rejects(
            () => archiveCampaignRawResults({ companyId, user, campaignId: campaign._id, storage }),
            /unfinished|running|paused|waiting|completion/i,
        );
        const status = await getCampaignArchive({ companyId, campaignId: campaign._id });
        assert.equal(status.archiveStatus, 'NOT_ARCHIVED');
        assert.equal(await RawCapture.countDocuments({ companyId, campaignId: campaign._id }), 5);
    });

    it('keeps Mongo unchanged when upload fails', async () => {
        const { campaign } = await seedCampaign({ n: 4 });
        const failing = {
            ...storage,
            async uploadFile() { throw new Error('simulated S3 upload failure'); },
        };
        await assert.rejects(
            () => archiveCampaignRawResults({
                companyId, user, campaignId: campaign._id, storage: failing,
            }),
            /upload failure/i,
        );
        const status = await getCampaignArchive({ companyId, campaignId: campaign._id });
        assert.equal(status.archiveStatus, 'FAILED');
        assert.equal(status.mongoRecordCount, 4);
        assert.equal(await RawCapture.countDocuments({ companyId, campaignId: campaign._id }), 4);
    });

    it('retries the same campaign onto the same object key', async () => {
        const { campaign } = await seedCampaign({ n: 2 });
        const first = await archiveCampaignRawResults({
            companyId, user, campaignId: campaign._id, storage,
        });
        const second = await archiveCampaignRawResults({
            companyId, user, campaignId: campaign._id, storage,
        });
        assert.equal(first.archiveObjectKey, second.archiveObjectKey);
        assert.equal(second.archiveStatus, 'VERIFIED');
        assert.equal(await RawCapture.countDocuments({ companyId, campaignId: campaign._id }), 2);
    });

    it('keeps company isolation in object keys', async () => {
        const a = await seedCampaign({ cid: companyId, n: 1 });
        const b = await seedCampaign({ cid: otherCompanyId, n: 1 });
        const archA = await archiveCampaignRawResults({
            companyId, user, campaignId: a.campaign._id, storage,
        });
        const archB = await archiveCampaignRawResults({
            companyId: otherCompanyId, user, campaignId: b.campaign._id, storage,
        });
        assert.match(archA.archiveObjectKey, new RegExp(`company/${companyId}`));
        assert.match(archB.archiveObjectKey, new RegExp(`company/${otherCompanyId}`));
        assert.notEqual(archA.archiveObjectKey, archB.archiveObjectKey);
    });

    it('uses the configured FileStorage provider (DEV local isolation)', async () => {
        const { campaign } = await seedCampaign({ n: 1 });
        const archived = await archiveCampaignRawResults({
            companyId, user, campaignId: campaign._id, storage,
        });
        assert.equal(archived.storageProvider, 'local');
        assert.equal(archived.bucket || '', '');
        assert.match(archived.archiveObjectKey, /data-extractor\/archives/);
        assert.notEqual(archived.bucket, process.env.AWS_S3_BUCKET || 'prod-bucket');
    });

    it('retries a FAILED archive onto the same object key', async () => {
        const { campaign } = await seedCampaign({ n: 2 });
        const failing = {
            ...storage,
            async uploadFile() { throw new Error('simulated S3 upload failure'); },
        };
        await assert.rejects(
            () => archiveCampaignRawResults({
                companyId, user, campaignId: campaign._id, storage: failing,
            }),
            /upload failure/i,
        );
        const failed = await getCampaignArchive({ companyId, campaignId: campaign._id });
        assert.equal(failed.archiveStatus, 'FAILED');
        const retried = await archiveCampaignRawResults({
            companyId, user, campaignId: campaign._id, storage,
        });
        assert.equal(retried.archiveStatus, 'VERIFIED');
        assert.equal(retried.archiveObjectKey, failed.archiveObjectKey);
        assert.equal(await RawCapture.countDocuments({ companyId, campaignId: campaign._id }), 2);
    });

    it('does not change a running campaign when archive is rejected', async () => {
        const { campaign, session } = await seedCampaign({
            n: 2,
            sessionStatus: 'awaiting_user',
            auto: {
                status: 'running',
                lastQueryIndex: 1,
                totalApprovedQueries: 16,
                queriesCompleted: 0,
                discoveryStatus: 'running',
            },
        });
        await assert.rejects(
            () => archiveCampaignRawResults({ companyId, user, campaignId: campaign._id, storage }),
            /running|waiting|paused|unfinished/i,
        );
        const freshSession = await AssistedCaptureSession.findById(session._id).lean();
        const freshCampaign = await SearchCampaign.findById(campaign._id).lean();
        assert.equal(freshSession.autoCollection.status, 'running');
        assert.equal(freshSession.status, 'awaiting_user');
        assert.equal(freshCampaign.s3Archive?.status || 'NOT_ARCHIVED', 'NOT_ARCHIVED');
        assert.equal(await RawCapture.countDocuments({ companyId, campaignId: campaign._id }), 2);
    });

    it('stores metadata on search_campaigns and does not create a new collection', async () => {
        assert.equal(SearchCampaign.collection.collectionName, 'search_campaigns');
        const names = await mongoose.connection.db.listCollections({ name: /data.?extractor.?archive/i }).toArray();
        assert.equal(names.length, 0);
        const { campaign } = await seedCampaign({ n: 1 });
        await archiveCampaignRawResults({ companyId, user, campaignId: campaign._id, storage });
        const after = await mongoose.connection.db.listCollections({ name: /data.?extractor.?archive/i }).toArray();
        assert.equal(after.length, 0);
        const stored = await SearchCampaign.findById(campaign._id).lean();
        assert.equal(stored.s3Archive.status, 'VERIFIED');
        assert.ok(stored.s3Archive.objectKey);
        assert.ok(stored.s3Archive.checksum);
    });
});
