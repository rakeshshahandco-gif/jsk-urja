import EmailCampaign from '../models/emailCampaign.model.js';
import EmailCampaignRecipient from '../models/emailCampaignRecipient.model.js';
import { getSettings } from './emailBulkSettings.service.js';
import { touchTemplateUsage } from './emailTemplate.service.js';
import { logAudit } from './emailBulkAudit.service.js';
import { recordCommunication } from './communicationHistory.service.js';
import {
    resolveMessage,
    getSmtpSettings,
} from './emailBulkCampaign.service.js';
import EmailService from './email.service.js';
import { toNodemailerAttachments, validateSendContentPayload } from './emailBulkAttachment.service.js';

let processing = false;
let messagesSincePause = 0;

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs, maxMs) {
    const min = Math.min(minMs, maxMs);
    const max = Math.max(minMs, maxMs);
    return min + Math.floor(Math.random() * (max - min + 1));
}

function isWithinSendWindow(campaign, settings) {
    const now = new Date();
    const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const start = campaign.sendWindowStart || settings.sendWindowStart || '09:00';
    const end = campaign.sendWindowEnd || settings.sendWindowEnd || '19:00';
    return current >= start && current <= end;
}

function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function resetDailyCounterIfNeeded(campaign) {
    const key = todayKey();
    if (campaign.dailySentDate !== key) {
        campaign.dailySentDate = key;
        campaign.dailySentToday = 0;
        await campaign.save();
    }
}

async function sendOneRecipient(campaign, recipient, smtpSettings, resolved) {
    try {
        validateSendContentPayload({
            sendContentType: resolved.sendContentType,
            subject: resolved.subject,
            bodyText: resolved.bodyText,
            bodyHtml: resolved.bodyHtml,
            attachments: resolved.attachments,
        });
        const attachments = toNodemailerAttachments(resolved.attachments);
        await EmailService.sendEmail(smtpSettings, {
            to: recipient.email,
            subject: resolved.subject,
            text: resolved.bodyText || undefined,
            html: resolved.bodyHtml || resolved.bodyText || undefined,
            attachments: attachments.length ? attachments : undefined,
        });
        recipient.status = 'sent';
        recipient.sentAt = new Date();
        recipient.errorMessage = '';
        campaign.sentCount += 1;
        if (campaign.templateId) await touchTemplateUsage(campaign.companyId, campaign.templateId);
        await recordCommunication(campaign.companyId, {
            channel: 'email',
            direction: 'outbound',
            recipientAddress: recipient.email,
            recipientName: recipient.displayName || '',
            subject: resolved.subject,
            bodyPreview: String(resolved.bodyText || resolved.bodyHtml || '').slice(0, 500),
            status: 'sent',
            campaignId: campaign._id,
            templateId: resolved.templateId || null,
            sentAt: new Date(),
        });
        return true;
    } catch (err) {
        recipient.status = 'failed';
        recipient.errorMessage = err?.message || 'Send failed';
        recipient.attemptCount += 1;
        campaign.failedCount += 1;
        await recordCommunication(campaign.companyId, {
            channel: 'email',
            direction: 'outbound',
            recipientAddress: recipient.email,
            recipientName: recipient.displayName || '',
            subject: resolved.subject,
            bodyPreview: String(resolved.bodyText || resolved.bodyHtml || '').slice(0, 500),
            status: 'failed',
            campaignId: campaign._id,
            templateId: resolved.templateId || null,
            errorMessage: recipient.errorMessage,
            sentAt: new Date(),
        });
        return false;
    } finally {
        await recipient.save();
    }
}

async function processCampaign(campaign) {
    const settings = await getSettings(campaign.companyId);
    if (!settings.enabled) return;

    if (!isWithinSendWindow(campaign, settings)) return;

    await resetDailyCounterIfNeeded(campaign);
    const dailyLimit = campaign.dailyLimit || settings.dailyLimit || 200;
    if (campaign.dailySentToday >= dailyLimit) return;

    if (campaign.status === 'Scheduled' && campaign.scheduledStartAt && new Date(campaign.scheduledStartAt) > new Date()) {
        return;
    }

    if (['Scheduled', 'Pending'].includes(campaign.status)) {
        campaign.status = 'Sending';
        campaign.startedAt = campaign.startedAt || new Date();
        await campaign.save();
        await logAudit(campaign.companyId, 'campaign_sending_started', { campaignId: campaign._id });
    }

    if (campaign.status !== 'Sending') return;

    let smtpSettings;
    try {
        smtpSettings = await getSmtpSettings(campaign.companyId);
    } catch (err) {
        campaign.status = 'Failed';
        await campaign.save();
        await logAudit(campaign.companyId, 'campaign_failed', {
            campaignId: campaign._id,
            details: { error: err?.message || 'SMTP not configured' },
        });
        return;
    }

    const resolved = await resolveMessage(campaign.toObject ? campaign.toObject() : campaign, campaign.companyId);
    const batchSize = campaign.batchSize || settings.defaultBatchSize || 20;
    const remainingDaily = dailyLimit - campaign.dailySentToday;
    const take = Math.min(batchSize, remainingDaily);

    const recipients = await EmailCampaignRecipient.find({
        companyId: campaign.companyId,
        campaignId: campaign._id,
        status: 'pending',
    })
        .sort({ createdAt: 1 })
        .limit(take);

    if (!recipients.length) {
        const pending = await EmailCampaignRecipient.countDocuments({
            companyId: campaign.companyId,
            campaignId: campaign._id,
            status: 'pending',
        });
        if (pending === 0) {
            campaign.status = 'Completed';
            campaign.completedAt = new Date();
            await campaign.save();
            await logAudit(campaign.companyId, 'campaign_completed', { campaignId: campaign._id });
        }
        return;
    }

    const isFast = campaign.sendMode === 'FAST' && settings.enableFastMode;
    const minDelay = isFast ? 300 : (settings.safeDelayMinMs || 5000);
    const maxDelay = isFast ? 1000 : (settings.safeDelayMaxMs || 12000);
    const pauseAfter = settings.pauseAfterMessages || 20;
    const pauseMs = settings.pauseDurationMs || 60000;

    for (const recipient of recipients) {
        if (campaign.status === 'Paused' || campaign.status === 'Stopped') break;

        await sendOneRecipient(campaign, recipient, smtpSettings, resolved);
        campaign.dailySentToday += 1;
        campaign.lastProcessedAt = new Date();
        messagesSincePause += 1;
        await campaign.save();

        if (messagesSincePause >= pauseAfter && !isFast) {
            messagesSincePause = 0;
            await wait(pauseMs);
        } else {
            await wait(randomDelay(minDelay, maxDelay));
        }

        if (campaign.dailySentToday >= dailyLimit) break;
    }
}

export async function processQueue() {
    if (processing) return;
    processing = true;
    try {
        const campaigns = await EmailCampaign.find({
            status: { $in: ['Scheduled', 'Pending', 'Sending'] },
        }).sort({ scheduledStartAt: 1, updatedAt: 1 });

        for (const campaign of campaigns) {
            try {
                await processCampaign(campaign);
            } catch (err) {
                campaign.status = 'Failed';
                await campaign.save();
                await logAudit(campaign.companyId, 'campaign_failed', {
                    campaignId: campaign._id,
                    details: { error: err?.message },
                });
            }
        }
    } finally {
        processing = false;
    }
}

export async function getActiveCampaignStatus(companyId) {
    const active = await EmailCampaign.findOne({
        companyId,
        status: { $in: ['Scheduled', 'Pending', 'Sending', 'Paused'] },
    }).lean();
    return active || null;
}
