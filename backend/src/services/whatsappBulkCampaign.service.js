import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import WhatsAppBulkCampaign from '../models/whatsappBulkCampaign.model.js';
import WhatsAppBulkCampaignRecipient from '../models/whatsappBulkCampaignRecipient.model.js';
import { ApiError } from '../utils/ApiError.js';
import { getSettings, assertModuleEnabled } from './whatsappBulkSettings.service.js';
import { touchMatterUsage, getMatter } from './whatsappBulkMatter.service.js';
import { logAudit } from './whatsappBulkAudit.service.js';
import {
    dispatchBulkWhatsAppSend,
    assertCrmWhatsAppConnected,
} from './whatsappBulkDispatch.service.js';
import { processQueue } from './whatsappBulkQueue.service.js';
import { WHATSAPP_BULK_UPLOAD_DIR } from '../constants/whatsappBulk.constants.js';
import {
    resolveCampaignAttachment,
    validateSendContentPayload,
} from './whatsappBulkAttachment.service.js';
import {
    buildRecipientsFromCustomers,
    buildRecipientsFromLeads,
    parseTxtNumbers,
    parseCsvNumbers,
    parseExcelNumbers,
    processRecipientCandidates,
    persistCampaignRecipients,
    getBlacklistedSet,
    normalizeMobile,
    syncCampaignSendStats,
} from './whatsappBulkRecipient.service.js';
import { resolveBulkSenderUserId, bulkSendDelay } from './whatsappBulkSafeMode.util.js';

/** Lazy — avoids Baileys/open handles when Bulk campaign module is imported in tests. */
async function getWhatsAppService() {
    const mod = await import('./whatsapp.service.js');
    return mod.default;
}

function normalizeBulkFilters(filters = {}) {
    const f = { ...filters };
    if (!f.businessCategory && f.customerTypes?.length === 1) {
        f.businessCategory = f.customerTypes[0];
    }
    if (!f.businessCategory && f.industryTypes?.length === 1) {
        f.businessCategory = f.industryTypes[0];
    }
    return f;
}

export async function previewRecipients(companyId, payload) {
    await assertModuleEnabled(companyId);
    const blacklist = await getBlacklistedSet(companyId);
    const filters = normalizeBulkFilters(payload.filters || {});

    if (payload.recipientSource === 'customer_master') {
        const result = await buildRecipientsFromCustomers(companyId, filters, blacklist);
        return { ...result, recipients: result.recipients.slice(0, 500) };
    }
    if (payload.recipientSource === 'lead_master') {
        const result = await buildRecipientsFromLeads(companyId, filters, blacklist);
        return { ...result, recipients: result.recipients.slice(0, 500) };
    }

    let candidates = [];
    if (payload.recipientSource === 'manual') {
        candidates = (payload.manualNumbers || []).map((m) => ({
            mobile: m,
            sourceType: 'manual',
            recipientKey: normalizeMobile(m) || String(m),
        }));
    } else if (payload.uploadFilePath) {
        const full = path.isAbsolute(payload.uploadFilePath)
            ? payload.uploadFilePath
            : path.join(process.cwd(), payload.uploadFilePath);
        let numbers = [];
        if (payload.recipientSource === 'txt_upload') {
            numbers = parseTxtNumbers(fs.readFileSync(full, 'utf8'));
        } else if (payload.recipientSource === 'csv_upload') {
            numbers = await parseCsvNumbers(full);
        } else if (payload.recipientSource === 'excel_upload') {
            numbers = await parseExcelNumbers(full);
        }
        candidates = numbers.map((m) => ({
            mobile: m,
            sourceType: 'upload',
            recipientKey: normalizeMobile(m) || String(m),
        }));
    }

    const preview = processRecipientCandidates(candidates, blacklist, {
        selectedRecipientKeys: filters.selectedRecipientKeys,
    });
    return { ...preview, recipients: preview.recipients.slice(0, 500) };
}

export async function listCampaigns(companyId, { status, limit = 50 } = {}) {
    const q = { companyId };
    if (status) q.status = status;
    const campaigns = await WhatsAppBulkCampaign.find(q).sort({ updatedAt: -1 }).limit(limit).lean();
    if (!campaigns.length) return campaigns;

    const campaignIds = campaigns.map((c) => c._id);
    const companyOid = new mongoose.Types.ObjectId(String(companyId));
    const rows = await WhatsAppBulkCampaignRecipient.aggregate([
        { $match: { companyId: companyOid, campaignId: { $in: campaignIds } } },
        { $group: { _id: { campaignId: '$campaignId', status: '$status' }, count: { $sum: 1 } } },
    ]);

    const byCampaign = new Map();
    for (const row of rows) {
        const cid = String(row._id.campaignId);
        if (!byCampaign.has(cid)) byCampaign.set(cid, { sent: 0, failed: 0, total: 0 });
        const bucket = byCampaign.get(cid);
        bucket.total += row.count;
        if (row._id.status === 'sent') bucket.sent = row.count;
        else if (row._id.status === 'failed') bucket.failed = row.count;
    }

    return campaigns.map((c) => {
        const stats = byCampaign.get(String(c._id));
        if (!stats) return c;
        return {
            ...c,
            sentCount: stats.sent,
            failedCount: stats.failed,
            totalRecipients: stats.total || c.totalRecipients,
        };
    });
}

export async function getCampaign(companyId, id) {
    const doc = await WhatsAppBulkCampaign.findOne({ _id: id, companyId }).lean();
    if (!doc) throw new ApiError(404, 'Campaign not found');
    return doc;
}

export async function createCampaign(companyId, body, userId) {
    await assertModuleEnabled(companyId);
    if (body.sendContentType && body.sendContentType !== 'text_only') {
        const { absolutePath } = resolveCampaignAttachment(body);
        validateSendContentPayload({
            sendContentType: body.sendContentType,
            messageBody: body.messageBody,
            imageAttachment: body.imageAttachment,
            absolutePath,
        });
    }
    const doc = await WhatsAppBulkCampaign.create({
        ...body,
        companyId,
        status: 'Draft',
        createdBy: userId,
        updatedBy: userId,
    });
    await logAudit(companyId, 'campaign_created', { campaignId: doc._id, userId, details: { name: doc.campaignName } });
    return doc;
}

export async function updateCampaign(companyId, id, body, userId) {
    const existing = await WhatsAppBulkCampaign.findOne({ _id: id, companyId });
    if (!existing) throw new ApiError(404, 'Campaign not found');
    if (['Sending', 'Completed'].includes(existing.status)) {
        throw new ApiError(400, 'Cannot edit campaign while sending or completed');
    }
    const merged = { ...existing.toObject(), ...body };
    if (merged.sendContentType && merged.sendContentType !== 'text_only') {
        const { absolutePath } = resolveCampaignAttachment(merged);
        validateSendContentPayload({
            sendContentType: merged.sendContentType,
            messageBody: merged.messageBody,
            imageAttachment: merged.imageAttachment,
            absolutePath,
        });
    }
    Object.assign(existing, body, { updatedBy: userId });
    await existing.save();
    return existing;
}

export async function deleteCampaign(companyId, id) {
    const doc = await WhatsAppBulkCampaign.findOneAndDelete({ _id: id, companyId, status: 'Draft' });
    if (!doc) throw new ApiError(404, 'Draft campaign not found');
    await WhatsAppBulkCampaignRecipient.deleteMany({ campaignId: id, companyId });
    return doc;
}

async function resolveMessage(campaign, companyId) {
    if (campaign.matterId) {
        const matter = await getMatter(companyId, campaign.matterId);
        const merged = {
            messageBody: matter.messageBody,
            sendContentType: campaign.sendContentType || matter.sendContentType || 'text_only',
            imageAttachment: campaign.imageAttachment?.filePath ? campaign.imageAttachment : matter.imageAttachment,
            attachmentPath: matter.attachmentPath || campaign.attachmentPath || '',
        };
        const { ref, absolutePath } = resolveCampaignAttachment(merged);
        return {
            messageBody: merged.messageBody,
            sendContentType: merged.sendContentType,
            imageAttachment: ref,
            absolutePath,
        };
    }
    const merged = {
        messageBody: campaign.messageBody,
        sendContentType: campaign.sendContentType || 'text_only',
        imageAttachment: campaign.imageAttachment,
        attachmentPath: campaign.attachmentPath || '',
    };
    const { ref, absolutePath } = resolveCampaignAttachment(merged);
    return {
        messageBody: merged.messageBody,
        sendContentType: merged.sendContentType,
        imageAttachment: ref,
        absolutePath,
    };
}

async function dispatchWhatsAppSend(mobile, resolved, userId, campaign = null) {
    return dispatchBulkWhatsAppSend(mobile, resolved, { userId, campaign });
}

export async function saveRecipientsForCampaign(companyId, campaignId) {
    const campaign = await WhatsAppBulkCampaign.findOne({ _id: campaignId, companyId });
    if (!campaign) throw new ApiError(404, 'Campaign not found');
    await WhatsAppBulkCampaignRecipient.deleteMany({ campaignId, companyId });
    const preview = await previewRecipients(companyId, campaign.toObject());
    const selected = preview.recipients.filter((r) => r.status === 'pending' && r.selected !== false);
    const count = await persistCampaignRecipients(companyId, campaignId, selected);
    campaign.totalRecipients = selected.length;
    campaign.skippedCount = (preview.duplicateSkipped || 0) + (preview.invalidSkipped || 0) + (preview.optOutSkipped || 0);
    campaign.sentCount = 0;
    campaign.failedCount = 0;
    await campaign.save();
    return {
        total: selected.length,
        saved: count,
        summary: {
            totalFound: preview.totalFound,
            validNumbers: preview.validNumbers,
            duplicateSkipped: preview.duplicateSkipped,
            invalidSkipped: preview.invalidSkipped,
            optOutSkipped: preview.optOutSkipped,
            finalSelected: selected.length,
        },
    };
}

export async function listCampaignRecipients(companyId, campaignId, { status, limit = 200 } = {}) {
    const q = { companyId, campaignId };
    if (status) q.status = status;
    return WhatsAppBulkCampaignRecipient.find(q).sort({ createdAt: 1 }).limit(limit).lean();
}

export async function testSend(companyId, campaignId, mobile, userId) {
    await assertModuleEnabled(companyId);
    const campaign = await WhatsAppBulkCampaign.findOne({ _id: campaignId, companyId });
    if (!campaign) throw new ApiError(404, 'Campaign not found');
    const settings = await getSettings(companyId);
    if (campaign.sendMode === 'FAST' && !settings.enableFastMode) {
        throw new ApiError(403, 'Fast Mode is disabled by admin');
    }
    const normalized = normalizeMobile(mobile);
    if (!normalized) throw new ApiError(400, 'Invalid mobile number');
    const resolved = await resolveMessage(campaign, companyId);
    const sendResult = await dispatchWhatsAppSend(normalized, resolved, userId, campaign);
    const recipient = await WhatsAppBulkCampaignRecipient.findOne({ companyId, campaignId, mobile: normalized });
    if (recipient && recipient.status === 'pending') {
        recipient.status = 'sent';
        recipient.sentAt = new Date();
        recipient.errorMessage = '';
        if (sendResult?.messageKey?.id) {
            recipient.whatsappMessageKey = {
                remoteJid: sendResult.messageKey.remoteJid || sendResult.jid || '',
                id: sendResult.messageKey.id,
                fromMe: sendResult.messageKey.fromMe !== false,
            };
        }
        await recipient.save();
    }
    if (campaign.matterId) await touchMatterUsage(companyId, campaign.matterId);
    const stats = await syncCampaignSendStats(campaignId, companyId);
    campaign.sentCount = stats.sentCount;
    campaign.failedCount = stats.failedCount;
    campaign.testSendMobile = normalized;
    campaign.testSendCompletedAt = new Date();
    if (stats.pendingCount === 0 && stats.sentCount > 0 && ['Pending', 'Sending', 'Draft'].includes(campaign.status)) {
        campaign.status = 'Completed';
        campaign.completedAt = new Date();
    }
    await campaign.save();
    await logAudit(companyId, 'test_send', { campaignId, userId, details: { mobile: normalized } });
    return { success: true, mobile: normalized, ...stats };
}

export async function scheduleCampaign(companyId, campaignId, userId) {
    await assertModuleEnabled(companyId);
    const campaign = await WhatsAppBulkCampaign.findOne({ _id: campaignId, companyId });
    if (!campaign) throw new ApiError(404, 'Campaign not found');
    const settings = await getSettings(companyId);
    if (!String(campaign.messageBody || '').trim() && !campaign.matterId) {
        throw new ApiError(400, 'Campaign message is empty');
    }
    if (settings.mandatoryTestSend !== false && !campaign.testSendCompletedAt) {
        throw new ApiError(400, 'Mandatory test send required before queue start');
    }
    if (settings.requireManualApproval !== false && !campaign.manualApprovedAt) {
        throw new ApiError(400, 'Manual approval required before queue start');
    }
    await saveRecipientsForCampaign(companyId, campaignId);
    if (campaign.scheduleType === 'now') {
        campaign.status = 'Pending';
        campaign.scheduledStartAt = new Date();
    } else {
        campaign.status = 'Scheduled';
    }
    campaign.updatedBy = userId;
    await campaign.save();
    await logAudit(companyId, 'campaign_scheduled', { campaignId, userId, details: { status: campaign.status } });
    processQueue().catch(() => {});
    return campaign;
}

export async function pauseCampaign(companyId, campaignId, userId) {
    const campaign = await WhatsAppBulkCampaign.findOne({ _id: campaignId, companyId });
    if (!campaign) throw new ApiError(404, 'Campaign not found');
    campaign.status = 'Paused';
    campaign.updatedBy = userId;
    await campaign.save();
    await logAudit(companyId, 'campaign_paused', { campaignId, userId });
    return campaign;
}

export async function resumeCampaign(companyId, campaignId, userId) {
    const campaign = await WhatsAppBulkCampaign.findOne({ _id: campaignId, companyId });
    if (!campaign) throw new ApiError(404, 'Campaign not found');
    campaign.status = 'Pending';
    campaign.updatedBy = userId;
    await campaign.save();
    await logAudit(companyId, 'campaign_resumed', { campaignId, userId });
    processQueue().catch(() => {});
    return campaign;
}

export async function stopCampaign(companyId, campaignId, userId) {
    const campaign = await WhatsAppBulkCampaign.findOne({ _id: campaignId, companyId });
    if (!campaign) throw new ApiError(404, 'Campaign not found');
    campaign.status = 'Stopped';
    campaign.completedAt = new Date();
    campaign.updatedBy = userId;
    await campaign.save();
    await logAudit(companyId, 'campaign_stopped', { campaignId, userId });
    return campaign;
}

export async function retryFailedRecipients(companyId, campaignId, userId) {
    await WhatsAppBulkCampaignRecipient.updateMany(
        { companyId, campaignId, status: 'failed' },
        { $set: { status: 'pending', errorMessage: '' } },
    );
    const campaign = await WhatsAppBulkCampaign.findOne({ _id: campaignId, companyId });
    if (campaign && ['Failed', 'Paused', 'Stopped'].includes(campaign.status)) {
        campaign.status = 'Pending';
        campaign.updatedBy = userId;
        await campaign.save();
    }
    await logAudit(companyId, 'retry_failed', { campaignId, userId });
    return { success: true };
}

/** Parse phone numbers from uploaded txt/csv/excel for manual recipient entry. */
export async function parseNumbersFromUpload(relativePath, sourceHint = 'txt_upload') {
    const full = path.isAbsolute(relativePath)
        ? relativePath
        : path.join(process.cwd(), relativePath);
    if (!fs.existsSync(full)) throw new ApiError(404, 'Upload file not found');
    const lower = full.toLowerCase();
    let numbers = [];
    if (sourceHint === 'txt_upload' || lower.endsWith('.txt')) {
        numbers = parseTxtNumbers(fs.readFileSync(full, 'utf8'));
    } else if (sourceHint === 'csv_upload' || lower.endsWith('.csv')) {
        numbers = await parseCsvNumbers(full);
    } else {
        numbers = await parseExcelNumbers(full);
    }
    const normalized = [...new Set(numbers.map((n) => normalizeMobile(n)).filter(Boolean))];
    return { numbers: normalized, count: normalized.length };
}

/**
 * Emergency: pause campaign then revoke (delete for everyone) all sent messages that have stored keys.
 * WhatsApp may reject revoke after its time limit — those count as failed.
 */
export async function revokeSentMessages(companyId, campaignId, userId) {
    await assertModuleEnabled(companyId);
    const campaign = await WhatsAppBulkCampaign.findOne({ _id: campaignId, companyId });
    if (!campaign) throw new ApiError(404, 'Campaign not found');

    if (campaign.status === 'Sending') {
        campaign.status = 'Paused';
        campaign.updatedBy = userId;
        await campaign.save();
        await logAudit(companyId, 'campaign_paused', { campaignId, userId, details: { reason: 'before_revoke' } });
    }

    const senderUserId = resolveBulkSenderUserId(campaign, userId);
    assertCrmWhatsAppConnected(senderUserId);

    const sentRows = await WhatsAppBulkCampaignRecipient.find({
        companyId,
        campaignId,
        status: 'sent',
        revokedAt: null,
        'whatsappMessageKey.id': { $exists: true, $ne: '' },
    });

    let revoked = 0;
    let failed = 0;
    for (const row of sentRows) {
        try {
            const key = row.whatsappMessageKey;
            const jid = key.remoteJid || `${row.mobile}@s.whatsapp.net`;
            await (await getWhatsAppService()).revokeMessage(senderUserId, { jid, key });
            row.revokedAt = new Date();
            await row.save();
            revoked += 1;
            await bulkSendDelay(600);
        } catch (err) {
            failed += 1;
            row.errorMessage = err?.message || 'Revoke failed';
            await row.save();
        }
    }

    campaign.status = 'Stopped';
    campaign.completedAt = new Date();
    campaign.updatedBy = userId;
    await campaign.save();
    await logAudit(companyId, 'campaign_revoke_sent', {
        campaignId,
        userId,
        details: { revoked, failed, eligible: sentRows.length },
    });

    return {
        revoked,
        failed,
        eligible: sentRows.length,
        message: revoked
            ? `Revoked ${revoked} message(s). ${failed ? `${failed} could not be revoked (WhatsApp time limit or missing key).` : ''}`
            : 'No revokable messages found. Only messages sent after this update store revoke keys.',
    };
}

export async function exportCampaignHistoryExcel(companyId) {
    const campaigns = await listCampaigns(companyId, { limit: 500 });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Campaign History');
    ws.addRow([
        'Campaign Name',
        'Status',
        'Total',
        'Sent',
        'Failed',
        'Skipped',
        'Send Mode',
        'Started At',
        'Completed At',
    ]);
    for (const c of campaigns) {
        ws.addRow([
            c.campaignName,
            c.status,
            c.totalRecipients,
            c.sentCount,
            c.failedCount,
            c.skippedCount,
            c.sendMode,
            c.startedAt,
            c.completedAt,
        ]);
    }
    return wb.xlsx.writeBuffer();
}

export function storeUpload(relativePath) {
    return path.join(WHATSAPP_BULK_UPLOAD_DIR, path.basename(relativePath));
}


export async function approveCampaign(companyId, campaignId, userId) {
    await assertModuleEnabled(companyId);
    const campaign = await WhatsAppBulkCampaign.findOne({ _id: campaignId, companyId });
    if (!campaign) throw new ApiError(404, 'Campaign not found');
    campaign.manualApprovedAt = new Date();
    campaign.manualApprovedBy = userId;
    campaign.updatedBy = userId;
    await campaign.save();
    await logAudit(companyId, 'campaign_manual_approved', { campaignId, userId });
    return campaign;
}
