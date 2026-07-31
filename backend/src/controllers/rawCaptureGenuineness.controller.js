import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    startVerificationJob,
    stopVerificationJob,
    getVerificationJobStatus,
    listGenuinenessForSession,
    getGenuinenessDetail,
    updateOwnerReview,
} from '../services/dataExtractor/searchCampaign/rawCaptureGenuineness/rawCaptureGenuineness.service.js';
import { buildGenuinenessWorkbook } from '../services/dataExtractor/searchCampaign/rawCaptureGenuineness/rawCaptureGenuineness.export.service.js';
import { RawCaptureQualification } from '../models/rawCaptureQualification.model.js';
import { RawCaptureEnrichment } from '../models/rawCaptureEnrichment.model.js';
import { RawCapture } from '../models/rawCapture.model.js';
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
    const data = await startVerificationJob({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        mode: req.body?.mode,
        qualificationIds: req.body?.qualificationIds || [],
    });
    res.status(202).send(new ApiResponse(202, data, data.alreadyRunning ? 'Genuineness verification already running' : 'Genuineness verification started'));
});

export const stop = withSafeErrors(async (req, res) => {
    const data = await stopVerificationJob({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        jobId: req.body?.jobId || req.query?.jobId,
    });
    res.send(new ApiResponse(200, data, 'Genuineness verification stop requested'));
});

export const jobStatus = withSafeErrors(async (req, res) => {
    const data = await getVerificationJobStatus({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        jobId: req.query?.jobId,
    });
    res.send(new ApiResponse(200, data, 'Genuineness verification job status'));
});

export const list = withSafeErrors(async (req, res) => {
    const data = await listGenuinenessForSession({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        query: req.query || {},
    });
    res.send(new ApiResponse(200, data, 'Canonical verified companies'));
});

export const detail = withSafeErrors(async (req, res) => {
    const data = await getGenuinenessDetail({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        genuinenessId: req.params.genuinenessId,
    });
    res.send(new ApiResponse(200, data, 'Genuineness detail'));
});

export const review = withSafeErrors(async (req, res) => {
    const data = await updateOwnerReview({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        genuinenessId: req.params.genuinenessId,
        body: req.body || {},
    });
    res.send(new ApiResponse(200, data, 'Owner review updated'));
});

/** Future-ready stub — intentionally disabled. */
export const createCrmLead = withSafeErrors(async (req, res) => {
    res.status(403).send(new ApiResponse(403, {
        createCrmLeadEnabled: false,
        genuinenessId: req.params.genuinenessId,
    }, 'CRM Lead creation is disabled until a separate controlled Lead-creation checkpoint is approved'));
});

export const exportVerified = withSafeErrors(async (req, res) => {
    const companyId = requireCompany(req);
    const sessionId = req.params.sessionId;
    const listed = await listGenuinenessForSession({
        companyId,
        user: req.user,
        sessionId,
        query: { limit: 'all', verifiedOnly: true },
    });
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId }).lean();
    const campaignId = session?.campaignId;
    const [qualifications, enrichments, captures] = await Promise.all([
        campaignId ? RawCaptureQualification.find({ companyId, campaignId }).lean() : Promise.resolve([]),
        campaignId ? RawCaptureEnrichment.find({ companyId, campaignId }).lean() : Promise.resolve([]),
        campaignId ? RawCapture.find({ companyId, campaignId }).lean() : Promise.resolve([]),
    ]);
    const job = await getVerificationJobStatus({ companyId, user: req.user, sessionId });
    const evidence = (listed.items || []).flatMap((c) => (c.evidence || []).map((ev) => ({
        canonicalCompany: c.companyName,
        canonicalKey: c.canonicalKey,
        sourceTitle: ev.sourceTitle,
        query: ev.query,
        googlePageIndex: ev.googlePageIndex ?? '',
        resultPosition: ev.resultPosition ?? '',
        sourceUrl: ev.sourceUrl,
        websiteUrl: ev.websiteUrl,
        capturedAt: ev.capturedAt || '',
        cp6Status: ev.cp6?.enrichmentStatus || '',
        cp7Decision: ev.cp7?.ownerDecision || ev.cp7?.systemDecision || '',
        cp7Score: ev.cp7?.relevanceScore ?? '',
        cp8Decision: ev.cp8?.ownerDecision || ev.cp8?.systemDecision || '',
        cp8Score: ev.cp8?.genuinenessScore ?? '',
        ownerDecision: ev.cp8?.ownerDecision || '',
        captureId: ev.captureId || '',
        genuinenessId: ev.genuinenessId || '',
        enrichmentId: ev.enrichmentId || '',
    })));
    const buffer = await buildGenuinenessWorkbook({
        genuinenessRecords: listed.items,
        qualifications,
        enrichments,
        captures,
        canonicalCompanies: listed.items,
        evidenceRows: evidence,
        counters: listed.counters,
        summary: job.job || {},
    });
    const name = `genuineness-${session?.campaignId || 'session'}-${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buffer);
});
