import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import EmailCampaign from '../models/emailCampaign.model.js';
import EmailCampaignRecipient from '../models/emailCampaignRecipient.model.js';
import EmailBlacklist from '../models/emailBlacklist.model.js';
import { ApiError } from '../utils/ApiError.js';
import { getSettings, assertModuleEnabled } from './emailBulkSettings.service.js';
import { touchTemplateUsage, getTemplate } from './emailTemplate.service.js';
import { logAudit } from './emailBulkAudit.service.js';
import EmailService from './email.service.js';
import { getDecryptedSettings } from './emailSettings.service.js';
import { recordCommunication } from './communicationHistory.service.js';
import {
    validateSendContentPayload,
    toNodemailerAttachments,
} from './emailBulkAttachment.service.js';
import {
    buildRecipientsFromCustomers,
    buildRecipientsFromLeads,
    buildRecipientsFromSuppliers,
    parseTxtEmails,
    parseCsvEmails,
    parseExcelEmails,
    dedupeRecipients,
    persistCampaignRecipients,
    getBlacklistedSet,
    normalizeEmail,
} from './emailBulkRecipient.service.js';
import { EMAIL_BULK_UPLOAD_DIR } from '../constants/emailBulk.constants.js';

function customerMatchesIndustry(customer, industryTypes = []) {
    if (!industryTypes?.length) return true;
    const fields = customer.industryCustomFields || {};
    const values = fields instanceof Map ? [...fields.values()] : Object.values(fields);
    return industryTypes.some((t) => values.includes(t));
}

export async function listCampaigns(companyId, { status, limit = 50 } = {}) {
    const q = { companyId };
    if (status) q.status = status;
    return EmailCampaign.find(q).sort({ updatedAt: -1 }).limit(limit).lean();
}

export async function getCampaign(companyId, id) {
    const doc = await EmailCampaign.findOne({ _id: id, companyId }).lean();
    if (!doc) throw new ApiError(404, 'Campaign not found');
    return doc;
}

export async function createCampaign(companyId, body, userId) {
    await assertModuleEnabled(companyId);
    validateSendContentPayload({
        sendContentType: body.sendContentType || 'text_only',
        subject: body.subject,
        bodyText: body.bodyText,
        bodyHtml: body.bodyHtml,
        attachments: body.attachments || [],
    });
    const doc = await EmailCampaign.create({
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
    const existing = await EmailCampaign.findOne({ _id: id, companyId });
    if (!existing) throw new ApiError(404, 'Campaign not found');
    if (['Sending', 'Completed'].includes(existing.status)) {
        throw new ApiError(400, 'Cannot edit campaign while sending or completed');
    }
    const merged = { ...existing.toObject(), ...body };
    validateSendContentPayload({
        sendContentType: merged.sendContentType || 'text_only',
        subject: merged.subject,
        bodyText: merged.bodyText,
        bodyHtml: merged.bodyHtml,
        attachments: merged.attachments || [],
    });
    Object.assign(existing, body, { updatedBy: userId });
    await existing.save();
    return existing;
}

export async function deleteCampaign(companyId, id) {
    const doc = await EmailCampaign.findOneAndDelete({ _id: id, companyId, status: 'Draft' });
    if (!doc) throw new ApiError(404, 'Draft campaign not found');
    await EmailCampaignRecipient.deleteMany({ campaignId: id, companyId });
    return doc;
}

async function resolveMessage(campaign, companyId) {
    if (campaign.templateId) {
        const template = await getTemplate(companyId, campaign.templateId);
        return {
            subject: campaign.subject || template.subject,
            bodyText: campaign.bodyText || template.bodyText,
            bodyHtml: campaign.bodyHtml || template.bodyHtml,
            sendContentType: campaign.sendContentType || template.sendContentType || 'text_only',
            attachments: (campaign.attachments?.length ? campaign.attachments : template.attachments) || [],
            templateId: campaign.templateId,
        };
    }
    return {
        subject: campaign.subject,
        bodyText: campaign.bodyText,
        bodyHtml: campaign.bodyHtml,
        sendContentType: campaign.sendContentType || 'text_only',
        attachments: campaign.attachments || [],
        templateId: null,
    };
}

async function getSmtpSettings(companyId) {
    const settings = await getDecryptedSettings(companyId);
    if (!settings?.authUser && !settings?.fromEmail) {
        throw new ApiError(400, 'Email SMTP settings not configured');
    }
    return EmailService.normalizeSettings(settings);
}

async function dispatchEmailSend(to, resolved, smtpSettings, meta = {}) {
    validateSendContentPayload({
        sendContentType: resolved.sendContentType,
        subject: resolved.subject,
        bodyText: resolved.bodyText,
        bodyHtml: resolved.bodyHtml,
        attachments: resolved.attachments,
    });
    const attachments = toNodemailerAttachments(resolved.attachments);
    await EmailService.sendEmail(smtpSettings, {
        to,
        subject: resolved.subject,
        text: resolved.bodyText || undefined,
        html: resolved.bodyHtml || resolved.bodyText || undefined,
        attachments: attachments.length ? attachments : undefined,
    });
    if (meta.companyId) {
        await recordCommunication(meta.companyId, {
            channel: 'email',
            direction: 'outbound',
            recipientAddress: to,
            recipientName: meta.displayName || '',
            subject: resolved.subject,
            bodyPreview: String(resolved.bodyText || resolved.bodyHtml || '').slice(0, 500),
            status: 'sent',
            campaignId: meta.campaignId || null,
            templateId: resolved.templateId || null,
            sentBy: meta.userId || null,
            sentAt: new Date(),
        });
    }
}

export async function previewRecipients(companyId, payload) {
    await assertModuleEnabled(companyId);
    const blacklist = await getBlacklistedSet(companyId);
    let raw = [];

    if (payload.recipientSource === 'customer_master') {
        const q = payload.filters || {};
        if (q.industryTypes?.length) {
            const Customer = (await import('../models/customer.model.js')).default;
            const query = { isDeleted: { $ne: true } };
            if (q.activeOnly) query.isActive = true;
            if (q.inactiveOnly) query.isActive = false;
            if (q.customerTypes?.length) query.customerType = { $in: q.customerTypes };
            if (q.states?.length) query.state = { $in: q.states };
            if (q.cities?.length) query.city = { $in: q.cities };
            if (q.selectedCustomerIds?.length) query._id = { $in: q.selectedCustomerIds };
            const rows = await Customer.find(query).select('customerName companyEmail contactPersons industryCustomFields').lean();
            const seen = new Set();
            for (const c of rows) {
                if (!customerMatchesIndustry(c, q.industryTypes)) continue;
                const emails = [c.companyEmail, ...(c.contactPersons || []).map((cp) => cp.email)].filter(Boolean);
                for (const e of emails) {
                    const email = normalizeEmail(e);
                    if (!email || seen.has(email) || blacklist.has(email)) continue;
                    seen.add(email);
                    raw.push({ email, displayName: c.customerName || '', sourceRef: String(c._id) });
                }
            }
        } else {
            raw = await buildRecipientsFromCustomers(companyId, q, blacklist);
        }
    } else if (payload.recipientSource === 'lead_master') {
        raw = await buildRecipientsFromLeads(companyId, payload.filters || {}, blacklist);
    } else if (payload.recipientSource === 'supplier_master') {
        raw = await buildRecipientsFromSuppliers(companyId, payload.filters || {}, blacklist);
    } else if (payload.recipientSource === 'manual') {
        raw = (payload.manualEmails || []).map((e) => ({ email: e }));
    } else if (payload.uploadFilePath) {
        const full = path.isAbsolute(payload.uploadFilePath)
            ? payload.uploadFilePath
            : path.join(process.cwd(), payload.uploadFilePath);
        let emails = [];
        if (payload.recipientSource === 'txt_upload') {
            emails = parseTxtEmails(fs.readFileSync(full, 'utf8'));
        } else if (payload.recipientSource === 'csv_upload') {
            emails = await parseCsvEmails(full);
        } else if (payload.recipientSource === 'excel_upload') {
            emails = await parseExcelEmails(full);
        }
        raw = emails.map((e) => ({ email: e }));
    }

    const recipients = dedupeRecipients(raw, blacklist);
    return {
        total: recipients.length,
        valid: recipients.filter((r) => r.status !== 'blacklisted').length,
        blacklisted: recipients.filter((r) => r.status === 'blacklisted').length,
        recipients: recipients.slice(0, 500),
    };
}

export async function saveRecipientsForCampaign(companyId, campaignId) {
    const campaign = await EmailCampaign.findOne({ _id: campaignId, companyId });
    if (!campaign) throw new ApiError(404, 'Campaign not found');
    await EmailCampaignRecipient.deleteMany({ campaignId, companyId });
    const preview = await previewRecipients(companyId, campaign.toObject());
    const count = await persistCampaignRecipients(companyId, campaignId, preview.recipients);
    campaign.totalRecipients = preview.total;
    campaign.skippedCount = preview.blacklisted;
    await campaign.save();
    return { total: preview.total, saved: count };
}

export async function listCampaignRecipients(companyId, campaignId, { status, limit = 200 } = {}) {
    const q = { companyId, campaignId };
    if (status) q.status = status;
    return EmailCampaignRecipient.find(q).sort({ createdAt: 1 }).limit(limit).lean();
}

export async function testSend(companyId, campaignId, email, userId) {
    await assertModuleEnabled(companyId);
    const campaign = await getCampaign(companyId, campaignId);
    const settings = await getSettings(companyId);
    if (campaign.sendMode === 'FAST' && !settings.enableFastMode) {
        throw new ApiError(403, 'Fast Mode is disabled by admin');
    }
    const normalized = normalizeEmail(email);
    if (!normalized) throw new ApiError(400, 'Invalid email address');
    const resolved = await resolveMessage(campaign, companyId);
    const smtpSettings = await getSmtpSettings(companyId);
    await dispatchEmailSend(normalized, resolved, smtpSettings, {
        companyId,
        campaignId,
        userId,
        displayName: '',
    });
    if (campaign.templateId) await touchTemplateUsage(companyId, campaign.templateId);
    await logAudit(companyId, 'test_send', { campaignId, userId, details: { email: normalized } });
    return { success: true, email: normalized };
}

export async function scheduleCampaign(companyId, campaignId, userId) {
    await assertModuleEnabled(companyId);
    const campaign = await EmailCampaign.findOne({ _id: campaignId, companyId });
    if (!campaign) throw new ApiError(404, 'Campaign not found');
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
    return campaign;
}

export async function pauseCampaign(companyId, campaignId, userId) {
    const campaign = await EmailCampaign.findOne({ _id: campaignId, companyId });
    if (!campaign) throw new ApiError(404, 'Campaign not found');
    campaign.status = 'Paused';
    campaign.updatedBy = userId;
    await campaign.save();
    await logAudit(companyId, 'campaign_paused', { campaignId, userId });
    return campaign;
}

export async function resumeCampaign(companyId, campaignId, userId) {
    const campaign = await EmailCampaign.findOne({ _id: campaignId, companyId });
    if (!campaign) throw new ApiError(404, 'Campaign not found');
    campaign.status = 'Pending';
    campaign.updatedBy = userId;
    await campaign.save();
    await logAudit(companyId, 'campaign_resumed', { campaignId, userId });
    return campaign;
}

export async function stopCampaign(companyId, campaignId, userId) {
    const campaign = await EmailCampaign.findOne({ _id: campaignId, companyId });
    if (!campaign) throw new ApiError(404, 'Campaign not found');
    campaign.status = 'Stopped';
    campaign.completedAt = new Date();
    campaign.updatedBy = userId;
    await campaign.save();
    await logAudit(companyId, 'campaign_stopped', { campaignId, userId });
    return campaign;
}

export async function retryFailedRecipients(companyId, campaignId, userId) {
    await EmailCampaignRecipient.updateMany(
        { companyId, campaignId, status: 'failed' },
        { $set: { status: 'pending', errorMessage: '' } },
    );
    const campaign = await EmailCampaign.findOne({ _id: campaignId, companyId });
    if (campaign && ['Failed', 'Paused', 'Stopped'].includes(campaign.status)) {
        campaign.status = 'Pending';
        campaign.updatedBy = userId;
        await campaign.save();
    }
    await logAudit(companyId, 'retry_failed', { campaignId, userId });
    return { success: true };
}

export async function exportCampaignHistoryExcel(companyId) {
    const campaigns = await listCampaigns(companyId, { limit: 500 });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Email Campaign History');
    ws.addRow(['Campaign Name', 'Status', 'Total', 'Sent', 'Failed', 'Skipped', 'Send Mode', 'Started At', 'Completed At']);
    for (const c of campaigns) {
        ws.addRow([c.campaignName, c.status, c.totalRecipients, c.sentCount, c.failedCount, c.skippedCount, c.sendMode, c.startedAt, c.completedAt]);
    }
    return wb.xlsx.writeBuffer();
}

export async function listBlacklist(companyId) {
    return EmailBlacklist.find({ companyId }).sort({ updatedAt: -1 }).lean();
}

export async function addBlacklist(companyId, payload, userId) {
    const email = normalizeEmail(payload.email);
    if (!email) throw new ApiError(400, 'Invalid email address');
    return EmailBlacklist.findOneAndUpdate(
        { companyId, email },
        { ...payload, email, companyId, isActive: true, createdBy: userId },
        { upsert: true, new: true },
    );
}

export async function removeBlacklist(companyId, id) {
    const doc = await EmailBlacklist.findOneAndDelete({ _id: id, companyId });
    if (!doc) throw new ApiError(404, 'Blacklist entry not found');
    return doc;
}

export { resolveMessage, getSmtpSettings, dispatchEmailSend };
