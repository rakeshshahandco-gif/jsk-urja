import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    getAgentStatus,
    getSimpleLeadSearchStatus,
    listSessionRawCaptures,
    startSimpleLeadSearch,
    previewSimpleLeadSearchQueries,
    stopSimpleLeadSearch,
    continueSimpleLeadSearchAfterManual,
    completeSimpleLeadSearch,
    exportSimpleLeadSearchResults,
    stopAndExportSimpleLeadSearch,
} from '../services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.service.js';
import {
    openNextGeneratedQuery,
    openNextGooglePage,
    skipCurrentQuery,
    markQueryComplete,
    getCampaignProgress,
} from '../services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.multiQuery.service.js';
import {
    startAutoCollection,
    pauseAutoCollection,
    resumeAutoCollection,
    stopAutoCollection,
    continueAutoCollectionAfterManual,
    tickAutoCollection,
    getAutoCollectionStatus,
    continueNextBatch,
    resumeAutoCollectionCheckpoint,
    autoMoveToNextQuery,
} from '../services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.autoCollection.service.js';
import {
    enableAutoProcessing,
    pauseAutoProcessing,
    resumeAutoProcessing,
    stopAutoProcessing,
    tickAutoProcessing,
    getAutoProcessingStatus,
} from '../services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.autoProcessing.service.js';
import {
    listCampaignCapturedData,
    exportAllCurrentCampaignData,
} from '../services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.capturedData.service.js';
import { listLiveProcessingActivity } from '../services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.liveActivity.service.js';
import { listSimpleLeadSearchRuns } from '../services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.runs.service.js';
import {
    persistSessionExportArtifacts,
    getSessionExportDownloadUrl,
} from '../services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.exportS3.service.js';
import {
    archiveCampaignRawResults,
    getCampaignArchive,
} from '../services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.archiveS3.service.js';
import { deleteSimpleLeadSearchRunData } from '../services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.deleteRunData.service.js';
import { transferExtractionDevice } from '../services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.deviceTransfer.service.js';
import {
    previewCrmLeadFromCapture,
    createCrmLeadFromCapture,
} from '../services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.createCrmLead.service.js';

function sendSafeError(res, err) {
    const status = Number(err?.statusCode) || (err?.name === 'ValidationError' ? 400 : 500);
    const operational = Boolean(err?.isOperational) || status < 500 || err?.name === 'ValidationError';
    let message = operational ? String(err?.message || 'Request failed').slice(0, 500) : 'Request failed';
    if (err?.name === 'ValidationError') {
        const fields = Object.keys(err.errors || {});
        if (fields.includes('queryNormalized')) {
            message = 'China supplier search could not save a generated query (Unicode text). Please retry or contact Administrator.';
        } else if (fields.length) {
            message = `Campaign validation failed on: ${fields.join(', ')}`;
        }
    } else if (!operational && /ECONNREFUSED|ENOTFOUND|fetch failed/i.test(String(err?.message || ''))) {
        message = 'China supplier search could not be started because the backend is unavailable.';
    }
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
    const data = await startSimpleLeadSearch({
        companyId: requireCompany(req),
        user: req.user,
        body: req.body || {},
        headers: req.headers,
    });
    const code = data.idempotentReplay ? 200 : 201;
    res.status(code).send(new ApiResponse(code, data, 'Simple lead search started'));
});

export const previewQueries = withSafeErrors(async (req, res) => {
    requireCompany(req);
    const data = previewSimpleLeadSearchQueries({ body: req.body || {} });
    res.send(new ApiResponse(200, data, 'Simple lead search query preview'));
});

export const agentStatus = withSafeErrors(async (req, res) => {
    const data = await getAgentStatus({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.query?.sessionId,
        preferredDeviceId: req.query?.preferredDeviceId,
    });
    res.send(new ApiResponse(200, data, 'Discovery agent status'));
});

export const sessionStatus = withSafeErrors(async (req, res) => {
    const data = await getSimpleLeadSearchStatus({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, 'Simple lead search session status'));
});

export const sessionResults = withSafeErrors(async (req, res) => {
    const data = await listSessionRawCaptures({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        query: req.query,
    });
    res.send(new ApiResponse(200, data, 'Simple lead search session results'));
});

export const stop = withSafeErrors(async (req, res) => {
    const data = await stopSimpleLeadSearch({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, 'Search stopped'));
});

export const continueAfterManual = withSafeErrors(async (req, res) => {
    const data = await continueSimpleLeadSearchAfterManual({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, 'Continued after manual action'));
});

export const complete = withSafeErrors(async (req, res) => {
    const data = await completeSimpleLeadSearch({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, 'Session completed'));
});

export const exportResults = withSafeErrors(async (req, res) => {
    const data = await exportSimpleLeadSearchResults({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.setHeader('Content-Type', data.contentType);
    res.setHeader('Content-Disposition', 'attachment; filename="' + data.filename + '"');
    res.send(data.buffer);
});

export const stopAndExport = withSafeErrors(async (req, res) => {
    const data = await stopAndExportSimpleLeadSearch({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.setHeader('Content-Type', data.contentType);
    res.setHeader('Content-Disposition', 'attachment; filename="' + data.filename + '"');
    res.setHeader('X-Session-Ended-Message', encodeURIComponent(data.sessionEndedMessage || 'Session ended. Start a new search.'));
    res.send(data.buffer);
});

export const openNextQuery = withSafeErrors(async (req, res) => {
    const data = await openNextGeneratedQuery({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        headers: req.headers,
    });
    res.status(201).send(new ApiResponse(201, data, 'Opening next generated query'));
});

export const openNextPage = withSafeErrors(async (req, res) => {
    const data = await openNextGooglePage({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, data.alreadyPending ? 'Next page already pending' : 'Next Google page requested'));
});

export const skipQuery = withSafeErrors(async (req, res) => {
    const data = await skipCurrentQuery({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, 'Query skipped'));
});

export const completeQuery = withSafeErrors(async (req, res) => {
    const data = await markQueryComplete({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, 'Query marked complete'));
});

export const campaignProgress = withSafeErrors(async (req, res) => {
    const data = await getCampaignProgress({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, 'Campaign progress'));
});

export const autoCollectionStart = withSafeErrors(async (req, res) => {
    const data = await startAutoCollection({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        body: req.body || {},
    });
    res.status(201).send(new ApiResponse(201, data, data.message || 'Auto Collection started'));
});

export const autoCollectionPause = withSafeErrors(async (req, res) => {
    const data = await pauseAutoCollection({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, data.message || 'Auto Collection paused'));
});

export const autoCollectionResume = withSafeErrors(async (req, res) => {
    const data = await resumeAutoCollection({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, data.message || 'Auto Collection resumed'));
});

export const autoCollectionStop = withSafeErrors(async (req, res) => {
    const data = await stopAutoCollection({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        reason: req.body?.reason || 'owner_stop',
    });
    res.send(new ApiResponse(200, data, data.message || 'Auto Collection stopped'));
});

export const autoCollectionContinue = withSafeErrors(async (req, res) => {
    const data = await continueAutoCollectionAfterManual({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, data.message || 'Continuing Auto Collection'));
});

export const autoCollectionTick = withSafeErrors(async (req, res) => {
    const data = await tickAutoCollection({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, 'Auto Collection tick'));
});

export const autoCollectionStatus = withSafeErrors(async (req, res) => {
    const data = await getAutoCollectionStatus({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, 'Auto Collection status'));
});
export const autoCollectionContinueBatch = withSafeErrors(async (req, res) => {
    const data = await continueNextBatch({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, data.message || 'Continuing next page batch'));
});

export const autoCollectionResumeCheckpoint = withSafeErrors(async (req, res) => {
    const data = await resumeAutoCollectionCheckpoint({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        body: req.body || {},
    });
    res.send(new ApiResponse(200, data, data.message || 'Resuming Auto Collection'));
});

export const autoCollectionNextQuery = withSafeErrors(async (req, res) => {
    const data = await autoMoveToNextQuery({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        headers: req.headers,
    });
    res.send(new ApiResponse(200, data, data.message || 'Moving to next generated query'));
});

export const autoProcessingEnable = withSafeErrors(async (req, res) => {
    const data = await enableAutoProcessing({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        body: req.body || {},
    });
    res.status(201).send(new ApiResponse(201, data, 'Automatic processing enabled'));
});

export const autoProcessingPause = withSafeErrors(async (req, res) => {
    const data = await pauseAutoProcessing({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, 'Automatic processing paused'));
});

export const autoProcessingResume = withSafeErrors(async (req, res) => {
    const data = await resumeAutoProcessing({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, 'Automatic processing resumed'));
});

export const autoProcessingStop = withSafeErrors(async (req, res) => {
    const data = await stopAutoProcessing({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        body: req.body || {},
    });
    res.send(new ApiResponse(200, data, 'Automatic processing stopped'));
});

export const autoProcessingTick = withSafeErrors(async (req, res) => {
    const data = await tickAutoProcessing({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, 'Automatic processing tick'));
});

export const autoProcessingStatus = withSafeErrors(async (req, res) => {
    const data = await getAutoProcessingStatus({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, 'Automatic processing status'));
});
export const liveProcessingActivity = withSafeErrors(async (req, res) => {
    const data = await listLiveProcessingActivity({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        query: req.query || {},
    });
    res.send(new ApiResponse(200, data, 'Live processing activity'));
});

export const previewCapturedCrmLead = withSafeErrors(async (req, res) => {
    const data = await previewCrmLeadFromCapture({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        captureId: req.params.captureId,
        genuinenessId: req.query?.genuinenessId,
        qualificationId: req.query?.qualificationId,
        enrichmentId: req.query?.enrichmentId,
    });
    res.send(new ApiResponse(200, data, 'Create Lead preview'));
});

export const createCapturedCrmLead = withSafeErrors(async (req, res) => {
    try {
        const data = await createCrmLeadFromCapture({
            companyId: requireCompany(req),
            user: req.user,
            sessionId: req.params.sessionId,
            captureId: req.params.captureId,
            genuinenessId: req.body?.genuinenessId,
            qualificationId: req.body?.qualificationId,
            enrichmentId: req.body?.enrichmentId,
            body: req.body || {},
        });
        res.status(201).send(new ApiResponse(201, data, data.message || 'LEAD CREATED SUCCESSFULLY'));
    } catch (err) {
        if (err?.statusCode === 409) {
            return res.status(409).send(new ApiResponse(409, {
                created: false,
                blocked: true,
                message: err.message,
            }, err.message));
        }
        throw err;
    }
});

export const campaignCapturedData = withSafeErrors(async (req, res) => {
    const data = await listCampaignCapturedData({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        query: req.query || {},
    });
    res.send(new ApiResponse(200, data, 'Campaign captured data'));
});

export const exportAllCurrentData = withSafeErrors(async (req, res) => {
    const data = await exportAllCurrentCampaignData({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
    });
    res.setHeader('Content-Type', data.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${data.filename}"`);
    res.setHeader('X-Export-Row-Count', String(data.rowCount || 0));
    res.setHeader('X-Export-Campaign-Id', String(data.campaignId || ''));
    res.send(data.buffer);
});

export const listRuns = withSafeErrors(async (req, res) => {
    const data = await listSimpleLeadSearchRuns({
        companyId: requireCompany(req),
        user: req.user,
        limit: req.query?.limit,
        scope: req.query?.scope,
        includeDeleted: req.query?.includeDeleted,
    });
    res.send(new ApiResponse(200, data, 'Data Extractor runs'));
});

export const persistExportArtifacts = withSafeErrors(async (req, res) => {
    const fy = req.body?.financialYearId || req.headers['x-financial-year-id'] || 'none';
    const data = await persistSessionExportArtifacts({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        financialYearId: fy,
    });
    res.send(new ApiResponse(200, data, 'Export artifacts stored'));
});

export const downloadExportArtifact = withSafeErrors(async (req, res) => {
    const data = await getSessionExportDownloadUrl({
        companyId: requireCompany(req),
        sessionId: req.params.sessionId,
        format: req.query?.format || 'xlsx',
        expiresInSeconds: Number(req.query?.expiresIn) || 300,
    });
    res.send(new ApiResponse(200, data, 'Signed download URL'));
});

export const archiveCampaign = withSafeErrors(async (req, res) => {
    const fy = req.body?.financialYearId || req.headers['x-financial-year-id'] || 'none';
    const data = await archiveCampaignRawResults({
        companyId: requireCompany(req),
        user: req.user,
        campaignId: req.params.campaignId,
        financialYearId: fy,
        ownerApproved: Boolean(req.body?.ownerApproved),
    });
    res.send(new ApiResponse(200, data, 'Campaign archive verified'));
});

export const campaignArchiveStatus = withSafeErrors(async (req, res) => {
    const data = await getCampaignArchive({
        companyId: requireCompany(req),
        campaignId: req.params.campaignId,
    });
    res.send(new ApiResponse(200, data, 'Campaign archive status'));
});

export const transferDevice = withSafeErrors(async (req, res) => {
    const data = await transferExtractionDevice({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        targetDeviceId: req.body?.targetDeviceId,
        targetAgentTokenId: req.body?.targetAgentTokenId,
        confirm: Boolean(req.body?.confirm),
    });
    res.send(new ApiResponse(200, data, 'Extraction device transferred'));
});

export const deleteRunData = withSafeErrors(async (req, res) => {
    const data = await deleteSimpleLeadSearchRunData({
        companyId: requireCompany(req),
        user: req.user,
        sessionId: req.params.sessionId,
        confirmText: req.body?.confirmText,
        deletionReason: req.body?.deletionReason,
        downloadedConfirmed: Boolean(req.body?.downloadedConfirmed),
    });
    res.send(new ApiResponse(200, data, 'Extracted data deleted. Audit record retained.'));
});
