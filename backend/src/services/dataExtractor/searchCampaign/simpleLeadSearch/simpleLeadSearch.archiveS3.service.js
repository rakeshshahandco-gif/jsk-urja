/**
 * Phase 1 — copy completed campaign raw rows to FileStorage (S3/local).
 * Reuses FileStorageService. Does not delete Mongo data.
 */
import { createHash } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { mkdtemp, readFile, unlink, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createGunzip, createGzip } from 'zlib';
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { SearchCampaign } from '../../../../models/searchCampaign.model.js';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { getFileStorageService } from '../../../fileStorage/index.js';
import {
    collectionHasUnfinishedWork,
    isInvalidCompletedCollection,
    isLongAgentOfflinePause,
    isOwnerStopped,
} from './simpleLeadSearch.autoCollection.service.js';

export const ARCHIVE_STATUSES = Object.freeze(['NOT_ARCHIVED', 'ARCHIVING', 'VERIFIED', 'FAILED']);
export const ARCHIVE_CURSOR_BATCH = 200;

function requireCompanyId(companyId) {
    if (!companyId || !mongoose.isValidObjectId(companyId)) throw new ApiError(400, 'Company context required');
    return companyId;
}

function yyyyMm(d = new Date()) {
    return {
        yyyy: String(d.getUTCFullYear()),
        mm: String(d.getUTCMonth() + 1).padStart(2, '0'),
    };
}

export function buildArchiveObjectKey({
    companyId,
    financialYearId = 'none',
    campaignId,
    fileName = 'raw-results.jsonl.gz',
    now = new Date(),
} = {}) {
    const { yyyy, mm } = yyyyMm(now);
    return [
        'company', String(companyId),
        'financial-year', String(financialYearId || 'none'),
        'data-extractor',
        'archives',
        yyyy,
        mm,
        String(campaignId),
        String(fileName),
    ].join('/');
}

export function emptyArchiveMeta() {
    return {
        status: 'NOT_ARCHIVED',
        startedAt: null,
        completedAt: null,
        archivedAt: null,
        objectKey: '',
        checksum: '',
        size: 0,
        recordCount: 0,
        error: '',
        storageProvider: '',
        bucket: '',
    };
}

export function archiveView(campaign = {}) {
    const a = campaign?.s3Archive || {};
    return {
        archiveStatus: a.status || 'NOT_ARCHIVED',
        archiveStartedAt: a.startedAt || null,
        archiveCompletedAt: a.completedAt || null,
        archivedAt: a.archivedAt || null,
        archiveObjectKey: a.objectKey || '',
        archiveChecksum: a.checksum || '',
        archiveSize: Number(a.size || 0),
        archiveRecordCount: Number(a.recordCount || 0),
        archiveError: a.error || '',
        storageProvider: a.storageProvider || '',
        bucket: a.bucket || '',
    };
}

function isLiveCollection(session) {
    const ac = session?.autoCollection || {};
    const st = String(ac.status || '');
    if (['running', 'paused', 'paused_owner', 'paused_manual', 'paused_batch'].includes(st)) return true;
    if (ac.pauseReason === 'agent_offline' || ac.discoveryStatus === 'waiting_for_agent') return true;
    if (isLongAgentOfflinePause(session)) return true;
    return false;
}

export function isArchiveEligible(session, { ownerApproved = false } = {}) {
    if (!session) return { ok: false, reason: 'No capture session found for this campaign.' };
    if (isLiveCollection(session)) {
        return { ok: false, reason: 'Campaign is still running, waiting, or paused. Archive is not allowed.' };
    }
    if (collectionHasUnfinishedWork(session) || isInvalidCompletedCollection(session)) {
        return { ok: false, reason: 'Campaign still has unfinished or retryable work. Archive is not allowed.' };
    }
    const ac = session.autoCollection || {};
    if (String(ac.status || '') === 'completed') return { ok: true, reason: '' };
    if (ownerApproved && (isOwnerStopped(session) || String(ac.status || '') === 'stopped')) {
        return { ok: true, reason: '' };
    }
    return { ok: false, reason: 'Archive only after genuine completion or explicit owner approval.' };
}

function mapRawRow(doc) {
    return {
        _id: String(doc._id),
        campaignId: String(doc.campaignId || ''),
        queryId: doc.queryId ? String(doc.queryId) : null,
        source: doc.source || '',
        title: doc.title || '',
        snippet: doc.snippet || '',
        resultUrl: doc.resultUrlNormalized || doc.resultUrlOriginal || '',
        displayDomain: doc.displayDomain || '',
        captureFingerprint: doc.captureFingerprint || '',
        inboxStatus: doc.inboxStatus || '',
        enrichmentStatus: doc.enrichmentStatus || '',
        qualificationStatus: doc.qualificationStatus || '',
        crmStatus: doc.crmStatus || '',
        crmLeadId: doc.crmLeadId ? String(doc.crmLeadId) : null,
        firstSeenAt: doc.firstSeenAt || null,
        lastSeenAt: doc.lastSeenAt || null,
        seenCount: Number(doc.seenCount || 1),
    };
}

async function sha256File(filePath) {
    const hash = createHash('sha256');
    const rs = createReadStream(filePath);
    for await (const chunk of rs) hash.update(chunk);
    return hash.digest('hex');
}

async function countJsonlGzLines(filePath) {
    let count = 0;
    let leftover = '';
    const gunzip = createGunzip();
    createReadStream(filePath).pipe(gunzip);
    for await (const chunk of gunzip) {
        leftover += chunk.toString('utf8');
        const parts = leftover.split('\n');
        leftover = parts.pop() || '';
        for (const line of parts) {
            if (line.trim()) count += 1;
        }
    }
    if (leftover.trim()) count += 1;
    return count;
}

export async function streamRowsToJsonlGz(rowSource, outPath) {
    let count = 0;
    const gzip = createGzip();
    const out = createWriteStream(outPath);
    const finished = pipeline(gzip, out);
    for await (const doc of rowSource) {
        const ok = gzip.write(`${JSON.stringify(mapRawRow(doc))}\n`);
        if (!ok) await new Promise((resolve) => gzip.once('drain', resolve));
        count += 1;
    }
    gzip.end();
    await finished;
    return count;
}

function rawCaptureCursor({ companyId, campaignId }) {
    return RawCapture.find({ companyId, campaignId })
        .select([
            '_id', 'campaignId', 'queryId', 'source', 'title', 'snippet',
            'resultUrlNormalized', 'resultUrlOriginal', 'displayDomain', 'captureFingerprint',
            'inboxStatus', 'enrichmentStatus', 'qualificationStatus', 'crmStatus', 'crmLeadId',
            'firstSeenAt', 'lastSeenAt', 'seenCount',
        ].join(' '))
        .lean()
        .cursor({ batchSize: ARCHIVE_CURSOR_BATCH });
}

async function markArchive(campaign, patch) {
    campaign.s3Archive = { ...(campaign.s3Archive || emptyArchiveMeta()), ...patch };
    await campaign.save();
    return campaign;
}

export async function getCampaignArchive({ companyId, campaignId }) {
    const cid = requireCompanyId(companyId);
    if (!campaignId || !mongoose.isValidObjectId(campaignId)) throw new ApiError(404, 'Campaign not found');
    const campaign = await SearchCampaign.findOne({ _id: campaignId, companyId: cid }).lean();
    if (!campaign) throw new ApiError(404, 'Campaign not found');
    const expected = await RawCapture.countDocuments({ companyId: cid, campaignId });
    return {
        campaignId: String(campaign._id),
        ...archiveView(campaign),
        mongoRecordCount: expected,
        mongoDeleted: false,
    };
}

export async function archiveCampaignRawResults({
    companyId,
    user,
    campaignId,
    financialYearId = 'none',
    ownerApproved = false,
    storage = null,
    rowSource = null,
} = {}) {
    const cid = requireCompanyId(companyId);
    if (!campaignId || !mongoose.isValidObjectId(campaignId)) throw new ApiError(404, 'Campaign not found');
    const campaign = await SearchCampaign.findOne({ _id: campaignId, companyId: cid });
    if (!campaign) throw new ApiError(404, 'Campaign not found');

    const session = await AssistedCaptureSession.findOne({ companyId: cid, campaignId })
        .sort({ updatedAt: -1 })
        .lean();
    const eligible = isArchiveEligible(session, { ownerApproved });
    if (!eligible.ok) throw new ApiError(400, eligible.reason);

    const expectedCount = await RawCapture.countDocuments({ companyId: cid, campaignId });
    const beforeCount = expectedCount;
    const fileStore = storage || getFileStorageService();
    const previousKey = String(campaign.s3Archive?.objectKey || '').trim();
    const objectKey = previousKey || buildArchiveObjectKey({
        companyId: cid,
        financialYearId,
        campaignId,
    });

    await markArchive(campaign, {
        status: 'ARCHIVING',
        startedAt: new Date(),
        error: '',
        objectKey,
    });

    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'sls-archive-'));
    const tmpFile = path.join(tmpDir, 'raw-results.jsonl.gz');
    try {
        const source = rowSource || rawCaptureCursor({ companyId: cid, campaignId });
        const written = await streamRowsToJsonlGz(source, tmpFile);
        if (written !== expectedCount) {
            throw new Error(`Archive count mismatch while writing: wrote ${written}, expected ${expectedCount}`);
        }
        const checksum = await sha256File(tmpFile);
        const buffer = await readFile(tmpFile);
        const uploaded = await fileStore.uploadFile({
            companyId: cid,
            financialYearId,
            module: 'data-extractor',
            originalFileName: 'raw-results.jsonl.gz',
            mimeType: 'application/gzip',
            buffer,
            createdBy: user?._id || user?.id || null,
            objectKey,
            skipValidation: true,
        });
        const exists = await fileStore.fileExists({ objectKey });
        if (!exists) throw new Error('Archive object was not found after upload');
        const downloaded = await fileStore.downloadFile({ objectKey });
        const body = downloaded?.body || downloaded;
        const downloadedBuf = Buffer.isBuffer(body) ? body : Buffer.from(body || []);
        const downloadedChecksum = createHash('sha256').update(downloadedBuf).digest('hex');
        if (downloadedChecksum !== checksum || downloadedChecksum !== uploaded.checksum) {
            throw new Error('Archive checksum verification failed');
        }
        const verifiedCount = await countJsonlGzLines(tmpFile);
        if (verifiedCount !== expectedCount) {
            throw new Error(`Archive record count verification failed: archived ${verifiedCount}, expected ${expectedCount}`);
        }
        const afterCount = await RawCapture.countDocuments({ companyId: cid, campaignId });
        if (afterCount !== beforeCount) {
            throw new Error('Mongo raw data changed during archive; leaving data untouched');
        }
        await markArchive(campaign, {
            status: 'VERIFIED',
            completedAt: new Date(),
            archivedAt: new Date(),
            objectKey,
            checksum,
            size: buffer.length,
            recordCount: verifiedCount,
            error: '',
            storageProvider: uploaded.storageProvider || '',
            bucket: uploaded.bucket || '',
        });
        return {
            campaignId: String(campaign._id),
            ...archiveView(campaign.toObject()),
            mongoRecordCount: afterCount,
            mongoDeleted: false,
            streamed: true,
        };
    } catch (err) {
        const afterCount = await RawCapture.countDocuments({ companyId: cid, campaignId }).catch(() => beforeCount);
        await markArchive(campaign, {
            status: 'FAILED',
            objectKey,
            error: String(err?.message || 'Archive failed').slice(0, 500),
            completedAt: new Date(),
        }).catch(() => null);
        if (Number(err?.statusCode) === 400) throw err;
        const fail = new ApiError(400, String(err?.message || 'Archive failed').slice(0, 500));
        fail.archiveStatus = 'FAILED';
        fail.mongoRecordCount = afterCount;
        fail.mongoDeleted = afterCount !== beforeCount ? true : false;
        throw fail;
    } finally {
        await unlink(tmpFile).catch(() => {});
        await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
}
