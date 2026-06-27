import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as settingsService from '../services/whatsappBulkSettings.service.js';
import * as matterService from '../services/whatsappBulkMatter.service.js';
import * as blacklistService from '../services/whatsappBulkBlacklist.service.js';
import * as campaignService from '../services/whatsappBulkCampaign.service.js';
import * as auditService from '../services/whatsappBulkAudit.service.js';
import {
    WHATSAPP_BULK_ATTACHMENT_TYPES,
    WHATSAPP_BULK_CAMPAIGN_STATUSES,
    WHATSAPP_BULK_SEND_MODES,
    WHATSAPP_BULK_RECIPIENT_SOURCES,
    WHATSAPP_BULK_SEND_CONTENT_TYPES,
    WHATSAPP_BULK_IMAGE_EXTENSIONS,
} from '../constants/whatsappBulk.constants.js';
import { getBusinessCategoryOptions } from '../services/whatsappBulkBusinessCategory.service.js';
import { WHATSAPP_BULK_UPLOAD_DIR } from '../constants/whatsappBulk.constants.js';
import path from 'path';
import { buildImageAttachmentRef } from '../services/whatsappBulkAttachment.service.js';

const companyId = (req) => {
    if (!req.companyId) throw new ApiError(400, 'Company context required');
    return req.companyId;
};

export const getMeta = asyncHandler(async (req, res) => {
    const businessCategories = await getBusinessCategoryOptions();
    res.send(new ApiResponse(200, {
        customerTypes: businessCategories,
        businessCategories,
        industryTypes: businessCategories.filter((c) => c !== 'All'),
        attachmentTypes: WHATSAPP_BULK_ATTACHMENT_TYPES,
        sendContentTypes: WHATSAPP_BULK_SEND_CONTENT_TYPES,
        imageExtensions: WHATSAPP_BULK_IMAGE_EXTENSIONS,
        campaignStatuses: WHATSAPP_BULK_CAMPAIGN_STATUSES,
        sendModes: WHATSAPP_BULK_SEND_MODES,
        recipientSources: WHATSAPP_BULK_RECIPIENT_SOURCES,
    }));
});

export const getSettings = asyncHandler(async (req, res) => {
    const doc = await settingsService.getSettings(companyId(req));
    res.send(new ApiResponse(200, doc));
});

export const saveSettings = asyncHandler(async (req, res) => {
    const doc = await settingsService.saveSettings(companyId(req), req.body, req.user.id);
    await auditService.logAudit(companyId(req), 'settings_saved', { userId: req.user.id });
    res.send(new ApiResponse(200, doc, 'Settings saved'));
});

export const listMatters = asyncHandler(async (req, res) => {
    const rows = await matterService.listMatters(companyId(req), { activeOnly: req.query.activeOnly === 'true' });
    res.send(new ApiResponse(200, { results: rows }));
});

export const createMatter = asyncHandler(async (req, res) => {
    const doc = await matterService.createMatter(companyId(req), req.body, req.user.id);
    res.send(new ApiResponse(201, doc, 'Matter created'));
});

export const updateMatter = asyncHandler(async (req, res) => {
    const doc = await matterService.updateMatter(companyId(req), req.params.id, req.body, req.user.id);
    res.send(new ApiResponse(200, doc, 'Matter updated'));
});

export const deleteMatter = asyncHandler(async (req, res) => {
    await matterService.deleteMatter(companyId(req), req.params.id);
    res.send(new ApiResponse(200, null, 'Matter deleted'));
});

export const listBlacklist = asyncHandler(async (req, res) => {
    const rows = await blacklistService.listBlacklist(companyId(req));
    res.send(new ApiResponse(200, { results: rows }));
});

export const addBlacklist = asyncHandler(async (req, res) => {
    const doc = await blacklistService.addBlacklist(companyId(req), req.body, req.user.id);
    res.send(new ApiResponse(201, doc, 'Added to blacklist'));
});

export const removeBlacklist = asyncHandler(async (req, res) => {
    await blacklistService.removeBlacklist(companyId(req), req.params.id);
    res.send(new ApiResponse(200, null, 'Removed from blacklist'));
});

export const listCampaigns = asyncHandler(async (req, res) => {
    const rows = await campaignService.listCampaigns(companyId(req), req.query);
    res.send(new ApiResponse(200, { results: rows }));
});

export const getCampaign = asyncHandler(async (req, res) => {
    const doc = await campaignService.getCampaign(companyId(req), req.params.id);
    res.send(new ApiResponse(200, doc));
});

export const createCampaign = asyncHandler(async (req, res) => {
    const doc = await campaignService.createCampaign(companyId(req), req.body, req.user.id);
    res.send(new ApiResponse(201, doc, 'Campaign created'));
});

export const updateCampaign = asyncHandler(async (req, res) => {
    const doc = await campaignService.updateCampaign(companyId(req), req.params.id, req.body, req.user.id);
    res.send(new ApiResponse(200, doc, 'Campaign updated'));
});

export const deleteCampaign = asyncHandler(async (req, res) => {
    await campaignService.deleteCampaign(companyId(req), req.params.id);
    res.send(new ApiResponse(200, null, 'Campaign deleted'));
});

export const previewRecipients = asyncHandler(async (req, res) => {
    const data = await campaignService.previewRecipients(companyId(req), req.body);
    res.send(new ApiResponse(200, data));
});

export const saveRecipients = asyncHandler(async (req, res) => {
    const cid = companyId(req);
    if (req.body?.filters?.selectedRecipientKeys) {
        await campaignService.updateCampaign(cid, req.params.id, {
            filters: req.body.filters,
        }, req.user?.id);
    }
    const data = await campaignService.saveRecipientsForCampaign(cid, req.params.id);
    res.send(new ApiResponse(200, data, 'Recipients saved'));
});

export const listRecipients = asyncHandler(async (req, res) => {
    const rows = await campaignService.listCampaignRecipients(companyId(req), req.params.id, req.query);
    res.send(new ApiResponse(200, { results: rows }));
});

export const testSend = asyncHandler(async (req, res) => {
    const data = await campaignService.testSend(companyId(req), req.params.id, req.body.mobile, req.user.id);
    res.send(new ApiResponse(200, data, 'Test message sent'));
});

export const scheduleCampaign = asyncHandler(async (req, res) => {
    const doc = await campaignService.scheduleCampaign(companyId(req), req.params.id, req.user.id);
    res.send(new ApiResponse(200, doc, 'Campaign scheduled'));
});

export const pauseCampaign = asyncHandler(async (req, res) => {
    const doc = await campaignService.pauseCampaign(companyId(req), req.params.id, req.user.id);
    res.send(new ApiResponse(200, doc, 'Campaign paused'));
});

export const resumeCampaign = asyncHandler(async (req, res) => {
    const doc = await campaignService.resumeCampaign(companyId(req), req.params.id, req.user.id);
    res.send(new ApiResponse(200, doc, 'Campaign resumed'));
});

export const stopCampaign = asyncHandler(async (req, res) => {
    const doc = await campaignService.stopCampaign(companyId(req), req.params.id, req.user.id);
    res.send(new ApiResponse(200, doc, 'Campaign stopped'));
});

export const retryFailed = asyncHandler(async (req, res) => {
    const data = await campaignService.retryFailedRecipients(companyId(req), req.params.id, req.user.id);
    res.send(new ApiResponse(200, data, 'Failed recipients queued for retry'));
});

export const revokeSent = asyncHandler(async (req, res) => {
    const data = await campaignService.revokeSentMessages(companyId(req), req.params.id, req.user.id);
    res.send(new ApiResponse(200, data, data.message || 'Revoke completed'));
});

export const parseNumbersUpload = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No file uploaded');
    const relative = path.join(WHATSAPP_BULK_UPLOAD_DIR, req.file.filename);
    const sourceHint = req.body?.sourceHint || req.query?.sourceHint || 'txt_upload';
    const data = await campaignService.parseNumbersFromUpload(relative, sourceHint);
    res.send(new ApiResponse(200, data, `${data.count} number(s) parsed`));
});

export const exportHistory = asyncHandler(async (req, res) => {
    const buffer = await campaignService.exportCampaignHistoryExcel(companyId(req));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=whatsapp-bulk-campaign-history.xlsx');
    res.send(buffer);
});

export const uploadFile = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No file uploaded');
    const relative = path.join(WHATSAPP_BULK_UPLOAD_DIR, req.file.filename);
    res.send(new ApiResponse(200, {
        uploadFilePath: relative,
        originalName: req.file.originalname,
    }));
});

export const uploadMatterAttachment = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No file uploaded');
    const imageAttachment = buildImageAttachmentRef({
        file: req.file,
        companyId: companyId(req),
        userId: req.user.id,
    });
    res.send(new ApiResponse(200, {
        imageAttachment,
        attachmentPath: imageAttachment.filePath,
        attachmentOriginalName: req.file.originalname,
    }));
});

export const uploadCampaignImage = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No file uploaded');
    const imageAttachment = buildImageAttachmentRef({
        file: req.file,
        companyId: companyId(req),
        userId: req.user.id,
    });
    res.send(new ApiResponse(200, { imageAttachment }));
});

export const listAuditLogs = asyncHandler(async (req, res) => {
    const rows = await auditService.listAuditLogs(companyId(req), req.query);
    res.send(new ApiResponse(200, { results: rows }));
});
