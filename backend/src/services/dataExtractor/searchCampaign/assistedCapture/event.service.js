import crypto from 'crypto';
import { AssistedCaptureEvent } from '../../../../models/assistedCaptureEvent.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { ingestRawCaptures } from '../rawCapture/rawCapture.ingestion.service.js';
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
    };
}

function throwIdempotencyReuse() {
    const err = new ApiError(409, 'Idempotency key was previously used for a different event payload');
    err.errorCode = ASSISTED_IDEMPOTENCY_REUSED_CODE;
    throw err;
}

export async function recalculateAssistedSessionTotals(session) {
    const rows = await AssistedCaptureEvent.find({
        companyId: session.companyId,
        sessionId: session._id,
        status: { $in: ['completed', 'partially_completed'] },
    }).lean();
    session.captureEventCount = rows.length;
    session.totalEvents = rows.length;
    session.visibleResultCount = rows.reduce((sum, row) => sum + Number(row.visibleResultCount || 0), 0);
    session.totalVisibleResults = session.visibleResultCount;
    session.acceptedCount = rows.reduce((sum, row) => sum + Number(row.acceptedCount || 0), 0);
    session.insertedCount = rows.reduce((sum, row) => sum + Number(row.insertedCount || 0), 0);
    session.updatedExistingCount = rows.reduce((sum, row) => sum + Number(row.updatedExistingCount || 0), 0);
    session.rejectedCount = rows.reduce((sum, row) => sum + Number(row.rejectedCount || 0), 0);
    session.totalResults = session.acceptedCount;
    const batchIds = [];
    for (const row of rows) {
        if (row.rawCaptureBatchId) batchIds.push(String(row.rawCaptureBatchId));
    }
    session.rawCaptureBatchIds = [...new Set(batchIds)];
    session.lastEventSequence = rows.reduce((m, row) => Math.max(m, Number(row.eventSequence || 0)), 0);
    session.lastEventAt = new Date();
    session.lastCaptureAt = session.lastEventAt;
    if (!session.firstCaptureAt && rows.length) session.firstCaptureAt = rows[0].capturedAt || session.lastEventAt;
    await session.save();
}

export async function submitAssistedCaptureEvent({ companyId, session, agentInstanceId, payload }) {
    if (payload?.html != null || payload?.dom != null || payload?.cookies != null || payload?.screenshot != null) {
        throw new ApiError(400, 'HTML/DOM/cookies/screenshot fields are not allowed');
    }

    const eventIdempotencyKey = String(payload?.eventIdempotencyKey || '').trim();
    const eventSequence = Number(payload?.eventSequence || 0);
    const visibleResultCount = Number(payload?.visibleResultCount || 0);
    const results = Array.isArray(payload?.results) ? payload.results.map(sanitizeResult) : [];

    if (!eventIdempotencyKey) throw new ApiError(400, 'eventIdempotencyKey is required');
    if (!Number.isInteger(eventSequence) || eventSequence <= 0) throw new ApiError(400, 'eventSequence must be positive integer');
    if (results.length > 100) throw new ApiError(400, 'results must be at most 100');

    const eventFingerprint = buildFingerprint({ eventSequence, visibleResultCount, results });
    const existing = await AssistedCaptureEvent.findOne({ companyId, sessionId: session._id, eventIdempotencyKey });
    if (existing) {
        if (existing.eventFingerprint !== eventFingerprint) throwIdempotencyReuse();
        return { event: existing.toObject(), idempotentReplay: true };
    }

    const event = await AssistedCaptureEvent.create({
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

    try {
        const ingestResponse = await ingestRawCaptures({
            companyId,
            user: {
                _id: null,
                id: null,
                isDiscoveryAgent: true,
                // ingestRawCaptures permission checks (campaign visibility + raw ingest + query view)
                permissions: [
                    'data_extractor.search_campaign.view',
                    'data_extractor.search_query.view',
                    'data_extractor.raw_capture.ingest',
                ],
            },
            campaignId: session.campaignId,
            body: {
                queryId: String(session.queryId),
                source: 'google',
                captureMethod: 'assisted_visible',
                idempotencyKey: childIdempotencyKey(session._id, eventSequence, results),
                records: results,
            },
        });

        event.status = ingestResponse.status || 'completed';
        event.acceptedCount = Number(ingestResponse.acceptedCount || 0);
        event.insertedCount = Number(ingestResponse.insertedCount || 0);
        event.updatedExistingCount = Number(ingestResponse.updatedExistingCount || 0);
        event.rejectedCount = Number(ingestResponse.rejectedCount || 0);
        event.rawCaptureBatchId = ingestResponse.batchId || null;
        event.requestFingerprint = eventFingerprint;
        event.capturedAt = new Date();
        event.agentId = String(agentInstanceId || '').slice(0, 120);
        event.validationErrors = Array.isArray(ingestResponse.validationErrors) ? ingestResponse.validationErrors.slice(0, 50) : [];
        await event.save();

        session.status = 'capturing';
        // Consume any UI capture request after successful event
        if (['pending', 'acked', 'consumed'].includes(session.pendingCaptureStatus)) {
            session.pendingCaptureStatus = 'none';
            session.pendingCaptureAckedAt = null;
            // keep pendingCaptureIdempotencyKey for same-key idempotent replay
        }
        await recalculateAssistedSessionTotals(session);

        return {
            event: event.toObject(),
            ingest: {
                batchId: ingestResponse.batchId,
                acceptedCount: ingestResponse.acceptedCount,
                rejectedCount: ingestResponse.rejectedCount,
                status: ingestResponse.status,
            },
            idempotentReplay: false,
        };
    } catch (err) {
        event.status = 'failed';
        event.failureCode = 'EVENT_INGEST_FAILED';
        event.failureMessage = 'Assisted capture event ingestion failed';
        await event.save();
        throw err;
    }
}
