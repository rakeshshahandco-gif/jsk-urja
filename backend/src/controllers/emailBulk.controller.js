import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as settingsService from '../services/emailBulkSettings.service.js';
import * as templateService from '../services/emailTemplate.service.js';
import * as campaignService from '../services/emailBulkCampaign.service.js';
import * as auditService from '../services/emailBulkAudit.service.js';
import {
    EMAIL_BULK_CUSTOMER_TYPES,
    EMAIL_BULK_INDUSTRY_TYPES,
    EMAIL_BULK_ATTACHMENT_TYPES,
    EMAIL_BULK_CAMPAIGN_STATUSES,
    EMAIL_BULK_SEND_MODES,
    EMAIL_BULK_RECIPIENT_SOURCES,
    EMAIL_BULK_SEND_CONTENT_TYPES,
    EMAIL_BULK_UPLOAD_DIR,
} from '../constants/emailBulk.constants.js';
import path from 'path';
import { buildAttachmentRef } from '../services/emailBulkAttachment.service.js';

const companyId = (req) => {
    if (!req.companyId) throw new ApiError(400, 'Company context required');
    return req.companyId;
};

export const getMeta = asyncHandler(async (_req, res) => {
    res.send(new ApiResponse(200, {
        customerTypes: EMAIL_BULK_CUSTOMER_TYPES,
        industryTypes: EMAIL_BULK_INDUSTRY_TYPES,
        attachmentTypes: EMAIL_BULK_ATTACHMENT_TYPES,
        sendContentTypes: EMAIL_BULK_SEND_CONTENT_TYPES,
        campaignStatuses: EMAIL_BULK_CAMPAIGN_STATUSES,
        sendModes: EMAIL_BULK_SEND_MODES,
        recipientSources: EMAIL_BULK_RECIPIENT_SOURCES,
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

export const listTemplates = asyncHandler(async (req, res) => {
    const rows = await templateService.listTemplates(companyId(req), { activeOnly: req.query.activeOnly === 'true' });
    res.send(new ApiResponse(200, { results: rows }));
});

export const createTemplate = asyncHandler(async (req, res) => {
    const doc = await templateService.createTemplate(companyId(req), req.body, req.user.id);
    res.send(new ApiResponse(201, doc, 'Template created'));
});

export const updateTemplate = asyncHandler(async (req, res) => {
    const doc = await templateService.updateTemplate(companyId(req), req.params.id, req.body, req.user.id);
    res.send(new ApiResponse(200, doc, 'Template updated'));
});

export const deleteTemplate = asyncHandler(async (req, res) => {
    await templateService.deleteTemplate(companyId(req), req.params.id);
    res.send(new ApiResponse(200, null, 'Template deleted'));
});

export const listBlacklist = asyncHandler(async (req, res) => {
    const rows = await campaignService.listBlacklist(companyId(req));
    res.send(new ApiResponse(200, { results: rows }));
});

export const addBlacklist = asyncHandler(async (req, res) => {
    const doc = await campaignService.addBlacklist(companyId(req), req.body, req.user.id);
    res.send(new ApiResponse(201, doc, 'Added to blacklist'));
});

export const removeBlacklist = asyncHandler(async (req, res) => {
    await campaignService.removeBlacklist(companyId(req), req.params.id);
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
    const data = await campaignService.saveRecipientsForCampaign(companyId(req), req.params.id);
    res.send(new ApiResponse(200, data, 'Recipients saved'));
});

export const listRecipients = asyncHandler(async (req, res) => {
    const rows = await campaignService.listCampaignRecipients(companyId(req), req.params.id, req.query);
    res.send(new ApiResponse(200, { results: rows }));
});

export const testSend = asyncHandler(async (req, res) => {
    const data = await campaignService.testSend(companyId(req), req.params.id, req.body.email, req.user.id);
    res.send(new ApiResponse(200, data, 'Test email sent'));
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

export const exportHistory = asyncHandler(async (req, res) => {
    const buffer = await campaignService.exportCampaignHistoryExcel(companyId(req));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=email-bulk-campaign-history.xlsx');
    res.send(buffer);
});

export const uploadFile = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No file uploaded');
    const relative = path.join(EMAIL_BULK_UPLOAD_DIR, req.file.filename);
    res.send(new ApiResponse(200, {
        uploadFilePath: relative,
        originalName: req.file.originalname,
    }));
});

export const uploadAttachment = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No file uploaded');
    const attachment = buildAttachmentRef({
        file: req.file,
        companyId: companyId(req),
        userId: req.user.id,
    });
    res.send(new ApiResponse(200, { attachment }));
});

export const listAuditLogs = asyncHandler(async (req, res) => {
    const rows = await auditService.listAuditLogs(companyId(req), req.query);
    res.send(new ApiResponse(200, { results: rows }));
});
