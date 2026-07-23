/**
 * Phase 1C.0 — Expanded intent taxonomy for AI Brain.
 * Kept separate from WHATSAPP_AI_INTENT_TYPES (Phase 1B ReplyDraft enum)
 * so Phase 1B schema and behaviour stay unchanged.
 */

export const WHATSAPP_AI_BRAIN_INTENT_TYPES = Object.freeze([
    'product_enquiry',
    'quotation_request',
    'technical_support',
    'complaint',
    'warranty',
    'sample_request',
    'dealer_enquiry',
    'distributor_enquiry',
    'price_enquiry',
    'availability_enquiry',
    'general_greeting',
    'order_status',
    'unknown',
]);

/** Map Phase 1B legacy intents to brain taxonomy. */
export function mapLegacyIntentToBrain(legacyIntent) {
    const map = {
        greeting: 'general_greeting',
        product_enquiry: 'product_enquiry',
        price_enquiry: 'price_enquiry',
        support_request: 'technical_support',
        order_status: 'order_status',
        unknown: 'unknown',
    };
    return map[legacyIntent] || 'unknown';
}

export function isBrainIntent(intent) {
    return WHATSAPP_AI_BRAIN_INTENT_TYPES.includes(intent);
}
