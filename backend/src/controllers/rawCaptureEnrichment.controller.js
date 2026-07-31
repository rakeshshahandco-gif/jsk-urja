import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    startEnrichmentJob,
    stopEnrichmentJob,
    getEnrichmentJobStatus,
    listEnrichmentsForSession,
    getEnrichmentDetail,
    updateEnrichmentReview,
} from '../services/dataExtractor/searchCampaign/rawCaptureEnrichment/rawCaptureEnrichment.service.js';
import { buildEnrichedWorkbook } from '../services/dataExtractor/searchCampaign/rawCaptureEnrichment/rawCaptureEnrichment.export.service.js';
import { RawCapture } from '../models/rawCapture.model.js';
import { RawCaptureEnrichment } from '../models/rawCaptureEnrichment.model.js';
import { AssistedCaptureSession } from '../models/assistedCaptureSession.model.js';

function sendSafeError(res, err) {
    const status = Number(err?.statusCode) || 500;
    const operational = Boolean(err?.isOperational) || status < 500;
    const message = operational ? String(err?.message || 'Request failed').slice(0, 500) : 'Request failed';
    return res.status(status).send({ success: false, code: status, message });
}

function withSafeErrors(handler) {
    return asyncHandler(async (req, res) => {
        try {
            await handler(req, res);
        } catch (err) {
            sendSafeError(res, err);
        }
    });
}

function requireCompany(req) {
    if (!req.companyId) throw new ApiError(400, 'Company context required');
    return req.companyId;
}

export const start = withSafeErrors(async (req, res) => {
    const data = await startEnrichmentJob({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        mode: req.body?.mode,
        rawCaptureIds: req.body?.rawCaptureIds || [],
    });
    res.status(202).send(new ApiResponse(202, data, data.alreadyRunning ? 'Enrichment already running' : 'Enrichment started'));
});

export const stop = withSafeErrors(async (req, res) => {
    const data = await stopEnrichmentJob({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        jobId: req.body?.jobId || req.query?.jobId,
    });
    res.send(new ApiResponse(200, data, 'Enrichment stop requested'));
});

export const jobStatus = withSafeErrors(async (req, res) => {
    const data = await getEnrichmentJobStatus({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        jobId: req.query?.jobId,
    });
    res.send(new ApiResponse(200, data, 'Enrichment job status'));
});

export const list = withSafeErrors(async (req, res) => {
    const data = await listEnrichmentsForSession({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, 'Enrichment list'));
});

export const detail = withSafeErrors(async (req, res) => {
    const data = await getEnrichmentDetail({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        enrichmentId: req.params.enrichmentId,
    });
    res.send(new ApiResponse(200, data, 'Enrichment detail'));
});

export const review = withSafeErrors(async (req, res) => {
    const data = await updateEnrichmentReview({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        enrichmentId: req.params.enrichmentId,
        body: req.body || {},
    });
    res.send(new ApiResponse(200, data, 'Enrichment review updated'));
});

export const exportEnriched = withSafeErrors(async (req, res) => {
    const companyId = requireCompany(req);
    const sessionId = req.params.sessionId;
    const listed = await listEnrichmentsForSession({
        companyId,
        user: req.user,
        sessionId,
    });
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId }).lean();
    const captureIds = listed.items.flatMap((e) => e.rawCaptureIds || []);
    const captures = captureIds.length
        ? await RawCapture.find({ _id: { $in: captureIds }, companyId }).lean()
        : [];
    const job = await getEnrichmentJobStatus({ companyId, user: req.user, sessionId });
    const buffer = await buildEnrichedWorkbook({
        enrichments: listed.items,
        captures,
        summary: job.job || {},
    });
    const name = `enriched-${session?.campaignId || 'session'}-${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buffer);
});