import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ingestRawCaptures } from '../services/dataExtractor/searchCampaign/rawCapture/rawCapture.ingestion.service.js';
import {
    archiveRawCapture,
    getRawCapture,
    getRawCaptureBatch,
    listRawCaptures,
    updateRawCaptureNotes,
} from '../services/dataExtractor/searchCampaign/rawCapture/rawCapture.inbox.service.js';

function requireCompanyContext(req) {
    if (!req.companyId) throw new ApiError(400, 'Company context required');
    return req.companyId;
}

/** CP3A: never expose stacks, Mongo internals, or host paths on this boundary. */
function sendSafeError(res, err) {
    if (err && err.errorCode === 'IDEMPOTENCY_KEY_REUSED') {
        res.status(409).send({
            success: false,
            code: 409,
            errorCode: 'IDEMPOTENCY_KEY_REUSED',
            message: err.message || 'Idempotency key was previously used for a different capture request',
        });
        return;
    }
    const status = Number(err?.statusCode) || 500;
    const operational = Boolean(err?.isOperational) || status < 500;
    const message = operational
        ? String(err?.message || 'Request failed').slice(0, 500)
        : 'Request failed';
    res.status(status).send({
        success: false,
        code: status,
        message,
    });
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

export const ingest = withSafeErrors(async (req, res) => {
    const data = await ingestRawCaptures({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        body: req.body,
    });
    // Same-key replay (including in-flight processing) returns 200 with existing state.
    const code = data.idempotentReplay ? 200 : 201;
    const msg = data.idempotentReplay
        ? (data.processingInFlight ? 'Capture batch processing (replay)' : 'Capture batch replay')
        : 'Capture batch ingested';
    res.status(code).send(new ApiResponse(code, data, msg));
});

export const list = withSafeErrors(async (req, res) => {
    const data = await listRawCaptures({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        query: req.query,
    });
    res.send(new ApiResponse(200, data, 'Raw captures'));
});

export const getOne = withSafeErrors(async (req, res) => {
    const rawCapture = await getRawCapture({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        rawCaptureId: req.params.rawCaptureId,
    });
    res.send(new ApiResponse(200, { rawCapture }, 'Raw capture'));
});

export const updateNotes = withSafeErrors(async (req, res) => {
    const rawCapture = await updateRawCaptureNotes({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        rawCaptureId: req.params.rawCaptureId,
        body: req.body,
    });
    res.send(new ApiResponse(200, { rawCapture }, 'Raw capture notes updated'));
});

export const archive = withSafeErrors(async (req, res) => {
    const rawCapture = await archiveRawCapture({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        rawCaptureId: req.params.rawCaptureId,
    });
    res.send(new ApiResponse(200, { rawCapture }, 'Raw capture archived'));
});

export const getBatch = withSafeErrors(async (req, res) => {
    const batch = await getRawCaptureBatch({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        batchId: req.params.batchId,
    });
    res.send(new ApiResponse(200, { batch }, 'Capture batch'));
});
