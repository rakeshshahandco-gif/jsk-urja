/**
 * RawCapture batch ingestion (Checkpoint 3 / 3A).
 * No fetch, enrichment, AI, or CRM promotion.
 */
import mongoose from 'mongoose';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { RawCaptureBatch } from '../../../../models/rawCaptureBatch.model.js';
import { SearchQuery } from '../../../../models/searchQuery.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { getOwnedSearchCampaign } from '../searchCampaign.service.js';
import {
    CAMPAIGN_ELIGIBLE_FOR_CAPTURE,
    QUERY_ELIGIBLE_FOR_CAPTURE,
    RAW_CAPTURE_BATCH_MAX,
    RAW_CAPTURE_CAMPAIGN_MANUAL_SCOPE,
    RAW_CAPTURE_FAILURE_CODE_MAX,
    RAW_CAPTURE_FAILURE_MESSAGE_MAX,
    RAW_CAPTURE_IDEMPOTENCY_REUSED_CODE,
    RAW_CAPTURE_VALIDATION_ERRORS_MAX,
} from './constants.js';
import { buildCaptureFingerprint, buildRequestFingerprint } from './normalize.util.js';
import { actorUserId, assertRawIngest } from './permissions.util.js';
import { normalizeIngestRecord, validateIngestBody } from './validation.js';

function requireCompanyId(companyId) {
    if (!companyId || !mongoose.isValidObjectId(companyId)) {
        throw new ApiError(400, 'Company context required');
    }
    return companyId;
}

function requireObjectId(id, label) {
    if (!id || !mongoose.isValidObjectId(id)) {
        throw new ApiError(404, `${label} not found`);
    }
    return id;
}

function throwIdempotencyReuse() {
    const err = new ApiError(
        409,
        'Idempotency key was previously used for a different capture request',
    );
    err.errorCode = RAW_CAPTURE_IDEMPOTENCY_REUSED_CODE;
    throw err;
}

async function loadOwnedQueryForCapture(companyId, campaignId, queryId) {
    requireObjectId(queryId, 'Search query');
    const q = await SearchQuery.findOne({ _id: queryId, companyId, campaignId }).lean();
    if (!q) throw new ApiError(404, 'Search query not found');
    if (!QUERY_ELIGIBLE_FOR_CAPTURE.includes(q.status)) {
        throw new ApiError(400, `Cannot ingest under query status: ${q.status}`);
    }
    return q;
}

/**
 * Source-of-truth SearchQuery capture stats (internal).
 * resultCount = all RawCaptures for query (including archived).
 * captureCount = completed|partially_completed batches for query.
 */
export async function recalculateSearchQueryCaptureStats(companyId, campaignId, queryId, userId = null) {
    requireCompanyId(companyId);
    requireObjectId(campaignId, 'Search campaign');
    requireObjectId(queryId, 'Search query');

    const [resultCount, captureCount, latestBatch] = await Promise.all([
        RawCapture.countDocuments({ companyId, campaignId, queryId }),
        RawCaptureBatch.countDocuments({
            companyId,
            campaignId,
            queryId,
            status: { $in: ['completed', 'partially_completed'] },
        }),
        RawCaptureBatch.findOne({
            companyId,
            campaignId,
            queryId,
            status: { $in: ['completed', 'partially_completed'] },
        }).sort({ completedAt: -1, updatedAt: -1 }).lean(),
    ]);

    const current = await SearchQuery.findOne({ _id: queryId, companyId, campaignId });
    if (!current) return null;

    const $set = {
        resultCount,
        captureCount,
        updatedBy: userId || current.updatedBy || null,
    };

    if (latestBatch) {
        $set.lastCapturedAt = latestBatch.completedAt || latestBatch.updatedAt || null;
        $set.lastCapturedBy = latestBatch.createdBy || null;
    } else {
        $set.lastCapturedAt = null;
        $set.lastCapturedBy = null;
    }

    // Only promote status when at least one accepted capture batch exists
    if (captureCount > 0 && ['approved', 'opened', 'captured'].includes(current.status)) {
        $set.status = 'captured';
    }

    return SearchQuery.findOneAndUpdate(
        { _id: queryId, companyId, campaignId },
        { $set },
        { new: true },
    ).lean();
}

/** Alias kept for Checkpoint 3 callers. */
export async function recalculateQueryCaptureStats(companyId, campaignId, queryId, userId) {
    return recalculateSearchQueryCaptureStats(companyId, campaignId, queryId, userId);
}

/** Internal batch reconcile from stored IDs/counts (no destructive rollback). */
export async function reconcileRawCaptureBatch(companyId, batchId) {
    requireCompanyId(companyId);
    requireObjectId(batchId, 'Capture batch');
    const batch = await RawCaptureBatch.findOne({ _id: batchId, companyId });
    if (!batch) throw new ApiError(404, 'Capture batch not found');

    const ids = (batch.rawCaptureIds || []).slice(0, RAW_CAPTURE_BATCH_MAX);
    const existing = await RawCapture.countDocuments({
        companyId,
        _id: { $in: ids },
    });
    // Keep stored counts; only refresh query stats if query-linked and terminal
    if (
        batch.queryId
        && ['completed', 'partially_completed', 'failed'].includes(batch.status)
    ) {
        await recalculateSearchQueryCaptureStats(
            companyId,
            batch.campaignId,
            batch.queryId,
            batch.createdBy,
        );
    }
    return {
        batchId: batch._id,
        status: batch.status,
        storedRawCaptureIds: ids.length,
        existingRawCaptures: existing,
    };
}

function formatBatchResponse(batch, {
    query = null,
    idempotentReplay = false,
    processingInFlight = false,
} = {}) {
    return {
        batchId: batch._id,
        idempotencyKey: batch.idempotencyKey,
        requestFingerprint: batch.requestFingerprint || null,
        status: batch.status,
        requestedCount: batch.requestedCount,
        acceptedCount: batch.acceptedCount,
        insertedCount: batch.insertedCount,
        updatedExistingCount: batch.updatedExistingCount,
        updatedExistingArchivedCount: batch.updatedExistingArchivedCount || 0,
        rejectedCount: batch.rejectedCount,
        rawCaptureIds: (batch.rawCaptureIds || []).slice(0, RAW_CAPTURE_BATCH_MAX),
        validationErrors: (batch.validationErrors || []).slice(0, RAW_CAPTURE_VALIDATION_ERRORS_MAX),
        queryCaptureCount: query?.captureCount ?? null,
        queryResultCount: query?.resultCount ?? null,
        queryStatus: query?.status ?? null,
        idempotentReplay: Boolean(idempotentReplay),
        processingInFlight: Boolean(processingInFlight),
    };
}

async function loadQueryForBatchResponse(companyId, campaignId, queryId) {
    if (!queryId) return null;
    return SearchQuery.findOne({ _id: queryId, companyId, campaignId }).lean();
}

function assertFingerprintMatch(existingBatch, campaignId, requestFingerprint) {
    if (existingBatch.requestFingerprint
        && existingBatch.requestFingerprint !== requestFingerprint) {
        throwIdempotencyReuse();
    }
    if (!existingBatch.requestFingerprint) {
        if (String(existingBatch.campaignId) !== String(campaignId)) {
            throwIdempotencyReuse();
        }
    }
}

/**
 * Same key + same fingerprint terminal/in-flight response.
 * Contract: HTTP 200 with existing state; processingInFlight when status is processing.
 * `received` is claimed for resume by the caller (not returned here).
 */
async function resolveExistingBatch({
    companyId, campaignId, existingBatch, requestFingerprint,
}) {
    assertFingerprintMatch(existingBatch, campaignId, requestFingerprint);
    const qDoc = await loadQueryForBatchResponse(companyId, campaignId, existingBatch.queryId);
    const processingInFlight = existingBatch.status === 'processing';
    return formatBatchResponse(existingBatch, {
        query: qDoc,
        idempotentReplay: true,
        processingInFlight,
    });
}

async function upsertRawCapture({
    companyId, campaignId, queryId, queryScopeKey, source, querySourceHint,
    captureMethod, captureBatchId, record, userId,
}) {
    const fingerprint = buildCaptureFingerprint({
        source,
        queryScopeKey,
        resultUrlNormalized: record.resultUrlNormalized,
        sourceRecordId: record.sourceRecordId,
        titleNormalized: record.titleNormalized,
        snippetNormalized: record.snippetNormalized,
    });

    const filter = {
        companyId,
        campaignId,
        queryScopeKey,
        source,
        captureFingerprint: fingerprint,
    };

    const existing = await RawCapture.findOne(filter);
    if (existing) {
        const wasArchived = existing.inboxStatus === 'archived';
        const prevArchivedAt = existing.archivedAt;
        const prevArchivedBy = existing.archivedBy;
        existing.seenCount = (existing.seenCount || 1) + 1;
        existing.lastSeenAt = new Date();
        existing.lastCapturedBy = userId || null;
        existing.captureBatchId = captureBatchId;
        existing.updatedBy = userId || null;
        if (record.title) existing.title = record.title;
        if (record.titleNormalized) existing.titleNormalized = record.titleNormalized;
        if (record.snippet) existing.snippet = record.snippet;
        if (record.resultPosition != null) existing.resultPosition = record.resultPosition;
        if (record.sourceRecordId) existing.sourceRecordId = record.sourceRecordId;
        if (record.resultTypeHint && record.resultTypeHint !== 'unknown') {
            existing.resultTypeHint = record.resultTypeHint;
        }
        // Never unarchive on repeat sighting
        if (wasArchived) {
            existing.inboxStatus = 'archived';
            existing.archivedAt = prevArchivedAt;
            existing.archivedBy = prevArchivedBy;
        }
        await existing.save();
        return { doc: existing.toObject(), inserted: false, wasArchived };
    }

    const created = {
        companyId,
        campaignId,
        queryId: queryId || null,
        queryScopeKey,
        captureBatchId,
        source,
        querySourceHint: querySourceHint || '',
        captureMethod,
        sourceRecordId: record.sourceRecordId || '',
        title: record.title || '',
        titleNormalized: record.titleNormalized || '',
        snippet: record.snippet || '',
        resultUrlOriginal: record.resultUrlOriginal || '',
        resultUrlNormalized: record.resultUrlNormalized || '',
        displayDomain: record.displayDomain || '',
        resultPosition: record.resultPosition,
        resultTypeHint: record.resultTypeHint || 'unknown',
        captureFingerprint: fingerprint,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        seenCount: 1,
        firstCapturedBy: userId || null,
        lastCapturedBy: userId || null,
        inboxStatus: 'new',
        enrichmentStatus: 'not_started',
        enrichmentEligible: false,
        qualificationStatus: 'not_started',
        duplicateStatus: 'unchecked',
        updatedBy: userId || null,
    };

    try {
        const doc = await RawCapture.create(created);
        return { doc: doc.toObject(), inserted: true, wasArchived: false };
    } catch (err) {
        if (err && err.code === 11000) {
            const raced = await RawCapture.findOne(filter);
            if (!raced) throw err;
            const wasArchived = raced.inboxStatus === 'archived';
            raced.seenCount = (raced.seenCount || 1) + 1;
            raced.lastSeenAt = new Date();
            raced.lastCapturedBy = userId || null;
            raced.captureBatchId = captureBatchId;
            raced.updatedBy = userId || null;
            if (record.resultPosition != null) raced.resultPosition = record.resultPosition;
            await raced.save();
            return { doc: raced.toObject(), inserted: false, wasArchived };
        }
        throw err;
    }
}

function normalizeAllRecords(rawRecords) {
    const validationErrors = [];
    const accepted = [];
    for (let i = 0; i < rawRecords.length; i += 1) {
        const normalized = normalizeIngestRecord(rawRecords[i], i);
        if (!normalized.ok) {
            if (validationErrors.length < RAW_CAPTURE_VALIDATION_ERRORS_MAX) {
                validationErrors.push({
                    index: i,
                    message: String(normalized.message || 'invalid').slice(0, 300),
                });
            }
            continue;
        }
        accepted.push({ index: i, value: normalized.value });
    }
    return { validationErrors, accepted };
}

/**
 * @param {object} args
 * @param {object} [args.options] test-only hooks: failAfter = 'batch_create'|'first_upsert'|'before_query_stats'|'during_query_stats'
 */
export async function ingestRawCaptures({ companyId, user, campaignId, body, options = {} }) {
    const cid = requireCompanyId(companyId);
    requireObjectId(campaignId, 'Search campaign');
    const payload = validateIngestBody(body || {});
    assertRawIngest(user, { requireQueryView: Boolean(payload.queryId) });

    const campaign = await getOwnedSearchCampaign({
        companyId: cid, user, campaignId, skipPermCheck: true,
    });
    if (!CAMPAIGN_ELIGIBLE_FOR_CAPTURE.includes(campaign.status)) {
        throw new ApiError(400, `Campaign is ${campaign.status} and cannot accept captures`);
    }

    let query = null;
    let queryScopeKey = RAW_CAPTURE_CAMPAIGN_MANUAL_SCOPE;
    let querySourceHint = payload.querySourceHint || '';
    if (payload.queryId) {
        query = await loadOwnedQueryForCapture(cid, campaignId, payload.queryId);
        queryScopeKey = String(query._id);
        querySourceHint = query.sourceHint || querySourceHint;
    }

    const userId = actorUserId(user);
    const { validationErrors: preErrors, accepted: preAccepted } = normalizeAllRecords(payload.records);

    // Fingerprint uses normalized accepted + rejected placeholders for full request shape
    // Include all records' normalized identity fields where valid; invalid records use raw safe subset
    const fingerprintRecords = payload.records.map((raw, i) => {
        const found = preAccepted.find((a) => a.index === i);
        if (found) return found.value;
        return {
            title: String(raw?.title || '').slice(0, 500),
            snippet: String(raw?.snippet || '').slice(0, 500),
            resultUrlNormalized: '',
            resultPosition: raw?.resultPosition == null ? null : Number(raw.resultPosition) || null,
            sourceRecordId: String(raw?.sourceRecordId || '').slice(0, 300),
            resultTypeHint: String(raw?.resultTypeHint || 'unknown').slice(0, 40),
        };
    });

    const requestFingerprint = buildRequestFingerprint({
        companyId: cid,
        campaignId,
        queryScopeKey,
        source: payload.source,
        captureMethod: payload.captureMethod,
        records: fingerprintRecords,
    });

    let batch = null;
    const existingBatch = await RawCaptureBatch.findOne({
        companyId: cid,
        idempotencyKey: payload.idempotencyKey,
    });
    if (existingBatch) {
        assertFingerprintMatch(existingBatch, campaignId, requestFingerprint);
        if (existingBatch.status === 'received') {
            // Resume after create-before-process failure (same key + fingerprint).
            batch = await RawCaptureBatch.findOneAndUpdate(
                { _id: existingBatch._id, companyId: cid, status: 'received' },
                { $set: { status: 'processing' } },
                { new: true },
            );
            if (!batch) {
                const raced = await RawCaptureBatch.findOne({
                    companyId: cid,
                    idempotencyKey: payload.idempotencyKey,
                }).lean();
                return resolveExistingBatch({
                    companyId: cid,
                    campaignId,
                    existingBatch: raced,
                    requestFingerprint,
                });
            }
        } else {
            return resolveExistingBatch({
                companyId: cid,
                campaignId,
                existingBatch: existingBatch.toObject(),
                requestFingerprint,
            });
        }
    }

    if (!batch) {
        try {
            batch = await RawCaptureBatch.create({
                companyId: cid,
                campaignId,
                queryId: query?._id || null,
                source: payload.source,
                querySourceHint,
                captureMethod: payload.captureMethod,
                idempotencyKey: payload.idempotencyKey,
                requestFingerprint,
                status: 'received',
                requestedCount: payload.records.length,
                createdBy: userId,
            });
        } catch (err) {
            if (err && err.code === 11000) {
                const raced = await RawCaptureBatch.findOne({
                    companyId: cid,
                    idempotencyKey: payload.idempotencyKey,
                }).lean();
                if (raced) {
                    if (raced.status === 'received') {
                        batch = await RawCaptureBatch.findOneAndUpdate(
                            { _id: raced._id, companyId: cid, status: 'received' },
                            { $set: { status: 'processing' } },
                            { new: true },
                        );
                        if (!batch) {
                            const again = await RawCaptureBatch.findOne({
                                companyId: cid,
                                idempotencyKey: payload.idempotencyKey,
                            }).lean();
                            return resolveExistingBatch({
                                companyId: cid,
                                campaignId,
                                existingBatch: again,
                                requestFingerprint,
                            });
                        }
                    } else {
                        return resolveExistingBatch({
                            companyId: cid,
                            campaignId,
                            existingBatch: raced,
                            requestFingerprint,
                        });
                    }
                } else {
                    throw err;
                }
            } else {
                throw err;
            }
        }
    }

    if (options.failAfter === 'batch_create') {
        const err = new Error('TEST_FAIL_AFTER_BATCH_CREATE');
        err.isTestHook = true;
        throw err;
    }

    // Fresh create is still `received` until claimed here; resume path already `processing`.
    if (batch.status === 'received') {
        batch = await RawCaptureBatch.findOneAndUpdate(
            { _id: batch._id, companyId: cid, status: 'received' },
            { $set: { status: 'processing' } },
            { new: true },
        );
        if (!batch) {
            const raced = await RawCaptureBatch.findOne({
                companyId: cid,
                idempotencyKey: payload.idempotencyKey,
            }).lean();
            return resolveExistingBatch({
                companyId: cid,
                campaignId,
                existingBatch: raced,
                requestFingerprint,
            });
        }
    }

    const validationErrors = [...preErrors];
    const rawCaptureIds = [];
    let insertedCount = 0;
    let updatedExistingCount = 0;
    let updatedExistingArchivedCount = 0;

    try {
        for (const item of preAccepted) {
            const result = await upsertRawCapture({
                companyId: cid,
                campaignId,
                queryId: query?._id || null,
                queryScopeKey,
                source: payload.source,
                querySourceHint,
                captureMethod: payload.captureMethod,
                captureBatchId: batch._id,
                record: item.value,
                userId,
            });
            rawCaptureIds.push(result.doc._id);
            if (result.inserted) insertedCount += 1;
            else {
                updatedExistingCount += 1;
                if (result.wasArchived) updatedExistingArchivedCount += 1;
            }
            if (options.failAfter === 'first_upsert' && rawCaptureIds.length === 1) {
                const err = new Error('TEST_FAIL_AFTER_FIRST_UPSERT');
                err.isTestHook = true;
                throw err;
            }
        }
    } catch (err) {
        if (err && err.isTestHook) {
            await RawCaptureBatch.findOneAndUpdate(
                { _id: batch._id, companyId: cid },
                {
                    $set: {
                        status: 'failed',
                        acceptedCount: insertedCount + updatedExistingCount,
                        insertedCount,
                        updatedExistingCount,
                        updatedExistingArchivedCount,
                        rejectedCount: payload.records.length - (insertedCount + updatedExistingCount),
                        rawCaptureIds: rawCaptureIds.slice(0, RAW_CAPTURE_BATCH_MAX),
                        validationErrors: validationErrors.slice(0, RAW_CAPTURE_VALIDATION_ERRORS_MAX),
                        failedAt: new Date(),
                        failureCode: String(err.message || 'TEST_FAIL').slice(0, RAW_CAPTURE_FAILURE_CODE_MAX),
                        failureMessage: 'Ingestion interrupted (test hook)'.slice(0, RAW_CAPTURE_FAILURE_MESSAGE_MAX),
                    },
                },
            );
            if (query) {
                await recalculateSearchQueryCaptureStats(cid, campaignId, query._id, userId);
            }
            throw err;
        }
        await RawCaptureBatch.findOneAndUpdate(
            { _id: batch._id, companyId: cid },
            {
                $set: {
                    status: 'failed',
                    acceptedCount: insertedCount + updatedExistingCount,
                    insertedCount,
                    updatedExistingCount,
                    updatedExistingArchivedCount,
                    rejectedCount: payload.records.length - (insertedCount + updatedExistingCount),
                    rawCaptureIds: rawCaptureIds.slice(0, RAW_CAPTURE_BATCH_MAX),
                    validationErrors: validationErrors.slice(0, RAW_CAPTURE_VALIDATION_ERRORS_MAX),
                    failedAt: new Date(),
                    failureCode: 'UNEXPECTED_INGEST_ERROR'.slice(0, RAW_CAPTURE_FAILURE_CODE_MAX),
                    failureMessage: 'Ingestion failed'.slice(0, RAW_CAPTURE_FAILURE_MESSAGE_MAX),
                },
            },
        );
        if (query) {
            await recalculateSearchQueryCaptureStats(cid, campaignId, query._id, userId).catch(() => null);
        }
        throw new ApiError(500, 'Capture ingestion failed');
    }

    if (options.failAfter === 'before_query_stats') {
        const acceptedCount = insertedCount + updatedExistingCount;
        const rejectedCount = payload.records.length - acceptedCount;
        let status = 'completed';
        if (acceptedCount === 0) status = 'failed';
        else if (rejectedCount > 0) status = 'partially_completed';
        await RawCaptureBatch.findOneAndUpdate(
            { _id: batch._id, companyId: cid },
            {
                $set: {
                    status,
                    acceptedCount,
                    insertedCount,
                    updatedExistingCount,
                    updatedExistingArchivedCount,
                    rejectedCount,
                    rawCaptureIds: rawCaptureIds.slice(0, RAW_CAPTURE_BATCH_MAX),
                    validationErrors: validationErrors.slice(0, RAW_CAPTURE_VALIDATION_ERRORS_MAX),
                    completedAt: status === 'failed' ? null : new Date(),
                    failedAt: status === 'failed' ? new Date() : null,
                    failureCode: status === 'failed' ? 'ALL_RECORDS_REJECTED' : '',
                },
            },
        );
        const err = new Error('TEST_FAIL_BEFORE_QUERY_STATS');
        err.isTestHook = true;
        throw err;
    }

    const acceptedCount = insertedCount + updatedExistingCount;
    const rejectedCount = payload.records.length - acceptedCount;
    let status = 'completed';
    if (acceptedCount === 0) status = 'failed';
    else if (rejectedCount > 0) status = 'partially_completed';

    const saved = await RawCaptureBatch.findOneAndUpdate(
        { _id: batch._id, companyId: cid },
        {
            $set: {
                status,
                acceptedCount,
                insertedCount,
                updatedExistingCount,
                updatedExistingArchivedCount,
                rejectedCount,
                rawCaptureIds: rawCaptureIds.slice(0, RAW_CAPTURE_BATCH_MAX),
                validationErrors: validationErrors.slice(0, RAW_CAPTURE_VALIDATION_ERRORS_MAX),
                completedAt: status === 'failed' ? null : new Date(),
                failedAt: status === 'failed' ? new Date() : null,
                failureCode: status === 'failed' ? 'ALL_RECORDS_REJECTED' : '',
                failureMessage: '',
            },
        },
        { new: true },
    ).lean();

    let qDoc = null;
    if (query) {
        if (options.failAfter === 'during_query_stats') {
            const err = new Error('TEST_FAIL_DURING_QUERY_STATS');
            err.isTestHook = true;
            throw err;
        }
        if (status === 'completed' || status === 'partially_completed') {
            qDoc = await recalculateSearchQueryCaptureStats(cid, campaignId, query._id, userId);
        } else {
            qDoc = await loadQueryForBatchResponse(cid, campaignId, query._id);
        }
    }

    return formatBatchResponse(saved, { query: qDoc, idempotentReplay: false });
}

export function rawCaptureHardDeleteSupported() {
    return false;
}
