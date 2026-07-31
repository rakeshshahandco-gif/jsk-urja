import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    startQualificationJob,
    stopQualificationJob,
    getQualificationJobStatus,
    listQualificationsForSession,
    getQualificationDetail,
    updateOwnerReview,
    startStrictLocationRecheck,
    getStrictLocationRecheckStatus,
    stopStrictLocationRecheck,
} from '../services/dataExtractor/searchCampaign/rawCaptureQualification/rawCaptureQualification.service.js';
import { buildQualificationWorkbook } from '../services/dataExtractor/searchCampaign/rawCaptureQualification/rawCaptureQualification.export.service.js';
import { RawCapture } from '../models/rawCapture.model.js';
import { RawCaptureEnrichment } from '../models/rawCaptureEnrichment.model.js';
import { AssistedCaptureSession } from '../models/assistedCaptureSession.model.js';
import { SearchQuery } from '../models/searchQuery.model.js';

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
    const data = await startQualificationJob({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        mode: req.body?.mode,
        enrichmentIds: req.body?.enrichmentIds || [],
    });
    res.status(202).send(new ApiResponse(202, data, data.alreadyRunning ? 'Qualification already running' : 'Qualification started'));
});

export const stop = withSafeErrors(async (req, res) => {
    const data = await stopQualificationJob({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        jobId: req.body?.jobId || req.query?.jobId,
    });
    res.send(new ApiResponse(200, data, 'Qualification stop requested'));
});

export const jobStatus = withSafeErrors(async (req, res) => {
    const data = await getQualificationJobStatus({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        jobId: req.query?.jobId,
    });
    res.send(new ApiResponse(200, data, 'Qualification job status'));
});

export const list = withSafeErrors(async (req, res) => {
    const data = await listQualificationsForSession({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, 'Qualification list'));
});

export const detail = withSafeErrors(async (req, res) => {
    const data = await getQualificationDetail({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        qualificationId: req.params.qualificationId,
    });
    res.send(new ApiResponse(200, data, 'Qualification detail'));
});

export const review = withSafeErrors(async (req, res) => {
    const data = await updateOwnerReview({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        qualificationId: req.params.qualificationId,
        body: req.body || {},
    });
    res.send(new ApiResponse(200, data, 'Owner review updated'));
});

/** Future-ready stub — intentionally disabled in Checkpoint 7. */
export const createCrmLead = withSafeErrors(async (req, res) => {
    res.status(403).send(new ApiResponse(403, {
        createCrmLeadEnabled: false,
        qualificationId: req.params.qualificationId,
    }, 'Create CRM Lead is disabled in Checkpoint 7'));
});

export const recheckLocation = withSafeErrors(async (req, res) => {
    const data = await startStrictLocationRecheck({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        refreshAddresses: req.body?.refreshAddresses !== false,
    });
    res.status(202).send(new ApiResponse(202, data, data.alreadyRunning ? 'Strict location recheck already running' : 'Strict location recheck started'));
});

export const recheckLocationStatus = withSafeErrors(async (req, res) => {
    const data = await getStrictLocationRecheckStatus({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        jobId: req.query?.jobId,
    });
    res.send(new ApiResponse(200, data, 'Strict location recheck status'));
});

export const recheckLocationStop = withSafeErrors(async (req, res) => {
    const data = await stopStrictLocationRecheck({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        jobId: req.body?.jobId || req.query?.jobId,
    });
    res.send(new ApiResponse(200, data, 'Strict location recheck stop requested'));
});

export const exportQualified = withSafeErrors(async (req, res) => {
    const companyId = requireCompany(req);
    const sessionId = req.params.sessionId;
    const listed = await listQualificationsForSession({
        companyId,
        user: req.user,
        sessionId,
    });
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId }).lean();
    const enrichmentIds = listed.items.map((q) => q.enrichmentId).filter(Boolean);
    const enrichments = enrichmentIds.length
        ? await RawCaptureEnrichment.find({ _id: { $in: enrichmentIds }, companyId }).lean()
        : [];
    const captureIds = enrichments.flatMap((e) => e.rawCaptureIds || []);
    const captures = captureIds.length
        ? await RawCapture.find({ _id: { $in: captureIds }, companyId }).lean()
        : [];
    let queryText = '';
    if (session?.queryId) {
        const q = await SearchQuery.findById(session.queryId).select('queryText text label').lean();
        queryText = q?.queryText || q?.text || q?.label || '';
    }
    const job = await getQualificationJobStatus({ companyId, user: req.user, sessionId });
    const buffer = await buildQualificationWorkbook({
        qualifications: listed.items,
        enrichments,
        captures,
        summary: job.job || {},
        queryText,
    });
    const name = `qualified-${session?.campaignId || 'session'}-${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buffer);
});