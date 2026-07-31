import CommunicationHistory from '../../../models/communicationHistory.model.js';
import { normalizeEmail, normalizePhone } from './normalize.util.js';

/**
 * Read-only frequency / recent-contact checks against CommunicationHistory.
 * Does not invent history when unavailable.
 */
export async function checkFrequency({
    companyId,
    email,
    phone,
    campaignType,
    settings,
}) {
    const ne = normalizeEmail(email);
    const np = normalizePhone(phone);
    if (!ne && !np) {
        return { status: 'HISTORY_UNAVAILABLE', lastContactAt: null, count7d: 0, count30d: 0, reason: 'no_address' };
    }

    const or = [];
    if (ne) or.push({ recipientAddress: ne });
    if (np) or.push({ recipientAddress: np });

    let rows = [];
    try {
        rows = await CommunicationHistory.find({
            companyId,
            $or: or,
        }).select('sentAt channel campaignId recipientAddress').sort({ sentAt: -1 }).limit(50).lean();
    } catch {
        return { status: 'HISTORY_UNAVAILABLE', lastContactAt: null, count7d: 0, count30d: 0, reason: 'query_failed' };
    }

    if (!rows.length) {
        return {
            status: 'SAFE_TO_CONTACT',
            lastContactAt: null,
            count7d: 0,
            count30d: 0,
            reason: 'no_history',
            historyAvailable: true,
        };
    }

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const last = rows[0]?.sentAt ? new Date(rows[0].sentAt) : null;
    const count7d = rows.filter((r) => r.sentAt && (now - new Date(r.sentAt).getTime()) <= 7 * day).length;
    const count30d = rows.filter((r) => r.sentAt && (now - new Date(r.sentAt).getTime()) <= 30 * day).length;

    const minDays = Number(settings?.minimumDaysBetweenCampaigns) || 0;
    const sameCooldown = Number(settings?.sameCampaignCooldownDays) || 0;
    const max7 = Number(settings?.maximumCampaignsPer7Days) || 0;
    const max30 = Number(settings?.maximumCampaignsPer30Days) || 0;

    if (max7 > 0 && count7d >= max7) {
        return { status: 'FREQUENCY_LIMIT_REACHED', lastContactAt: last, count7d, count30d, reason: 'max_7d' };
    }
    if (max30 > 0 && count30d >= max30) {
        return { status: 'FREQUENCY_LIMIT_REACHED', lastContactAt: last, count7d, count30d, reason: 'max_30d' };
    }
    if (last && minDays > 0 && (now - last.getTime()) < minDays * day) {
        return { status: 'RECENTLY_CONTACTED', lastContactAt: last, count7d, count30d, reason: 'min_days' };
    }
    // Same campaign type cooldown uses campaignId metadata when present; otherwise HISTORY soft-signal only.
    if (last && sameCooldown > 0 && campaignType && (now - last.getTime()) < sameCooldown * day) {
        const sameType = rows.some((r) => String(r.campaignId || '').includes(String(campaignType)));
        if (sameType) {
            return { status: 'SAME_CAMPAIGN_RECENTLY_SENT', lastContactAt: last, count7d, count30d, reason: 'same_type_cooldown' };
        }
    }

    return { status: 'SAFE_TO_CONTACT', lastContactAt: last, count7d, count30d, reason: 'ok', historyAvailable: true };
}
