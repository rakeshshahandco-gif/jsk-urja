import {
    isGenericEmail, isValidEmail, isValidPhone, normalizeEmail, normalizePhone,
} from './normalize.util.js';
import { checkOptOut } from './optout.adapter.js';

/**
 * Determine channel eligibility for a selected contact.
 */
export function evaluateRecipientEligibility({
    selected,
    channelDraftType,
    settings,
    optOutResult,
    frequencyResult,
    entityStatus,
    contactApproved,
    lowConfidence,
    outdated,
}) {
    if (entityStatus === 'rejected' || entityStatus === 'REJECTED') {
        return { status: 'REJECTED_LEAD', included: false, exclusionReason: 'rejected_entity', channels: [] };
    }
    if (entityStatus === 'blocked' || entityStatus === 'BLOCKED') {
        return { status: 'BLOCKED_ENTITY', included: false, exclusionReason: 'blocked_entity', channels: [] };
    }
    if (outdated) {
        return { status: 'OUTDATED_DATA', included: false, exclusionReason: 'outdated_data', channels: [] };
    }
    if (!selected) {
        return { status: 'NO_APPROVED_CONTACT', included: false, exclusionReason: 'no_contact', channels: [] };
    }
    if (contactApproved === false) {
        return { status: 'MANUAL_REVIEW_REQUIRED', included: false, exclusionReason: 'unapproved_contact_intelligence', channels: [] };
    }
    if (lowConfidence) {
        return { status: 'LOW_CONFIDENCE', included: false, exclusionReason: 'low_confidence', channels: [] };
    }

    if (optOutResult?.status === 'OPTED_OUT' || optOutResult?.status === 'BLACKLISTED') {
        return {
            status: optOutResult.status,
            included: false,
            exclusionReason: `optout_${optOutResult.channel || 'unknown'}`,
            channels: [],
        };
    }

    if (frequencyResult?.status === 'RECENTLY_CONTACTED'
        || frequencyResult?.status === 'SAME_CAMPAIGN_RECENTLY_SENT'
        || frequencyResult?.status === 'FREQUENCY_LIMIT_REACHED') {
        return {
            status: frequencyResult.status === 'FREQUENCY_LIMIT_REACHED' ? 'CAMPAIGN_FREQUENCY_LIMIT' : frequencyResult.status,
            included: false,
            exclusionReason: frequencyResult.reason || frequencyResult.status,
            channels: [],
        };
    }

    const email = normalizeEmail(selected.email);
    const phone = normalizePhone(selected.phone);
    const channel = String(channelDraftType || 'EXPORT_ONLY');
    const wantEmail = channel.includes('EMAIL') || channel === 'EXPORT_ONLY' || channel === 'EMAIL_AND_WHATSAPP_DRAFT';
    const wantWa = channel.includes('WHATSAPP') || channel === 'EMAIL_AND_WHATSAPP_DRAFT';
    const wantManual = channel === 'MANUAL_CALL_LIST' || channel === 'MANUAL_REVIEW_ONLY';

    const emailOk = email && isValidEmail(email);
    const phoneOk = phone && isValidPhone(phone);

    if (wantEmail && email && !emailOk) {
        return { status: 'INVALID_EMAIL', included: false, exclusionReason: 'invalid_email', channels: [] };
    }
    if (wantWa && !phoneOk && channel === 'WHATSAPP_DRAFT') {
        return { status: 'INVALID_PHONE', included: false, exclusionReason: 'missing_or_invalid_phone', channels: [] };
    }

    if (settings.requireVerifiedEmail && wantEmail && emailOk && selected.emailVerified !== true) {
        if (settings.allowUnverifiedManualReview) {
            return { status: 'UNVERIFIED_CONTACT', included: false, exclusionReason: 'unverified_email', channels: [] };
        }
        return { status: 'UNVERIFIED_CONTACT', included: false, exclusionReason: 'unverified_email', channels: [] };
    }
    if (settings.requireVerifiedPhone && wantWa && phoneOk && selected.phoneVerified !== true && channel === 'WHATSAPP_DRAFT') {
        return { status: 'UNVERIFIED_CONTACT', included: false, exclusionReason: 'unverified_phone', channels: [] };
    }

    if (isGenericEmail(email) && !settings.allowGenericContacts && wantEmail) {
        return { status: 'MANUAL_REVIEW_REQUIRED', included: false, exclusionReason: 'generic_email_disallowed', channels: [] };
    }

    const channels = [];
    if (emailOk && (wantEmail || wantManual)) channels.push('EMAIL');
    if (phoneOk && (wantWa || wantManual)) channels.push('WHATSAPP');
    if (wantManual && (emailOk || phoneOk)) channels.push('MANUAL');

    if (!channels.length) {
        return { status: 'NO_APPROVED_CONTACT', included: false, exclusionReason: 'no_channel', channels: [] };
    }

    let status = 'ELIGIBLE';
    if (channels.includes('EMAIL') && !channels.includes('WHATSAPP') && wantWa && wantEmail) status = 'ELIGIBLE_EMAIL_ONLY';
    if (channels.includes('WHATSAPP') && !channels.includes('EMAIL') && wantWa && wantEmail) status = 'ELIGIBLE_WHATSAPP_ONLY';
    if (wantManual && !wantEmail && !wantWa) status = 'ELIGIBLE_MANUAL_ONLY';

    return { status, included: true, exclusionReason: '', channels };
}

export { checkOptOut };
