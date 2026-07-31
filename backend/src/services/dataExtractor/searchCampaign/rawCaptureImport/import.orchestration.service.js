/**
 * Checkpoint 4 — Import orchestration.
 * Never writes RawCapture directly; always calls ingestRawCaptures.
 */
import crypto from 'crypto';
import mongoose from 'mongoose';
import { RawCaptureImportRun } from '../../../../models/rawCaptureImportRun.model.js';
import { RawCaptureBatch } from '../../../../models/rawCaptureBatch.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { getOwnedSearchCampaign } from '../searchCampaign.service.js';
import { ingestRawCaptures } from '../rawCapture/rawCapture.ingestion.service.js';
import {
    buildCaptureFingerprint,
} from '../rawCapture/normalize.util.js';
import { normalizeIngestRecord } from '../rawCapture/validation.js';
import {
    RAW_CAPTURE_BATCH_MAX,
    RAW_CAPTURE_CAMPAIGN_MANUAL_SCOPE,
    RAW_CAPTURE_SOURCES,
} from '../rawCapture/constants.js';
import {
    ADAPTER_TO_CAPTURE_METHOD,
    IMPORT_ADAPTER_TYPES,
    IMPORT_CHUNK_SIZE,
    IMPORT_IDEMPOTENCY_KEY_MAX,
    IMPORT_IDEMPOTENCY_REUSED_CODE,
    IMPORT_MAX_MANUAL_RECORDS,
    IMPORT_VALIDATION_ERRORS_MAX,
} from './constants.js';
import { actorUserId, assertRawImport, assertRawImportCommit } from './permissions.util.js';
import { previewManualUrls } from './manualUrl.adapter.js';
import { previewPastedText } from './pastedText.adapter.js';
import { parseCsvForCommit, previewCsvFile } from './csv.adapter.js';
import { parseExcelForCommit, previewExcelFile } from './excel.adapter.js';

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

function validateIdempotencyKey(raw) {
    const key = String(raw || '').trim();
    if (!key) throw new ApiError(400, 'idempotencyKey is required');
    if (key.length > IMPORT_IDEMPOTENCY_KEY_MAX) {
        throw new ApiError(400, `idempotencyKey must be at most ${IMPORT_IDEMPOTENCY_KEY_MAX} characters`);
    }
    if (!/^[A-Za-z0-9._:-]+$/.test(key)) {
        throw new ApiError(400, 'idempotencyKey contains invalid characters');
    }
    return key;
}

function validateSource(raw) {
    const source = String(raw || 'manual').trim().toLowerCase();
    if (!RAW_CAPTURE_SOURCES.includes(source)) {
        throw new ApiError(400, `Unsupported source: ${raw}`);
    }
    return source;
}

function validateAdapterType(raw) {
    const t = String(raw || '').trim().toLowerCase();
    if (!IMPORT_ADAPTER_TYPES.includes(t)) throw new ApiError(400, `Unsupported adapterType: ${raw}`);
    return t;
}

function rejectForbidden(body = {}) {
    for (const k of Object.keys(body || {})) {
        if (k.startsWith('$') || k.includes('.') || k === '__proto__' || k === 'constructor') {
            throw new ApiError(400, `Unsafe key rejected: ${k}`);
        }
        if ([
            'companyId', 'tenantId', 'requestFingerprint', 'captureFingerprint', 'status',
            'reviewOverrideBy', 'reviewOverrideAt', 'reviewRequiredAcceptedCount',
            'insertedCount', 'updatedExistingCount', 'acceptedRows', 'rejectedRows',
            'rawCaptureBatchIds', 'createdBy',
        ].includes(k)) {
            throw new ApiError(400, `Do not send ${k}; company scope and audit fields come from auth`);
        }
    }
}

function testHookOptions(body = {}) {
    if (process.env.RC_IMPORT_TEST_HOOKS === '1' && body && body.__testOptions) {
        return body.__testOptions;
    }
    return {};
}

function buildImportFingerprint(parts) {
    return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function throwIdempotencyReuse() {
    const err = new ApiError(409, 'Idempotency key was previously used for a different import request');
    err.errorCode = IMPORT_IDEMPOTENCY_REUSED_CODE;
    throw err;
}

function formatImportResponse(run, {
    idempotentReplay = false,
    query = null,
} = {}) {
    return {
        importRunId: run._id,
        status: run.status,
        adapterType: run.adapterType,
        campaignId: run.campaignId,
        queryId: run.queryId,
        source: run.source,
        captureMethod: run.captureMethod,
        totalInputRows: run.totalInputRows,
        parsedRows: run.parsedRows,
        acceptedRows: run.acceptedRows,
        rejectedRows: run.rejectedRows,
        duplicateWithinImportCount: run.duplicateWithinImportCount,
        insertedCount: run.insertedCount,
        updatedExistingCount: run.updatedExistingCount,
        rawCaptureBatchIds: run.rawCaptureBatchIds || [],
        validationErrors: (run.validationErrors || []).slice(0, IMPORT_VALIDATION_ERRORS_MAX),
        idempotentReplay: Boolean(idempotentReplay),
        requestFingerprint: run.requestFingerprint,
        queryCaptureCount: query?.captureCount ?? null,
        queryResultCount: query?.resultCount ?? null,
        queryStatus: query?.status ?? null,
        failureCode: run.failureCode || '',
    };
}

/**
 * Prepare ingestable records: validate via RawCapture normalize, dedupe within import.
 */
function prepareRecords(rawItems, { source, queryScopeKey }) {
    const accepted = [];
    const errors = [];
    const seen = new Map();
    let duplicateWithinImportCount = 0;

    for (const item of rawItems) {
        const rowNumber = item.rowNumber ?? null;
        const sheetName = item.sheetName || '';
        const record = item.record || item;
        if (item.reviewRequired) {
            errors.push({
                rowNumber,
                sheetName,
                field: '',
                code: item.reasonCode || 'REVIEW_REQUIRED',
                message: 'Row requires review before commit',
            });
            continue;
        }
        const norm = normalizeIngestRecord(record, (rowNumber || 1) - 1);
        if (!norm.ok) {
            errors.push({
                rowNumber,
                sheetName,
                field: '',
                code: 'ROW_INVALID',
                message: String(norm.message || 'invalid').slice(0, 300),
            });
            continue;
        }
        const fp = buildCaptureFingerprint({
            source,
            queryScopeKey,
            resultUrlNormalized: norm.value.resultUrlNormalized,
            sourceRecordId: norm.value.sourceRecordId,
            titleNormalized: norm.value.titleNormalized,
            snippetNormalized: norm.value.snippetNormalized,
        });
        if (seen.has(fp)) {
            duplicateWithinImportCount += 1;
            errors.push({
                rowNumber,
                sheetName,
                field: '',
                code: 'DUPLICATE_WITHIN_IMPORT',
                message: 'Duplicate within import; first occurrence kept',
            });
            continue;
        }
        seen.set(fp, rowNumber);
        accepted.push({
            rowNumber,
            sheetName,
            fingerprint: fp,
            record: {
                title: norm.value.title,
                snippet: norm.value.snippet,
                resultUrl: norm.value.resultUrlOriginal || record.resultUrl || '',
                resultPosition: norm.value.resultPosition,
                sourceRecordId: norm.value.sourceRecordId,
                resultTypeHint: norm.value.resultTypeHint,
            },
        });
    }
    return { accepted, errors, duplicateWithinImportCount };
}

function chunkAccepted(accepted) {
    const chunks = [];
    for (let i = 0; i < accepted.length; i += IMPORT_CHUNK_SIZE) {
        chunks.push(accepted.slice(i, i + IMPORT_CHUNK_SIZE));
    }
    return chunks;
}

function childIdempotencyKey(importKey, seq, contentHash) {
    const base = `${importKey}:c${seq}:${contentHash.slice(0, 16)}`;
    return base.slice(0, IMPORT_IDEMPOTENCY_KEY_MAX);
}

function chunkContentHash(records) {
    return crypto.createHash('sha256')
        .update(JSON.stringify(records.map((r) => r.record)))
        .digest('hex');
}

async function resolveExistingImport(existing, fingerprint) {
    if (existing.requestFingerprint !== fingerprint) throwIdempotencyReuse();
    return existing;
}

async function loadQueryStats(companyId, campaignId, queryId) {
    if (!queryId) return null;
    const { SearchQuery } = await import('../../../../models/searchQuery.model.js');
    return SearchQuery.findOne({ _id: queryId, companyId, campaignId }).lean();
}


export async function reconcileImportRunFromChildBatches(companyId, importRunId) {
    requireCompanyId(companyId);
    requireObjectId(importRunId, 'Import run');
    const run = await RawCaptureImportRun.findOne({ _id: importRunId, companyId });
    if (!run) throw new ApiError(404, 'Import run not found');
    const states = Array.isArray(run.chunkStates) ? [...run.chunkStates] : [];
    let inserted = 0;
    let updated = 0;
    let accepted = 0;
    const batchIds = [];
    for (let i = 0; i < states.length; i += 1) {
        const st = states[i];
        const batch = await RawCaptureBatch.findOne({
            companyId,
            idempotencyKey: st.childIdempotencyKey,
        }).lean();
        if (batch && ['completed', 'partially_completed'].includes(batch.status)) {
            states[i] = {
                ...st,
                status: 'completed',
                batchId: batch._id,
                acceptedCount: batch.acceptedCount || 0,
                insertedCount: batch.insertedCount || 0,
                updatedExistingCount: batch.updatedExistingCount || 0,
                rejectedCount: batch.rejectedCount || 0,
                failureCode: '',
            };
            inserted += batch.insertedCount || 0;
            updated += batch.updatedExistingCount || 0;
            accepted += batch.acceptedCount || 0;
            batchIds.push(batch._id);
        } else if (st.status === 'completed' && st.batchId) {
            inserted += st.insertedCount || 0;
            updated += st.updatedExistingCount || 0;
            accepted += st.acceptedCount || 0;
            batchIds.push(st.batchId);
        }
    }
    const anyFailed = states.some((s) => s.status === 'failed');
    const anyPending = states.some((s) => s.status === 'pending' || s.status === 'processing');
    let status = 'completed';
    if (accepted === 0 && (anyFailed || !states.length)) status = 'failed';
    else if (anyFailed || anyPending || (run.rejectedRows || 0) > 0) status = 'partially_completed';
    else if (states.length && states.every((s) => s.status === 'completed')) {
        status = (run.rejectedRows || 0) > 0 ? 'partially_completed' : 'completed';
    }
    const updatedRun = await RawCaptureImportRun.findOneAndUpdate(
        { _id: importRunId, companyId },
        {
            $set: {
                chunkStates: states,
                insertedCount: inserted,
                updatedExistingCount: updated,
                acceptedRows: accepted,
                rawCaptureBatchIds: batchIds,
                status,
                completedAt: ['completed', 'partially_completed'].includes(status) ? (run.completedAt || new Date()) : null,
                failedAt: status === 'failed' ? (run.failedAt || new Date()) : null,
            },
        },
        { new: true },
    ).lean();
    return updatedRun;
}

async function runChunks({
    companyId, user, campaignId, queryId, source, captureMethod,
    importKey, run, accepted, options = {},
}) {
    const chunks = chunkAccepted(accepted);
    const existingStates = Array.isArray(run.chunkStates) ? [...run.chunkStates] : [];
    const statesBySeq = new Map(existingStates.map((s) => [s.seq, s]));

    let insertedCount = run.insertedCount || 0;
    let updatedExistingCount = run.updatedExistingCount || 0;
    let acceptedRows = run.acceptedRows || 0;
    const batchIds = [...(run.rawCaptureBatchIds || []).map(String)];
    const chunkStates = [];

    for (let seq = 0; seq < chunks.length; seq += 1) {
        const slice = chunks[seq];
        const contentHash = chunkContentHash(slice);
        const childKey = childIdempotencyKey(importKey, seq, contentHash);
        const prev = statesBySeq.get(seq);
        if (prev && prev.status === 'completed' && prev.contentHash === contentHash) {
            chunkStates.push(prev);
            if (prev.batchId && !batchIds.includes(String(prev.batchId))) {
                batchIds.push(String(prev.batchId));
            }
            continue;
        }

        // Discover child batch completed before ImportRun update
        const existingChild = await RawCaptureBatch.findOne({
            companyId,
            idempotencyKey: childKey,
        }).lean();
        if (existingChild && ['completed', 'partially_completed'].includes(existingChild.status)) {
            const state = {
                seq,
                childIdempotencyKey: childKey,
                contentHash,
                status: 'completed',
                batchId: existingChild._id,
                acceptedCount: existingChild.acceptedCount || 0,
                insertedCount: existingChild.insertedCount || 0,
                updatedExistingCount: existingChild.updatedExistingCount || 0,
                rejectedCount: existingChild.rejectedCount || 0,
                failureCode: '',
            };
            if (!prev || prev.status !== 'completed') {
                insertedCount += existingChild.insertedCount || 0;
                updatedExistingCount += existingChild.updatedExistingCount || 0;
                acceptedRows += existingChild.acceptedCount || 0;
            }
            if (!batchIds.includes(String(existingChild._id))) batchIds.push(String(existingChild._id));
            chunkStates.push(state);
            await RawCaptureImportRun.updateOne(
                { _id: run._id, companyId },
                { $set: { chunkStates: [...chunkStates, ...Array.from({ length: 0 })], rawCaptureBatchIds: batchIds.map((id) => new mongoose.Types.ObjectId(id)), insertedCount, updatedExistingCount, acceptedRows } },
            );
            continue;
        }

        // Mark processing before child create
        await RawCaptureImportRun.updateOne(
            { _id: run._id, companyId },
            {
                $set: {
                    [`chunkStates.${seq}`]: {
                        seq,
                        childIdempotencyKey: childKey,
                        contentHash,
                        status: 'processing',
                        batchId: null,
                        acceptedCount: 0,
                        insertedCount: 0,
                        updatedExistingCount: 0,
                        rejectedCount: 0,
                        failureCode: '',
                    },
                },
            },
        ).catch(() => null);

        try {
            if (options?.failAfter === 'before_child' && seq === 0) {
                const err = new Error('TEST_FAIL_BEFORE_CHILD');
                err.isTestHook = true;
                throw err;
            }
            const result = await ingestRawCaptures({
                companyId,
                user,
                campaignId,
                body: {
                    queryId: queryId ? String(queryId) : null,
                    source,
                    captureMethod,
                    idempotencyKey: childKey,
                    records: slice.map((s) => s.record),
                },
            });
            const state = {
                seq,
                childIdempotencyKey: childKey,
                contentHash,
                status: 'completed',
                batchId: result.batchId,
                acceptedCount: result.acceptedCount || 0,
                insertedCount: result.insertedCount || 0,
                updatedExistingCount: result.updatedExistingCount || 0,
                rejectedCount: result.rejectedCount || 0,
                failureCode: '',
            };
            // On first completion of chunk, aggregate counts (skip if idempotent replay of child)
            if (!result.idempotentReplay || !prev || prev.status !== 'completed') {
                if (!result.idempotentReplay) {
                    insertedCount += result.insertedCount || 0;
                    updatedExistingCount += result.updatedExistingCount || 0;
                    acceptedRows += result.acceptedCount || 0;
                } else if (!prev || prev.status !== 'completed') {
                    insertedCount += result.insertedCount || 0;
                    updatedExistingCount += result.updatedExistingCount || 0;
                    acceptedRows += result.acceptedCount || 0;
                }
            }
            if (result.batchId && !batchIds.includes(String(result.batchId))) {
                batchIds.push(String(result.batchId));
            }
            chunkStates.push(state);
            await RawCaptureImportRun.updateOne(
                { _id: run._id, companyId },
                {
                    $set: {
                        chunkStates,
                        insertedCount,
                        updatedExistingCount,
                        acceptedRows,
                        rawCaptureBatchIds: batchIds.map((id) => new mongoose.Types.ObjectId(id)),
                    },
                },
            ).catch(() => null);
            if (options?.failAfter === 'after_first_chunk' && seq === 0 && chunks.length > 1) {
                // Simulate crash after first child completed: keep completed chunk, leave rest pending.
                for (let rest = seq + 1; rest < chunks.length; rest += 1) {
                    const restSlice = chunks[rest];
                    const restHash = chunkContentHash(restSlice);
                    const restKey = childIdempotencyKey(importKey, rest, restHash);
                    chunkStates.push({
                        seq: rest,
                        childIdempotencyKey: restKey,
                        contentHash: restHash,
                        status: 'pending',
                        batchId: null,
                        acceptedCount: 0,
                        insertedCount: 0,
                        updatedExistingCount: 0,
                        rejectedCount: 0,
                        failureCode: '',
                    });
                }
                await RawCaptureImportRun.updateOne(
                    { _id: run._id, companyId },
                    {
                        $set: {
                            chunkStates,
                            status: 'partially_completed',
                            insertedCount,
                            updatedExistingCount,
                            acceptedRows,
                            rawCaptureBatchIds: batchIds.map((id) => new mongoose.Types.ObjectId(id)),
                        },
                    },
                ).catch(() => null);
                const err = new Error('TEST_FAIL_AFTER_FIRST_CHUNK');
                err.isTestHook = true;
                err.preserveCompleted = true;
                throw err;
            }
        } catch (err) {
            if (err?.preserveCompleted) throw err;
            chunkStates.push({
                seq,
                childIdempotencyKey: childKey,
                contentHash,
                status: 'failed',
                batchId: null,
                acceptedCount: 0,
                insertedCount: 0,
                updatedExistingCount: 0,
                rejectedCount: slice.length,
                failureCode: String(err?.errorCode || err?.message || 'CHUNK_FAIL').slice(0, 80),
            });
            // Preserve completed evidence; mark remaining pending for retry.
            for (let rest = seq + 1; rest < chunks.length; rest += 1) {
                const restSlice = chunks[rest];
                const restHash = chunkContentHash(restSlice);
                const restKey = childIdempotencyKey(importKey, rest, restHash);
                const prevRest = statesBySeq.get(rest);
                if (prevRest && prevRest.status === 'completed' && prevRest.contentHash === restHash) {
                    chunkStates.push(prevRest);
                } else {
                    chunkStates.push({
                        seq: rest,
                        childIdempotencyKey: restKey,
                        contentHash: restHash,
                        status: 'pending',
                        batchId: null,
                        acceptedCount: 0,
                        insertedCount: 0,
                        updatedExistingCount: 0,
                        rejectedCount: 0,
                        failureCode: '',
                    });
                }
            }
            await RawCaptureImportRun.updateOne(
                { _id: run._id, companyId },
                {
                    $set: {
                        chunkStates,
                        status: 'partially_completed',
                        insertedCount,
                        updatedExistingCount,
                        acceptedRows,
                        rawCaptureBatchIds: batchIds.map((id) => new mongoose.Types.ObjectId(id)),
                    },
                },
            ).catch(() => null);
            if (err?.isTestHook) throw err;
            break;
        }
    }

    const anyCompleted = chunkStates.some((s) => s.status === 'completed' && s.acceptedCount >= 0
        && (s.batchId || s.acceptedCount > 0 || s.insertedCount > 0 || s.updatedExistingCount > 0));
    const anyFailed = chunkStates.some((s) => s.status === 'failed');
    const anyPending = chunkStates.some((s) => s.status === 'pending');
    const completedAccepted = chunkStates
        .filter((s) => s.status === 'completed')
        .reduce((n, s) => n + (s.acceptedCount || 0), 0);

    let status = 'completed';
    if (completedAccepted === 0 && (anyFailed || accepted.length === 0)) status = 'failed';
    else if (anyFailed || anyPending || (run.rejectedRows || 0) > 0) status = 'partially_completed';
    if (accepted.length > 0 && !anyFailed && !anyPending && completedAccepted >= 0) {
        // if all chunks completed
        if (chunkStates.every((s) => s.status === 'completed')) {
            status = (run.rejectedRows || 0) > 0 ? 'partially_completed' : 'completed';
        }
    }

    return {
        chunkStates,
        batchIds: batchIds.map((id) => new mongoose.Types.ObjectId(id)),
        insertedCount,
        updatedExistingCount,
        acceptedRows: Math.max(acceptedRows, completedAccepted),
        status,
    };
}

async function commitImportCore({
    companyId, user, campaignId, body, adapterType, contentHash, meta, rawItems,
}) {
    const cid = requireCompanyId(companyId);
    requireObjectId(campaignId, 'Search campaign');
    rejectForbidden(body || {});
    assertRawImportCommit(user, { requireQueryView: Boolean(body.queryId) });

    const source = validateSource(body.source || 'manual');
    const type = validateAdapterType(adapterType);
    const captureMethod = ADAPTER_TO_CAPTURE_METHOD[type];
    if (body.captureMethod && String(body.captureMethod) !== captureMethod) {
        throw new ApiError(400, `captureMethod must be ${captureMethod} for adapter ${type}`);
    }
    if (body.adapterType && String(body.adapterType) !== type) {
        throw new ApiError(400, 'adapterType mismatch');
    }

    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey);
    await getOwnedSearchCampaign({
        companyId: cid, user, campaignId, skipPermCheck: true,
    });

    let queryId = null;
    if (body.queryId) {
        queryId = requireObjectId(body.queryId, 'Search query');
        const { SearchQuery } = await import('../../../../models/searchQuery.model.js');
        const q = await SearchQuery.findOne({ _id: queryId, companyId: cid, campaignId }).lean();
        if (!q) throw new ApiError(404, 'Search query not found');
    }
    const queryScopeKey = queryId ? String(queryId) : RAW_CAPTURE_CAMPAIGN_MANUAL_SCOPE;

    const fingerprint = buildImportFingerprint({
        companyId: String(cid),
        campaignId: String(campaignId),
        queryScopeKey,
        adapterType: type,
        source,
        contentHash,
        sheetName: meta.sheetName || '',
        delimiter: meta.detectedDelimiter || '',
        columnMapping: meta.columnMapping || {},
        options: {
            hasHeader: meta.hasHeader !== false,
        },
    });

    const existing = await RawCaptureImportRun.findOne({ companyId: cid, idempotencyKey });
    if (existing) {
        await resolveExistingImport(existing, fingerprint);
        if (['completed', 'partially_completed', 'failed'].includes(existing.status)
            && existing.chunkStates?.length
            && existing.chunkStates.every((s) => s.status === 'completed' || (existing.status === 'failed' && s.status !== 'pending'))) {
            // Fully settled — replay (but allow resume if pending chunks)
            const hasPending = (existing.chunkStates || []).some((s) => s.status === 'pending' || s.status === 'failed');
            if (!hasPending || existing.status === 'completed') {
                const q = await loadQueryStats(cid, campaignId, existing.queryId);
                return formatImportResponse(existing, { idempotentReplay: true, query: q });
            }
        }
        if (existing.status === 'completed') {
            const q = await loadQueryStats(cid, campaignId, existing.queryId);
            return formatImportResponse(existing, { idempotentReplay: true, query: q });
        }
        // Resume path: reuse existing run document
        const prepared = prepareRecords(rawItems, { source, queryScopeKey });
        const rejectedRows = prepared.errors.filter((e) => e.code !== 'DUPLICATE_WITHIN_IMPORT').length;
        await RawCaptureImportRun.updateOne(
            { _id: existing._id, companyId: cid },
            {
                $set: {
                    status: 'processing',
                    parsedRows: rawItems.length,
                    rejectedRows,
                    duplicateWithinImportCount: prepared.duplicateWithinImportCount,
                    validationErrors: prepared.errors.slice(0, IMPORT_VALIDATION_ERRORS_MAX),
                },
            },
        );
        const chunkResult = await runChunks({
            companyId: cid,
            user,
            campaignId,
            queryId,
            source,
            captureMethod,
            importKey: idempotencyKey,
            run: existing.toObject(),
            accepted: prepared.accepted,
            options: testHookOptions(body),
        });
        const updated = await RawCaptureImportRun.findOneAndUpdate(
            { _id: existing._id, companyId: cid },
            {
                $set: {
                    status: chunkResult.status,
                    acceptedRows: chunkResult.acceptedRows,
                    insertedCount: chunkResult.insertedCount,
                    updatedExistingCount: chunkResult.updatedExistingCount,
                    rawCaptureBatchIds: chunkResult.batchIds,
                    chunkStates: chunkResult.chunkStates,
                    completedAt: ['completed', 'partially_completed'].includes(chunkResult.status) ? new Date() : null,
                    failedAt: chunkResult.status === 'failed' ? new Date() : null,
                    failureCode: chunkResult.status === 'failed' ? 'IMPORT_FAILED' : '',
                },
            },
            { new: true },
        ).lean();
        const q = await loadQueryStats(cid, campaignId, queryId);
        return formatImportResponse(updated, { idempotentReplay: false, query: q });
    }

    const prepared = prepareRecords(rawItems, { source, queryScopeKey });
    let run;
    try {
        run = await RawCaptureImportRun.create({
            companyId: cid,
            campaignId,
            queryId,
            adapterType: type,
            source,
            captureMethod,
            idempotencyKey,
            requestFingerprint: fingerprint,
            status: 'processing',
            originalFileName: meta.originalFileName || '',
            sanitizedFileName: meta.sanitizedFileName || '',
            fileExtension: meta.fileExtension || '',
            fileMimeType: meta.fileMimeType || '',
            fileSize: meta.fileSize || 0,
            fileSha256: meta.fileSha256 || '',
            contentHash,
            detectedDelimiter: meta.detectedDelimiter || '',
            detectedEncoding: meta.detectedEncoding || '',
            sheetName: meta.sheetName || '',
            availableColumns: meta.availableColumns || [],
            columnMapping: meta.columnMapping || {},
            totalInputRows: rawItems.length,
            parsedRows: rawItems.length,
            acceptedRows: 0,
            rejectedRows: prepared.errors.filter((e) => e.code !== 'DUPLICATE_WITHIN_IMPORT').length,
            duplicateWithinImportCount: prepared.duplicateWithinImportCount,
            validationErrors: prepared.errors.slice(0, IMPORT_VALIDATION_ERRORS_MAX),
            allowReviewRequired: Boolean(meta.allowReviewRequired),
            reviewOverrideBy: meta.allowReviewRequired ? actorUserId(user) : null,
            reviewOverrideAt: meta.allowReviewRequired ? new Date() : null,
            reviewRequiredAcceptedCount: meta.allowReviewRequired
                ? rawItems.filter((r) => r._wasReviewRequired).length
                : 0,
            createdBy: actorUserId(user),
        });
    } catch (err) {
        if (err && err.code === 11000) {
            const raced = await RawCaptureImportRun.findOne({ companyId: cid, idempotencyKey });
            if (raced) {
                await resolveExistingImport(raced, fingerprint);
                const q = await loadQueryStats(cid, campaignId, raced.queryId);
                return formatImportResponse(raced, { idempotentReplay: true, query: q });
            }
        }
        throw err;
    }

    if (!prepared.accepted.length) {
        const failed = await RawCaptureImportRun.findOneAndUpdate(
            { _id: run._id, companyId: cid },
            {
                $set: {
                    status: 'failed',
                    failedAt: new Date(),
                    failureCode: 'NO_VALID_ROWS',
                    failureMessage: 'No valid rows to ingest',
                },
            },
            { new: true },
        ).lean();
        return formatImportResponse(failed, { idempotentReplay: false });
    }

    const chunkResult = await runChunks({
        companyId: cid,
        user,
        campaignId,
        queryId,
        source,
        captureMethod,
        importKey: idempotencyKey,
        run: run.toObject(),
        accepted: prepared.accepted,
        options: testHookOptions(body),
    });

    if (testHookOptions(body).failAfter === 'before_final_update') {
        const err = new Error('TEST_FAIL_BEFORE_FINAL_UPDATE');
        err.isTestHook = true;
        throw err;
    }

    const saved = await RawCaptureImportRun.findOneAndUpdate(
        { _id: run._id, companyId: cid },
        {
            $set: {
                status: chunkResult.status,
                acceptedRows: chunkResult.acceptedRows,
                insertedCount: chunkResult.insertedCount,
                updatedExistingCount: chunkResult.updatedExistingCount,
                rawCaptureBatchIds: chunkResult.batchIds,
                chunkStates: chunkResult.chunkStates,
                completedAt: ['completed', 'partially_completed'].includes(chunkResult.status) ? new Date() : null,
                failedAt: chunkResult.status === 'failed' ? new Date() : null,
                failureCode: chunkResult.status === 'failed' ? 'IMPORT_FAILED' : '',
            },
        },
        { new: true },
    ).lean();

    const q = await loadQueryStats(cid, campaignId, queryId);
    return formatImportResponse(saved, { idempotentReplay: false, query: q });
}

// ---- Public preview APIs ----

export async function previewManualUrlImport({ companyId, user, campaignId, body }) {
    requireCompanyId(companyId);
    requireObjectId(campaignId, 'Search campaign');
    rejectForbidden(body || {});
    assertRawImport(user);
    await getOwnedSearchCampaign({ companyId, user, campaignId, skipPermCheck: true });
    const preview = previewManualUrls(body || {});
    return {
        ...preview,
        records: undefined,
        source: validateSource(body?.source || 'manual'),
        captureMethod: ADAPTER_TO_CAPTURE_METHOD.manual_url,
    };
}

export async function previewPastedTextImport({ companyId, user, campaignId, body }) {
    requireCompanyId(companyId);
    requireObjectId(campaignId, 'Search campaign');
    rejectForbidden(body || {});
    assertRawImport(user);
    await getOwnedSearchCampaign({ companyId, user, campaignId, skipPermCheck: true });
    const preview = previewPastedText(body || {});
    return {
        ...preview,
        records: undefined,
        source: validateSource(body?.source || 'manual'),
        captureMethod: ADAPTER_TO_CAPTURE_METHOD.pasted_text,
    };
}

export async function previewFileImport({ companyId, user, campaignId, body, file }) {
    requireCompanyId(companyId);
    requireObjectId(campaignId, 'Search campaign');
    rejectForbidden(body || {});
    assertRawImport(user);
    await getOwnedSearchCampaign({ companyId, user, campaignId, skipPermCheck: true });
    if (!file?.buffer) throw new ApiError(400, 'file is required');
    const name = file.originalname || '';
    const lower = name.toLowerCase();
    const hasHeader = body?.hasHeader === 'false' || body?.hasHeader === false ? false : true;
    let columnMapping = body?.columnMapping;
    if (typeof columnMapping === 'string') {
        try { columnMapping = JSON.parse(columnMapping); } catch { throw new ApiError(400, 'columnMapping must be JSON'); }
    }
    if (lower.endsWith('.csv')) {
        const preview = previewCsvFile({
            buffer: file.buffer,
            originalName: name,
            mimeType: file.mimetype,
            hasHeader,
            delimiter: body?.delimiter || null,
            columnMapping: columnMapping || null,
        });
        const { _rows, _headers, ...safe } = preview;
        return {
            ...safe,
            source: validateSource(body?.source || 'manual'),
            captureMethod: ADAPTER_TO_CAPTURE_METHOD.csv,
        };
    }
    if (lower.endsWith('.xlsx')) {
        const preview = await previewExcelFile({
            buffer: file.buffer,
            originalName: name,
            mimeType: file.mimetype,
            sheetName: body?.sheetName || null,
            hasHeader,
            columnMapping: columnMapping || null,
        });
        const { _rows, _headers, ...safe } = preview;
        return {
            ...safe,
            source: validateSource(body?.source || 'manual'),
            captureMethod: ADAPTER_TO_CAPTURE_METHOD.excel_xlsx,
        };
    }
    throw new ApiError(400, 'Only .csv or .xlsx files are supported');
}


function assertOptionalPreviewFingerprint(body, serverFingerprint) {
    if (body?.previewFingerprint == null || body?.previewFingerprint === '') return;
    const client = String(body.previewFingerprint);
    if (client !== String(serverFingerprint)) {
        throw new ApiError(400, 'Preview fingerprint does not match committed content');
    }
}

// ---- Public commit APIs ----

export async function commitManualUrlImport({ companyId, user, campaignId, body }) {
    const preview = previewManualUrls(body || {});
    assertOptionalPreviewFingerprint(body, preview.previewFingerprint || preview.contentHash);
    if (preview.records.length > IMPORT_MAX_MANUAL_RECORDS) {
        throw new ApiError(400, `Manual URL records may not exceed ${IMPORT_MAX_MANUAL_RECORDS}`);
    }
    const rawItems = preview.records.map((record, i) => ({
        rowNumber: i + 1,
        record,
        reviewRequired: false,
    }));
    return commitImportCore({
        companyId,
        user,
        campaignId,
        body,
        adapterType: 'manual_url',
        contentHash: preview.contentHash,
        meta: {},
        rawItems,
    });
}

export async function commitPastedTextImport({ companyId, user, campaignId, body }) {
    const preview = previewPastedText(body || {});
    assertOptionalPreviewFingerprint(body, preview.previewFingerprint || preview.contentHash);
    const allowReview = body?.allowReviewRequired === true;
    if (allowReview) {
        // Override requires import+ingest (asserted in commitImportCore) and explicit true only.
        assertRawImportCommit(user, { requireQueryView: Boolean(body?.queryId) });
    }
    const rawItems = preview.records.map((record, i) => ({
        rowNumber: i + 1,
        record: {
            resultUrl: record.resultUrl,
            title: record.title,
            snippet: record.snippet,
        },
        // Default: exclude review_required. Override includes them for validation.
        reviewRequired: Boolean(record.reviewRequired) && !allowReview,
        reasonCode: record.reasonCode || '',
        _wasReviewRequired: Boolean(record.reviewRequired),
    }));
    const result = await commitImportCore({
        companyId,
        user,
        campaignId,
        body: { ...body, allowReviewRequired: allowReview },
        adapterType: 'pasted_text',
        contentHash: preview.contentHash,
        meta: { allowReviewRequired: allowReview },
        rawItems,
    });
    return result;
}

export async function commitFileImport({ companyId, user, campaignId, body, file }) {
    if (!file?.buffer) throw new ApiError(400, 'file is required');
    const name = file.originalname || '';
    const lower = name.toLowerCase();
    const hasHeader = body?.hasHeader === 'false' || body?.hasHeader === false ? false : true;
    let columnMapping = body?.columnMapping;
    if (typeof columnMapping === 'string') {
        try { columnMapping = JSON.parse(columnMapping); } catch { throw new ApiError(400, 'columnMapping must be JSON'); }
    }
    if (!columnMapping) throw new ApiError(400, 'columnMapping is required for file commit');

    if (lower.endsWith('.csv')) {
        const parsed = parseCsvForCommit({
            buffer: file.buffer,
            originalName: name,
            mimeType: file.mimetype,
            hasHeader,
            delimiter: body?.delimiter || null,
            columnMapping,
        });
        assertOptionalPreviewFingerprint(body, parsed.previewFingerprint || parsed.contentHash);
        return commitImportCore({
            companyId,
            user,
            campaignId,
            body: { ...body, columnMapping },
            adapterType: 'csv',
            contentHash: parsed.contentHash,
            meta: {
                ...parsed.file,
                detectedDelimiter: parsed.detectedDelimiter,
                detectedEncoding: parsed.detectedEncoding,
                availableColumns: parsed.availableColumns,
                columnMapping: parsed.columnMapping,
                hasHeader,
            },
            rawItems: [
                ...parsed.commitRecords.map((r) => ({
                    rowNumber: r.rowNumber,
                    record: r.record,
                })),
                ...((parsed.parseErrors || []).map((e) => ({
                    rowNumber: e.rowNumber,
                    record: {},
                    reviewRequired: true,
                    reasonCode: e.code || 'PARSE_ERROR',
                }))),
            ],
        });
    }

    if (lower.endsWith('.xlsx')) {
        const parsed = await parseExcelForCommit({
            buffer: file.buffer,
            originalName: name,
            mimeType: file.mimetype,
            sheetName: body?.sheetName || null,
            hasHeader,
            columnMapping,
        });
        assertOptionalPreviewFingerprint(body, parsed.previewFingerprint || parsed.contentHash);
        return commitImportCore({
            companyId,
            user,
            campaignId,
            body: { ...body, columnMapping },
            adapterType: 'excel_xlsx',
            contentHash: parsed.contentHash,
            meta: {
                ...parsed.file,
                sheetName: parsed.sheetName,
                availableColumns: parsed.availableColumns,
                columnMapping: parsed.columnMapping,
                hasHeader,
            },
            rawItems: parsed.commitRecords.map((r) => ({
                rowNumber: r.rowNumber,
                sheetName: r.sheetName,
                record: r.record,
            })),
        });
    }
    throw new ApiError(400, 'Only .csv or .xlsx files are supported');
}

export async function getImportRun({ companyId, user, campaignId, importRunId }) {
    requireCompanyId(companyId);
    requireObjectId(campaignId, 'Search campaign');
    requireObjectId(importRunId, 'Import run');
    assertRawImport(user);
    await getOwnedSearchCampaign({ companyId, user, campaignId, skipPermCheck: true });
    const run = await RawCaptureImportRun.findOne({
        _id: importRunId,
        companyId,
        campaignId,
    }).lean();
    if (!run) throw new ApiError(404, 'Import run not found');
    const q = await loadQueryStats(companyId, campaignId, run.queryId);
    return formatImportResponse(run, { query: q });
}

export async function listImportRuns({ companyId, user, campaignId, query = {} }) {
    requireCompanyId(companyId);
    requireObjectId(campaignId, 'Search campaign');
    assertRawImport(user);
    await getOwnedSearchCampaign({ companyId, user, campaignId, skipPermCheck: true });
    for (const k of Object.keys(query || {})) {
        if (k.startsWith('$') || k.includes('.')) throw new ApiError(400, `Unsafe key rejected: ${k}`);
    }
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter = { companyId, campaignId };
    if (query.status) filter.status = String(query.status);
    if (query.adapterType) filter.adapterType = String(query.adapterType);
    const [items, total] = await Promise.all([
        RawCaptureImportRun.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('-chunkStates -validationErrors')
            .lean(),
        RawCaptureImportRun.countDocuments(filter),
    ]);
    return {
        items: items.map((r) => ({
            importRunId: r._id,
            status: r.status,
            adapterType: r.adapterType,
            source: r.source,
            totalInputRows: r.totalInputRows,
            acceptedRows: r.acceptedRows,
            rejectedRows: r.rejectedRows,
            createdAt: r.createdAt,
            completedAt: r.completedAt,
        })),
        page,
        limit,
        total,
    };
}

export const __test = {
    prepareRecords,
    chunkAccepted,
    childIdempotencyKey,
    buildImportFingerprint,
    reconcileImportRunFromChildBatches,
};
