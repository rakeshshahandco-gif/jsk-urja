import EmailBlacklist from '../../../models/emailBlacklist.model.js';
import WhatsAppBulkBlacklist from '../../../models/whatsappBulkBlacklist.model.js';
import { normalizeEmail, normalizePhone } from './normalize.util.js';

/**
 * Read-only adapters over existing EmailBlacklist / WhatsAppBulkBlacklist.
 * Does not write or create a second blacklist system.
 */
export async function getEmailBlacklistSet(companyId) {
    const rows = await EmailBlacklist.find({ companyId, isActive: true }).select('email').lean();
    return new Set(rows.map((r) => normalizeEmail(r.email)).filter(Boolean));
}

export async function getWhatsAppBlacklistSet(companyId) {
    const rows = await WhatsAppBulkBlacklist.find({ companyId, isActive: true }).select('mobile').lean();
    return new Set(rows.map((r) => normalizePhone(r.mobile)).filter(Boolean));
}

export function checkOptOut({
    email,
    phone,
    channelDraftType,
    emailBlacklist,
    whatsappBlacklist,
}) {
    const ne = normalizeEmail(email);
    const np = normalizePhone(phone);
    const emailHit = ne && emailBlacklist?.has(ne);
    const phoneHit = np && whatsappBlacklist?.has(np);
    const channel = String(channelDraftType || '');

    if (emailHit && phoneHit) {
        return { status: 'OPTED_OUT', channel: 'GLOBAL', emailHit: true, phoneHit: true };
    }
    if (emailHit && (channel.includes('EMAIL') || channel === 'EXPORT_ONLY' || channel === 'EMAIL_AND_WHATSAPP_DRAFT')) {
        return { status: 'OPTED_OUT', channel: 'EMAIL', emailHit: true, phoneHit: false };
    }
    if (phoneHit && (channel.includes('WHATSAPP') || channel === 'EMAIL_AND_WHATSAPP_DRAFT')) {
        return { status: 'OPTED_OUT', channel: 'WHATSAPP', emailHit: false, phoneHit: true };
    }
    if (emailHit || phoneHit) {
        return { status: 'BLACKLISTED', channel: emailHit ? 'EMAIL' : 'WHATSAPP', emailHit: !!emailHit, phoneHit: !!phoneHit };
    }
    return { status: 'CLEAR', channel: null, emailHit: false, phoneHit: false };
}
