/**
 * Local mobile normalizer for WhatsApp AI (mirrors bulk utility logic).
 * Kept inside the module to avoid importing live WhatsApp / bulk services.
 */
export function normalizeWhatsAppAiMobile(raw, defaultCountryCode = '91') {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10) return `${defaultCountryCode}${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    if (digits.length >= 11 && digits.length <= 15) return digits;
    return null;
}
