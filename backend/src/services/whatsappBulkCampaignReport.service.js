/**
 * Campaign performance report for WhatsApp Bulk (metadata only; no auth/session IDs).
 */
import WhatsAppBulkCampaign from '../models/whatsappBulkCampaign.model.js';
import WhatsAppBulkCampaignRecipient from '../models/whatsappBulkCampaignRecipient.model.js';
import { assertModuleEnabled, getSettings } from './whatsappBulkSettings.service.js';
import { POSSIBLE_BLOCK_WARNING } from './whatsappBulkDeliveryRisk.util.js';
import { ApiError } from '../utils/ApiError.js';

function pct(part, whole) {
  const w = Number(whole) || 0;
  if (!w) return 0;
  return Math.round((Number(part) || 0) * 1000 / w) / 10;
}

export async function buildCampaignPerformanceReport(companyId, campaignId) {
  await assertModuleEnabled(companyId);
  const campaign = await WhatsAppBulkCampaign.findOne({ _id: campaignId, companyId }).lean();
  if (!campaign) throw new ApiError(404, 'Campaign not found');
  const settings = await getSettings(companyId);
  const recipients = await WhatsAppBulkCampaignRecipient.find({ companyId, campaignId }).lean();

  const byStatus = recipients.reduce((acc, r) => {
    const s = r.status || 'unknown';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const sent = byStatus.sent || 0;
  const failed = byStatus.failed || 0;
  const pending = byStatus.pending || 0;
  const skipped = (byStatus.skipped || 0) + (byStatus.blacklisted || 0);
  const total = recipients.length;

  const started = campaign.startedAt ? new Date(campaign.startedAt).getTime() : null;
  const completed = campaign.completedAt ? new Date(campaign.completedAt).getTime() : null;
  const durationMs = started && completed ? Math.max(0, completed - started) : null;

  return {
    campaign: {
      name: campaign.campaignName,
      status: campaign.status,
      sendMode: campaign.sendMode,
      dailyLimit: campaign.dailyLimit || settings.dailyLimit,
    },
    recipientPreparation: {
      imported: total,
      valid: total - (byStatus.blacklisted || 0),
      blacklisted: byStatus.blacklisted || 0,
      skipped,
      eligiblePending: pending,
    },
    queueAndSending: {
      pending,
      queued: pending,
      processing: campaign.status === 'Sending' ? pending : 0,
      sent,
      delivered: sent,
      read: 0,
      replied: 0,
      failed,
      skipped,
      cancelled: campaign.status === 'Stopped' ? pending : 0,
      unknown: byStatus.unknown || 0,
    },
    engagement: {
      interested: 0,
      quotationRequested: 0,
      notInterested: 0,
      optedOut: byStatus.blacklisted || 0,
      noResponse: sent,
    },
    safetyAndPerformance: {
      dailyLimit: campaign.dailyLimit || settings.dailyLimit,
      totalCampaignDurationMs: durationMs,
      averageDelayMs: settings.safeDelayMinMs && settings.safeDelayMaxMs
        ? Math.round((Number(settings.safeDelayMinMs) + Number(settings.safeDelayMaxMs)) / 2)
        : null,
      shortestDelayMs: settings.safeDelayMinMs || null,
      longestDelayMs: settings.safeDelayMaxMs || null,
      failurePercentage: pct(failed, sent + failed),
      deliveryPercentage: pct(sent, total),
      readPercentage: 0,
      replyPercentage: 0,
      optOutPercentage: pct(byStatus.blacklisted || 0, total),
      possibleRiskCount: 0,
      sessionDisconnectCount: 0,
      autoStopCount: campaign.status === 'Stopped' ? 1 : 0,
      autoStopReason: campaign.status === 'Stopped' ? 'manual_or_limit' : null,
    },
    warning: POSSIBLE_BLOCK_WARNING,
    note: 'Delivered/read/replied use only events available from Bulk recipient status. Chat history is unchanged. Blocking cannot be confirmed.',
  };
}
