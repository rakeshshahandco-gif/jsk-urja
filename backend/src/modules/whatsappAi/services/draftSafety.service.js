/**
 * Draft safety validation — Phase 1B-2.
 */

import { WHATSAPP_AI_DRAFT_TEXT_MAX, WHATSAPP_AI_FORBIDDEN_SETTINGS_KEYS } from '../constants/whatsappAi.constants.js';

const UNSAFE_PROMISE = /\b(guaranteed|gst\s*payable|tax\s*refund|free\s*delivery|dispatch\s*today|in\s*stock|warranty\s*claim\s*approved|payment\s*link|bank\s*transfer|upi\s*id)\b/i;
const HTML_OR_SCRIPT = /<\s*\/?\s*(script|iframe|object|embed|img|a|div|span|style)\b|javascript:|on\w+\s*=/i;
const URL_RE = /https?:\/\/|www\./i;
const SECRETISH = /\b(api[_-]?key|secret|password|token|bearer|mongodb(\+srv)?:\/\/)\b/i;

export function validateDraftText(draftText) {
    const reasons = [];
    const text = String(draftText ?? '');

    if (!text.trim()) {
        reasons.push('Draft text is empty');
    }
    if (text.length > WHATSAPP_AI_DRAFT_TEXT_MAX) {
        reasons.push(`Draft exceeds max length ${WHATSAPP_AI_DRAFT_TEXT_MAX}`);
    }
    if (HTML_OR_SCRIPT.test(text)) {
        reasons.push('HTML/script content is not allowed');
    }
    if (URL_RE.test(text)) {
        reasons.push('URLs are not permitted in Phase 1B-2 drafts');
    }
    if (SECRETISH.test(text)) {
        reasons.push('Secret-shaped content is not allowed');
    }
    if (UNSAFE_PROMISE.test(text)) {
        reasons.push('Unsupported commercial/financial/legal promise language');
    }
    // Reject if draft looks like it embeds system prompt leakage.
    if (/\b(system prompt|you are an ai|ignore previous instructions)\b/i.test(text)) {
        reasons.push('System-prompt style content is not allowed');
    }
    // Compact ObjectId dumps are discouraged in customer-facing drafts.
    if (/\b[a-f0-9]{24}\b/i.test(text)) {
        reasons.push('Database identifiers are not allowed in draft text');
    }

    for (const key of WHATSAPP_AI_FORBIDDEN_SETTINGS_KEYS) {
        if (new RegExp(`\\b${key}\\b`, 'i').test(text)) {
            reasons.push(`Forbidden field name referenced: ${key}`);
            break;
        }
    }

    if (reasons.length) {
        return { ok: false, code: 'safety_rejected', reasons };
    }
    return { ok: true, code: '', reasons: [] };
}

export default { validateDraftText };
