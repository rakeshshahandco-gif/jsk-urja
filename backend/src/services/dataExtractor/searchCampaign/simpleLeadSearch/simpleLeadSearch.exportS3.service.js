/**
 * Persist Data Extractor export artifacts to FileStorage (S3 when configured).
 * Metadata only on AssistedCaptureSession.exportArtifacts — no new collection.
 */
import zlib from 'zlib';
import { promisify } from 'util';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { getFileStorageService } from '../../../fileStorage/index.js';
import { exportSimpleLeadSearchResults } from './simpleLeadSearch.service.js';
import { exportAllCurrentCampaignData } from './simpleLeadSearch.capturedData.service.js';
import logger from '../../../../utils/logger.js';

const gzip = promisify(zlib.gzip);

function yyyyMm(d = new Date()) {
    const yyyy = String(d.getUTCFullYear());
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return { yyyy, mm };
}

function buildRunObjectKey({ companyId, financialYearId, runId, fileName, now = new Date() }) {
    const { yyyy, mm } = yyyyMm(now);
    const fy = financialYearId || 'none';
    return [
        'company', String(companyId),
        'financial-year', String(fy),
        'data-extractor',
        'runs', String(runId),
        yyyy, mm,
        fileName,
    ].join('/');
}

/**
 * Generate Excel (+ optional JSON.gz) for a completed/active session and upload to storage.
 * Does not change extraction algorithms — reuses existing export builders.
 */
export async function persistSessionExportArtifacts({
    companyId,
    user,
    sessionId,
    financialYearId = 'none',
} = {}) {
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId });
    if (!session) {
        const err = new Error('Session not found');
        err.statusCode = 404;
        throw err;
    }

    const storage = getFileStorageService();
    const artifacts = { ...(session.exportArtifacts && typeof session.exportArtifacts === 'object' ? session.exportArtifacts : {}) };
    const generatedBy = user?._id || user?.id || null;
    const generatedAt = new Date().toISOString();

    // Prefer full campaign workbook when available; fall back to unverified session export.
    let xlsxBuffer = null;
    let xlsxName = `results-${sessionId}.xlsx`;
    try {
        const all = await exportAllCurrentCampaignData({ companyId, user, sessionId });
        if (Buffer.isBuffer(all?.buffer)) {
            xlsxBuffer = all.buffer;
            xlsxName = all.filename || xlsxName;
        }
    } catch (e) {
        logger.warn(`[SLS-ExportS3] export-all failed, trying session export: ${e?.message || e}`);
    }
    if (!xlsxBuffer) {
        const one = await exportSimpleLeadSearchResults({ companyId, user, sessionId });
        if (Buffer.isBuffer(one?.buffer)) {
            xlsxBuffer = one.buffer;
            xlsxName = one.filename || xlsxName;
        }
    }
    if (!xlsxBuffer) {
        throw new Error('Export workbook could not be generated');
    }

    const xlsxKey = buildRunObjectKey({
        companyId,
        financialYearId,
        runId: sessionId,
        fileName: 'results.xlsx',
    });
    const xlsxMeta = await storage.uploadFile({
        companyId,
        financialYearId,
        module: 'data-extractor',
        originalFileName: xlsxName,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: xlsxBuffer,
        createdBy: generatedBy,
        objectKey: xlsxKey,
        skipValidation: true,
    });
    artifacts.xlsx = {
        storageProvider: xlsxMeta.storageProvider,
        objectKey: xlsxMeta.objectKey,
        originalFileName: xlsxMeta.originalFileName || xlsxName,
        mimeType: xlsxMeta.mimeType,
        fileSize: xlsxMeta.fileSize,
        checksum: xlsxMeta.checksum,
        generatedAt,
        generatedBy,
        runId: String(sessionId),
    };

    // Compact JSON summary (not full operational DB) for durable download
    const jsonPayload = JSON.stringify({
        runId: String(sessionId),
        campaignId: session.campaignId ? String(session.campaignId) : null,
        exportedAt: generatedAt,
        autoCollection: session.autoCollection || null,
        autoProcessingCounts: session.autoProcessing?.counts || null,
        note: 'Operational rows remain in MongoDB; this is an export artifact.',
    });
    const jsonGz = await gzip(Buffer.from(jsonPayload, 'utf8'));
    const jsonKey = buildRunObjectKey({
        companyId,
        financialYearId,
        runId: sessionId,
        fileName: 'results.json.gz',
    });
    const jsonMeta = await storage.uploadFile({
        companyId,
        financialYearId,
        module: 'data-extractor',
        originalFileName: 'results.json.gz',
        mimeType: 'application/gzip',
        buffer: jsonGz,
        createdBy: generatedBy,
        objectKey: jsonKey,
        skipValidation: true,
    });
    artifacts.jsonGz = {
        storageProvider: jsonMeta.storageProvider,
        objectKey: jsonMeta.objectKey,
        originalFileName: 'results.json.gz',
        mimeType: jsonMeta.mimeType,
        fileSize: jsonMeta.fileSize,
        checksum: jsonMeta.checksum,
        generatedAt,
        generatedBy,
        runId: String(sessionId),
    };

    session.exportArtifacts = artifacts;
    session.markModified('exportArtifacts');
    await session.save();
    return { exportArtifacts: artifacts };
}

export async function getSessionExportDownloadUrl({
    companyId,
    sessionId,
    format = 'xlsx',
    expiresInSeconds = 300,
} = {}) {
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId }).lean();
    if (!session) {
        const err = new Error('Session not found');
        err.statusCode = 404;
        throw err;
    }
    const key = format === 'json' || format === 'jsonGz'
        ? session.exportArtifacts?.jsonGz?.objectKey
        : session.exportArtifacts?.xlsx?.objectKey;
    if (!key) {
        const err = new Error('Export artifact not found — generate export first');
        err.statusCode = 404;
        throw err;
    }
    const storage = getFileStorageService();
    const signed = await storage.getSignedUrl({ objectKey: key, expiresInSeconds });
    const url = typeof signed === 'string' ? signed : signed?.url;
    return {
        url,
        expiresInSeconds,
        objectKey: key,
        format: format === 'json' || format === 'jsonGz' ? 'jsonGz' : 'xlsx',
        meta: format === 'json' || format === 'jsonGz'
            ? session.exportArtifacts?.jsonGz
            : session.exportArtifacts?.xlsx,
    };
}
