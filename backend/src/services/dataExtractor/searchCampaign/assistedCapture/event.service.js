import crypto from 'crypto';
import { AssistedCaptureEvent } from '../../../../models/assistedCaptureEvent.model.js';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { ingestRawCaptures } from '../rawCapture/rawCapture.ingestion.service.js';
import { attachBilingualToRecord } from '../simpleLeadSearch/chinaBilingual.util.js';
import { SearchQuery } from '../../../../models/searchQuery.model.js';
import { ASSISTED_IDEMPOTENCY_REUSED_CODE } from './constants.js';

function hashText(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function buildFingerprint(payload) {
    return hashText(JSON.stringify(payload));
}

function childIdempotencyKey(sessionId, eventSequence, results) {
    const contentHash16 = hashText(JSON.stringify(results || [])).slice(0, 16);
    return `ac:${sessionId}:e${eventSequence}:${contentHash16}`;
}

function sanitizeResult(r = {}) {
    return {
        title: String(r.title || '').slice(0, 500),
        snippet: String(r.snippet || '').slice(0, 5000),
        resultUrl: String(r.resultUrl || ''),
        resultPosition: r.resultPosition == null ? null : Number(r.resultPosition),
        resultTypeHint: String(r.resultTypeHint || 'unknown').slice(0, 40),
        sourceRecordId: r.sourceRecordId == null ? '' : String(r.sourceRecordId).slice(0, 300),
        notes: r.notes == null ? '' : String(r.notes).slice(0, 2000),
    };
}

function ingestSourceFromSession(session) {
    const s = String(session?.source || session?.sourceHint || '').toLowerCase();
    if (s === 'baidu') return 'baidu';
    if (s === '1688') return '1688';
    if (s === 'sogou') return 'sogou';
    if (s === 'so360' || s === '360') return 'so360';
    return 'google';
}

function throwIdempotencyReuse() {
    const err = new ApiError(409, 'Idempotency key was previously used for a different event payload');
    err.errorCode = ASSISTED_IDEMPOTENCY_REUSED_CODE;
    throw err;
}

function normalizeIngestStatus(status, acceptedCount, rejectedCount) {
    const accepted = Number(acceptedCount || 0);
    const rejected = Number(rejectedCount || 0);
    if (status === 'completed' || status === 'partially_completed' || status === 'failed') return status;
    if (accepted <= 0) return 'failed';
    if (rejected > 0) return 'partially_completed';
    return 'completed';
}

/**
 * Atomically refresh session capture counters from terminal events.
 * Never uses stale document.save() — safe under concurrent heartbeats/ticks.
 */
export async function recalculateAssistedSessionTotals(sessionOrId, companyId = null) {
    const sessionId = sessionOrId?._id || sessionOrId;
    const cid = companyId || sessionOrId?.companyId;
    if (!sessionId) return null;

    const rows = await AssistedCaptureEvent.find({
        ...(cid ? { companyId: cid } : {}),
        sessionId,
        status: { $in: ['completed', 'partially_completed'] },
    }).sort({ createdAt: 1 }).lean();

    const batchIds = [];
    for (const row of rows) {
        if (row.rawCaptureBatchId) batchIds.push(String(row.rawCaptureBatchId));
    }
    const now = new Date();
    const acceptedCount = rows.reduce((sum, row) => sum + Number(row.acceptedCount || 0), 0);
    const insertedCount = rows.reduce((sum, row) => sum + Number(row.insertedCount || 0), 0);
    const updatedExistingCount = rows.reduce((sum, row) => sum + Number(row.updatedExistingCount || 0), 0);
    const rejectedCount = rows.reduce((sum, row) => sum + Number(row.rejectedCount || 0), 0);
    const visibleResultCount = rows.reduce((sum, row) => sum + Number(row.visibleResultCount || 0), 0);
    const lastEventSequence = rows.reduce((m, row) => Math.max(m, Number(row.eventSequence || 0)), 0);
    const firstCaptureAt = rows.length ? (rows[0].capturedAt || now) : null;

    const $set = {
        captureEventCount: rows.length,
        totalEvents: rows.length,
        visibleResultCount,
        totalVisibleResults: visibleResultCount,
        acceptedCount,
        insertedCount,
        updatedExistingCount,
        rejectedCount,
        totalResults: acceptedCount,
        rawCaptureBatchIds: [...new Set(batchIds)],
        lastEventSequence,
        lastEventAt: now,
        lastCaptureAt: now,
        'autoCollection.sourceResultsFound': visibleResultCount,
        'autoCollection.rawRecordsCaptured': acceptedCount,
        'autoCollection.lastDiscoveryAt': now,
        updatedAt: now,
    };
    if (firstCaptureAt) $set.firstCaptureAt = firstCaptureAt;

    // Do not overwrite terminal session states via counter refresh.
    // Only clear pending capture when we have at least one accepted event.
    const filter = { _id: sessionId };
    if (cid) filter.companyId = cid;

    const updated = await AssistedCaptureSession.findOneAndUpdate(
        filter,
        { $set },
        { new: true },
    );

    if (acceptedCount > 0) {
        await AssistedCaptureSession.updateOne(
            {
                _id: sessionId,
                ...(cid ? { companyId: cid } : {}),
                pendingCaptureStatus: { $in: ['pending', 'acked', 'consumed'] },
            },
            {
                $set: {
                    pendingCaptureStatus: 'none',
                    pendingCaptureAckedAt: null,
                },
            },
        );
        // Soft-recover discovery if agent wrongly failed the session after accepted ingest
        await AssistedCaptureSession.updateOne(
            {
                _id: sessionId,
                ...(cid ? { companyId: cid } : {}),
                status: 'failed',
                failCode: { $in: ['ASSISTED_SESSION_FAILED', 'EVENT_INGEST_FAILED', 'AGENT_FAILED'] },
            },
            {
                $set: {
                    status: 'awaiting_user',
                    failCode: '',
                    failMessage: '',
                    'autoCollection.discoveryStatus': 'running',
                    'autoCollection.lastErrorCode': 'session_recovered_after_accepted_ingest',
                    'autoCollection.lastErrorMessage': 'Session recovered: capture batch was accepted; discovery can continue.',
                },
                $unset: { failedAt: 1 },
            },
        );
    }

    return updated;
}

async function applySuccessfulEventOutcome(event, ingestResponse, session, agentInstanceId) {
    const acceptedCount = Number(ingestResponse.acceptedCount || 0);
    const rejectedCount = Number(ingestResponse.rejectedCount || 0);
    const eventStatus = normalizeIngestStatus(ingestResponse.status, acceptedCount, rejectedCount);
    const capturedAt = new Date();

    const savedEvent = await AssistedCaptureEvent.findOneAndUpdate(
        { _id: event._id },
        {
            $set: {
                status: eventStatus,
                acceptedCount,
                insertedCount: Number(ingestResponse.insertedCount || 0),
                updatedExistingCount: Number(ingestResponse.updatedExistingCount || 0),
                rejectedCount,
                rawCaptureBatchId: ingestResponse.batchId || null,
                requestFingerprint: event.eventFingerprint,
                capturedAt,
                agentId: String(agentInstanceId || '').slice(0, 120),
                validationErrors: Array.isArray(ingestResponse.validationErrors)
                    ? ingestResponse.validationErrors.slice(0, 50)
                    : [],
                failureCode: acceptedCount > 0 ? '' : (event.failureCode || ''),
                failureMessage: acceptedCount > 0 ? '' : (event.failureMessage || ''),
            },
        },
        { new: true },
    );

    let bookkeepingWarning = null;
    try {
        // Prefer ready_to_capture / awaiting_user after capture so auto-collection can advance
        await AssistedCaptureSession.updateOne(
            {
                _id: session._id,
                companyId: session.companyId,
                status: { $nin: ['completed', 'cancelled', 'expired'] },
            },
            {
                $set: {
                    status: 'awaiting_user',
                    pendingCaptureStatus: 'none',
                    pendingCaptureAckedAt: null,
                    'autoCollection.discoveryStatus': 'running',
                    'autoCollection.lastDiscoveryAt': capturedAt,
                    googlePageIndex: Number(session.googlePageIndex || 1),
                },
            },
        );
        await recalculateAssistedSessionTotals(session._id, session.companyId);
    } catch (bookErr) {
        bookkeepingWarning = String(bookErr?.message || bookErr || 'session_bookkeeping_conflict').slice(0, 500);
        // Never demote a successful ingest event because counters raced
        if (acceptedCount > 0) {
            await AssistedCaptureEvent.updateOne(
                { _id: event._id },
                {
                    $set: {
                        status: eventStatus === 'failed' ? 'completed' : eventStatus,
                        failureCode: '',
                        failureMessage: '',
                    },
                },
            ).catch(() => null);
            await AssistedCaptureSession.updateOne(
                { _id: session._id, companyId: session.companyId },
                {
                    $set: {
                        pendingCaptureStatus: 'none',
                        pendingCaptureAckedAt: null,
                        'autoCollection.lastErrorCode': 'session_bookkeeping_warning',
                        'autoCollection.lastErrorMessage': bookkeepingWarning,
                    },
                },
            ).catch(() => null);
        } else {
            throw bookErr;
        }
    }

    return {
        event: (savedEvent || event).toObject?.() || savedEvent || event,
        ingest: {
            batchId: ingestResponse.batchId,
            acceptedCount,
            rejectedCount,
            status: eventStatus,
        },
        bookkeepingWarning,
        idempotentReplay: false,
    };
}

export async function submitAssistedCaptureEvent({ companyId, session, agentInstanceId, payload }) {
    if (payload?.html != null || payload?.dom != null || payload?.cookies != null || payload?.screenshot != null) {
        throw new ApiError(400, 'HTML/DOM/cookies/screenshot fields are not allowed');
    }

    const eventIdempotencyKey = String(payload?.eventIdempotencyKey || '').trim();
    const eventSequence = Number(payload?.eventSequence || 0);
    const visibleResultCount = Number(payload?.visibleResultCount || 0);
    const results = Array.isArray(payload?.results) ? payload.results.map(sanitizeResult) : [];
    const googlePageIndex = payload?.googlePageIndex != null
        ? Number(payload.googlePageIndex)
        : Number(session.googlePageIndex || 1);

    if (!eventIdempotencyKey) throw new ApiError(400, 'eventIdempotencyKey is required');
    if (!Number.isInteger(eventSequence) || eventSequence <= 0) throw new ApiError(400, 'eventSequence must be positive integer');
    if (results.length > 100) throw new ApiError(400, 'results must be at most 100');

    const eventFingerprint = buildFingerprint({ eventSequence, visibleResultCount, results });
    let event = null;
    const existing = await AssistedCaptureEvent.findOne({ companyId, sessionId: session._id, eventIdempotencyKey });
    if (existing) {
        if (existing.eventFingerprint !== eventFingerprint) throwIdempotencyReuse();
        // Idempotent replay of a successful (or processing-completed) event
        if (['completed', 'partially_completed'].includes(existing.status)) {
            await recalculateAssistedSessionTotals(session._id, companyId).catch(() => null);
            return {
                event: existing.toObject(),
                ingest: {
                    batchId: existing.rawCaptureBatchId,
                    acceptedCount: existing.acceptedCount,
                    rejectedCount: existing.rejectedCount,
                    status: existing.status,
                },
                idempotentReplay: true,
                bookkeepingWarning: null,
            };
        }
        // If a prior attempt left a failed event but ingest may have written a batch, do not re-ingest
        // with a different child key — return existing and let owner/agent retry with same key after fix.
        if (existing.status === 'failed' && Number(existing.acceptedCount || 0) > 0) {
            await AssistedCaptureEvent.updateOne(
                { _id: existing._id },
                { $set: { status: 'completed', failureCode: '', failureMessage: '' } },
            );
            const fixed = await AssistedCaptureEvent.findById(existing._id).lean();
            await recalculateAssistedSessionTotals(session._id, companyId).catch(() => null);
            return {
                event: fixed,
                ingest: {
                    batchId: fixed.rawCaptureBatchId,
                    acceptedCount: fixed.acceptedCount,
                    rejectedCount: fixed.rejectedCount,
                    status: fixed.status,
                },
                idempotentReplay: true,
                bookkeepingWarning: 'repaired_failed_event_with_accepted_counts',
            };
        }
        // Failed with 0 accepted, or still processing: retry ingest. Never treat as success.
        await AssistedCaptureEvent.updateOne(
            { _id: existing._id },
            {
                $set: {
                    status: 'processing',
                    failureCode: '',
                    failureMessage: '',
                    visibleResultCount,
                    submittedResultCount: results.length,
                    eventFingerprint,
                },
            },
        );
        event = existing;
    }

    if (!event) {
    try {
        event = await AssistedCaptureEvent.create({
            companyId,
            campaignId: session.campaignId,
            queryId: session.queryId,
            sessionId: session._id,
            eventIdempotencyKey,
            eventSequence,
            eventFingerprint,
            status: 'processing',
            visibleResultCount,
            submittedResultCount: results.length,
            createdByAgentId: String(agentInstanceId || '').slice(0, 120),
        });
    } catch (err) {
        // Unique index race: another request created the same key
        const raced = await AssistedCaptureEvent.findOne({ companyId, sessionId: session._id, eventIdempotencyKey });
        if (raced) {
            if (raced.eventFingerprint !== eventFingerprint) throwIdempotencyReuse();
            if (['completed', 'partially_completed'].includes(raced.status) && Number(raced.acceptedCount || 0) > 0) {
                await recalculateAssistedSessionTotals(session._id, companyId).catch(() => null);
                return {
                    event: raced.toObject(),
                    ingest: {
                        batchId: raced.rawCaptureBatchId,
                        acceptedCount: raced.acceptedCount,
                        rejectedCount: raced.rejectedCount,
                        status: raced.status,
                    },
                    idempotentReplay: true,
                    bookkeepingWarning: null,
                };
            }
            await AssistedCaptureEvent.updateOne(
                { _id: raced._id },
                {
                    $set: {
                        status: 'processing',
                        failureCode: '',
                        failureMessage: '',
                        visibleResultCount,
                        submittedResultCount: results.length,
                    },
                },
            );
            event = raced;
        } else {
            throw err;
        }
    }
    }

    if (Number.isFinite(googlePageIndex) && googlePageIndex > 0) {
        await AssistedCaptureSession.updateOne(
            { _id: session._id, companyId },
            { $set: { googlePageIndex, 'autoCollection.lastSuccessfullyCapturedPage': googlePageIndex } },
        ).catch(() => null);
    }

    let ingestResponse = null;
    try {
        let ingestRecords = results;
        try {
            const qdoc = await SearchQuery.findById(session.queryId).select('queryText selectedCriteria sourceHint').lean();
            const sourceName = ingestSourceFromSession(session);
            ingestRecords = results.map((r) => {
                const bilingual = attachBilingualToRecord(r, {
                    sourceName,
                    sourceQuery: qdoc?.queryText || '',
                    relatedKeyword: qdoc?.selectedCriteria?.relatedKeyword || '',
                });
                const { _china, ...rest } = bilingual;
                return rest;
            });
        } catch {
            ingestRecords = results;
        }
        ingestResponse = await ingestRawCaptures({
            companyId,
            user: {
                _id: null,
                id: null,
                isDiscoveryAgent: true,
                permissions: [
                    'data_extractor.search_campaign.view',
                    'data_extractor.search_query.view',
                    'data_extractor.raw_capture.ingest',
                ],
            },
            campaignId: session.campaignId,
            body: {
                queryId: String(session.queryId),
                source: ingestSourceFromSession(session),
                querySourceHint: ingestSourceFromSession(session),
                captureMethod: 'assisted_visible',
                idempotencyKey: childIdempotencyKey(session._id, eventSequence, results),
                records: ingestRecords,
            },
        });
    } catch (err) {
        await AssistedCaptureEvent.updateOne(
            { _id: event._id },
            {
                $set: {
                    status: 'failed',
                    failureCode: 'EVENT_INGEST_FAILED',
                    failureMessage: String(err?.message || 'Assisted capture event ingestion failed')
                        .replace(/[\r\n]+/g, ' ')
                        .slice(0, 500),
                },
            },
        ).catch(() => null);
        throw err;
    }

    const acceptedCount = Number(ingestResponse?.acceptedCount || 0);
    try {
        return await applySuccessfulEventOutcome(event, ingestResponse, session, agentInstanceId);
    } catch (err) {
        // Ingest already succeeded — never convert to EVENT_INGEST_FAILED
        if (acceptedCount > 0) {
            const recovered = await applySuccessfulEventOutcome(event, ingestResponse, session, agentInstanceId).catch(async () => {
                await AssistedCaptureEvent.updateOne(
                    { _id: event._id },
                    {
                        $set: {
                            status: normalizeIngestStatus(ingestResponse.status, acceptedCount, ingestResponse.rejectedCount),
                            acceptedCount,
                            insertedCount: Number(ingestResponse.insertedCount || 0),
                            updatedExistingCount: Number(ingestResponse.updatedExistingCount || 0),
                            rejectedCount: Number(ingestResponse.rejectedCount || 0),
                            rawCaptureBatchId: ingestResponse.batchId || null,
                            capturedAt: new Date(),
                            failureCode: '',
                            failureMessage: '',
                        },
                    },
                );
                return {
                    event: (await AssistedCaptureEvent.findById(event._id).lean()),
                    ingest: {
                        batchId: ingestResponse.batchId,
                        acceptedCount,
                        rejectedCount: Number(ingestResponse.rejectedCount || 0),
                        status: 'completed',
                    },
                    bookkeepingWarning: String(err?.message || err).slice(0, 500),
                    idempotentReplay: false,
                };
            });
            return recovered;
        }
        await AssistedCaptureEvent.updateOne(
            { _id: event._id },
            {
                $set: {
                    status: 'failed',
                    failureCode: 'EVENT_INGEST_FAILED',
                    failureMessage: String(err?.message || 'Assisted capture event ingestion failed')
                        .replace(/[\r\n]+/g, ' ')
                        .slice(0, 500),
                },
            },
        ).catch(() => null);
        throw err;
    }
}
