/**
 * Customer Master GST consistency (Master Alteration / Customer save).
 * Blank GSTIN → registration type Consumer (exact Customer model enum).
 * Does not invent new enums or collections.
 */

const REGISTERED_AUTO_FROM = new Set(['', 'Unregistered', 'Consumer']);

/**
 * Mutates payload in place when gstNumber / gstRegistrationType are present.
 * @param {Record<string, unknown>} payload
 * @returns {Record<string, unknown>}
 */
export function applyBlankGstinConsumerRule(payload) {
    if (!payload || typeof payload !== 'object') return payload;

    const hasGstKey = Object.prototype.hasOwnProperty.call(payload, 'gstNumber');
    if (!hasGstKey) return payload;

    const gst = String(payload.gstNumber ?? '').trim().toUpperCase();
    payload.gstNumber = gst;

    if (!gst) {
        payload.gstRegistrationType = 'Consumer';
        return payload;
    }

    const type = String(payload.gstRegistrationType ?? '').trim();
    if (REGISTERED_AUTO_FROM.has(type)) {
        payload.gstRegistrationType = 'Registered';
    }
    return payload;
}

/**
 * Frontend / soft-required: GSTIN is never mandatory for Consumer / Unregistered.
 */
export function isGstinMandatoryForRegistrationType(registrationType) {
    const t = String(registrationType || '').trim();
    return t !== 'Consumer' && t !== 'Unregistered' && t !== '';
}
