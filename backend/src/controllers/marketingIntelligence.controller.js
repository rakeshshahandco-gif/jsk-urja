import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listCampaigns, getCampaign, createCampaign, updateCampaign, buildAudience,
    audiencePreview, listRecipients, reviewRecipients, recommendCampaignContent,
    generateCampaignMessage, updateMessage, setApprovals, finalApprove,
    prepareHandoff, lockCampaign, cancelCampaign, getHistory, exportCampaign,
} from '../services/dataExtractor/marketingIntelligence/campaign.service.js';
import {
    createBatch, listBatches, getBatch, controlBatch, processBatchChunk,
} from '../services/dataExtractor/marketingIntelligence/batch.service.js';
import {
    getMarketingSettings, saveMarketingSettings,
} from '../services/dataExtractor/marketingIntelligence/settings.service.js';
import { getEmailBlacklistSet, getWhatsAppBlacklistSet } from '../services/dataExtractor/marketingIntelligence/optout.adapter.js';
import { dedupeRecipients } from '../services/dataExtractor/marketingIntelligence/duplicate.service.js';
import { checkFrequency } from '../services/dataExtractor/marketingIntelligence/frequency.adapter.js';
import { getMarketingSettings as _gs } from '../services/dataExtractor/marketingIntelligence/settings.service.js';

function rejectTenantOverrides(req) {
    if (req.body?.companyId != null || req.body?.tenantId != null || req.query?.companyId != null || req.query?.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

export const list = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listCampaigns(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Marketing campaigns'));
});

export const getOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getCampaign(req.companyId, req.params.id, req.user);
    res.send(new ApiResponse(200, data, 'Marketing campaign'));
});

export const create = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await createCampaign(req.companyId, req.user.id, req.body || {}, req.user);
    res.status(201).send(new ApiResponse(201, data, 'Campaign Draft created'));
});

export const update = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await updateCampaign(req.companyId, req.user.id, req.params.id, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Campaign Draft updated'));
});

export const buildAudienceHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await buildAudience(req.companyId, req.user.id, req.params.id, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Audience prepared'));
});

export const audiencePreviewHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await audiencePreview(req.companyId, req.params.id, req.user);
    res.send(new ApiResponse(200, data, 'Audience preview'));
});

export const recipients = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listRecipients(req.companyId, req.params.id, req.query, req.user);
    res.send(new ApiResponse(200, data, 'Campaign recipients'));
});

export const reviewRecipientsHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await reviewRecipients(req.companyId, req.user.id, req.params.id, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Recipients reviewed'));
});

export const deduplicateHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listRecipients(req.companyId, req.params.id, { limit: 5000 }, req.user);
    const deduped = dedupeRecipients(data.items || [], { duplicatePolicy: req.body?.duplicatePolicy || 'KEEP_PRIMARY' });
    res.send(new ApiResponse(200, { items: deduped, total: deduped.length }, 'Deduplicated preview'));
});

export const validateOptoutHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const [emailSet, waSet] = await Promise.all([
        getEmailBlacklistSet(req.companyId),
        getWhatsAppBlacklistSet(req.companyId),
    ]);
    res.send(new ApiResponse(200, {
        emailBlacklistCount: emailSet.size,
        whatsappBlacklistCount: waSet.size,
        validatedAt: new Date().toISOString(),
        note: 'Read-only check against existing EmailBlacklist / WhatsAppBulkBlacklist',
    }, 'Opt-out validation'));
});

export const checkFrequencyHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const settings = await _gs(req.companyId);
    const data = await checkFrequency({
        companyId: req.companyId,
        email: req.body?.email,
        phone: req.body?.phone,
        campaignType: req.body?.campaignType,
        settings,
    });
    res.send(new ApiResponse(200, data, 'Frequency check'));
});

export const recommendContentHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await recommendCampaignContent(req.companyId, req.user.id, req.params.id, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Content recommended'));
});

export const generateMessageHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await generateCampaignMessage(req.companyId, req.user.id, req.params.id, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Message draft generated'));
});

export const updateMessageHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await updateMessage(req.companyId, req.user.id, req.params.id, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Message draft updated'));
});

export const reviewHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await setApprovals(req.companyId, req.user.id, req.params.id, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Approvals updated'));
});

export const finalApproveHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await finalApprove(req.companyId, req.user.id, req.params.id, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Campaign approved for handoff'));
});

export const prepareHandoffHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await prepareHandoff(req.companyId, req.user.id, req.params.id, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Handoff package prepared (non-executable)'));
});

export const lockHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await lockCampaign(req.companyId, req.user.id, req.params.id, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Lock updated'));
});

export const cancelHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await cancelCampaign(req.companyId, req.user.id, req.params.id, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Campaign cancelled'));
});

export const historyHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getHistory(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Campaign history'));
});

export const exportHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await exportCampaign(req.companyId, req.params.id, req.query, req.user);
    res.send(new ApiResponse(200, data, 'Campaign export'));
});

export const listBatchesHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listBatches(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Marketing batches'));
});

export const createBatchHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await createBatch(req.companyId, req.user.id, req.body || {}, req.user);
    res.status(201).send(new ApiResponse(201, data, 'Batch created'));
});

export const getBatchHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getBatch(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Batch'));
});

export const pauseBatchHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await controlBatch(req.companyId, req.user.id, req.params.id, 'pause', req.user);
    res.send(new ApiResponse(200, data, 'Batch paused'));
});

export const resumeBatchHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await controlBatch(req.companyId, req.user.id, req.params.id, 'resume', req.user);
    res.send(new ApiResponse(200, data, 'Batch resumed'));
});

export const stopBatchHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await controlBatch(req.companyId, req.user.id, req.params.id, 'stop', req.user);
    res.send(new ApiResponse(200, data, 'Batch stopped'));
});

export const retryBatchHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await controlBatch(req.companyId, req.user.id, req.params.id, 'retry-failed', req.user);
    res.send(new ApiResponse(200, data, 'Batch retry queued'));
});

export const processBatchHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await processBatchChunk(req.companyId, req.user.id, req.params.id, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Batch chunk processed'));
});

export const getSettingsHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getMarketingSettings(req.companyId);
    res.send(new ApiResponse(200, data, 'Marketing settings'));
});

export const saveSettingsHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await saveMarketingSettings(req.companyId, req.user.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Marketing settings saved'));
});
