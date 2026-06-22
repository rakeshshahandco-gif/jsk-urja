import WhatsAppBulkCampaign from '../models/whatsappBulkCampaign.model.js';
import WhatsAppBulkCampaignRecipient from '../models/whatsappBulkCampaignRecipient.model.js';
import { getSettings } from './whatsappBulkSettings.service.js';
import { touchMatterUsage } from './whatsappBulkMatter.service.js';
import { logAudit } from './whatsappBulkAudit.service.js';
import {
    bulkSendDelay,
    dispatchBulkWhatsAppSend,
} from './whatsappBulkDispatch.service.js';
import {
    resolveCampaignAttachment,
} from './whatsappBulkAttachment.service.js';
import { syncCampaignSendStats } from './whatsappBulkRecipient.service.js';

let processing = false;
let messagesSincePause = 0;

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

async function resolveMessageBody(campaign) {
    if (campaign.matterId) {
        const WhatsAppBulkMatter = (await import('../models/whatsappBulkMatter.model.js')).default;
        const matter = await WhatsAppBulkMatter.findOne({ _id: campaign.matterId, companyId: campaign.companyId }).lean();
        if (matter) {
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

async function dispatchWhatsAppSend(mobile, resolved, campaign) {
    return dispatchBulkWhatsAppSend(mobile, resolved, { campaign });
}

async function sendOneRecipient(campaign, recipient, settings) {
    const resolved = await resolveMessageBody(campaign);
    try {
        const sendResult = await dispatchWhatsAppSend(recipient.mobile, resolved, campaign);
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
        if (campaign.matterId) await touchMatterUsage(campaign.companyId, campaign.matterId);
        return true;
    } catch (err) {
        recipient.status = 'failed';
        recipient.errorMessage = err?.message || 'Send failed';
        recipient.attemptCount += 1;
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
    const dailyLimit = campaign.dailyLimit || settings.dailyLimit || 100;
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

    const batchSize = campaign.batchSize || settings.defaultBatchSize || 25;
    const remainingDaily = dailyLimit - campaign.dailySentToday;
    const take = Math.min(batchSize, remainingDaily);

    const recipients = await WhatsAppBulkCampaignRecipient.find({
        companyId: campaign.companyId,
        campaignId: campaign._id,
        status: 'pending',
    })
        .sort({ createdAt: 1 })
        .limit(take);

    if (!recipients.length) {
        const pending = await WhatsAppBulkCampaignRecipient.countDocuments({
            companyId: campaign.companyId,
            campaignId: campaign._id,
            status: 'pending',
        });
        if (pending === 0) {
            const stats = await syncCampaignSendStats(campaign._id, campaign.companyId);
            campaign.sentCount = stats.sentCount;
            campaign.failedCount = stats.failedCount;
            campaign.status = 'Completed';
            campaign.completedAt = new Date();
            await campaign.save();
            await logAudit(campaign.companyId, 'campaign_completed', { campaignId: campaign._id });
        }
        return;
    }

    const isFast = campaign.sendMode === 'FAST' && settings.enableFastMode;
    const minDelay = isFast ? 500 : (settings.safeDelayMinMs || 8000);
    const maxDelay = isFast ? 1500 : (settings.safeDelayMaxMs || 15000);
    const pauseAfter = settings.pauseAfterMessages || 25;
    const pauseMs = settings.pauseDurationMs || 120000;

    for (const recipient of recipients) {
        if (campaign.status === 'Paused' || campaign.status === 'Stopped') break;

        await sendOneRecipient(campaign, recipient, settings);
        campaign.dailySentToday += 1;
        campaign.lastProcessedAt = new Date();
        messagesSincePause += 1;
        await campaign.save();

        if (messagesSincePause >= pauseAfter && !isFast) {
            messagesSincePause = 0;
            await bulkSendDelay(pauseMs);
        } else {
            await bulkSendDelay(randomDelay(minDelay, maxDelay));
        }

        if (campaign.dailySentToday >= dailyLimit) break;
    }

    const stats = await syncCampaignSendStats(campaign._id, campaign.companyId);
    campaign.sentCount = stats.sentCount;
    campaign.failedCount = stats.failedCount;
    await campaign.save();
}

export async function processQueue() {
    if (processing) return;
    processing = true;
    try {
        const campaigns = await WhatsAppBulkCampaign.find({
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
    const active = await WhatsAppBulkCampaign.findOne({
        companyId,
        status: { $in: ['Scheduled', 'Pending', 'Sending', 'Paused'] },
    }).lean();
    return active || null;
}
