/**
 * IntentClassifier interface — deterministic implementation for Phase 1B-2.
 * Replaceable later with provider adapters without changing orchestration.
 */

import { WHATSAPP_AI_INTENT_TYPES } from '../constants/whatsappAi.constants.js';

function detectLanguage(text = '') {
    const s = String(text || '');
    if (/[\u0A80-\u0AFF]/.test(s)) return 'gu';
    if (/[\u0900-\u097F]/.test(s)) return 'hi';
    return 'en';
}

function classifyDeterministic(text = '') {
    const raw = String(text || '').trim();
    const lower = raw.toLowerCase();
    const detectedLanguage = detectLanguage(raw);

    if (!raw) {
        return {
            intent: 'unknown',
            confidence: 1,
            intentReason: 'Empty message text.',
            detectedLanguage,
        };
    }

    if (/^(hi|hello|hey|namaste|namaskar|good\s+(morning|afternoon|evening))\b/i.test(raw)
        || /^(જય|નમસ્તે|નમસ્કાર)/.test(raw)
        || /^(नमस्ते|नमस्कार)/.test(raw)) {
        return {
            intent: 'greeting',
            confidence: 1,
            intentReason: 'Detected greeting because message starts with a common greeting word.',
            detectedLanguage,
        };
    }

    if (/\b(price|rate|cost|quote|quotation|pricing|₹|rs\.?)\b/i.test(lower)
        || /કિંમત|ભાવ|રેટ/.test(raw)
        || /कीमत|भाव|रेट/.test(raw)) {
        return {
            intent: 'price_enquiry',
            confidence: 1,
            intentReason: 'Detected price enquiry from pricing-related keywords.',
            detectedLanguage,
        };
    }

    if (/\b(order|dispatch|delivery|tracking|shipment|status)\b/i.test(lower)
        || /ઓર્ડર|ડિલિવરી|સ્ટેટસ/.test(raw)
        || /ऑर्डर|डिलीवरी|स्थिति/.test(raw)) {
        return {
            intent: 'order_status',
            confidence: 1,
            intentReason: 'Detected order-status enquiry from logistics keywords.',
            detectedLanguage,
        };
    }

    if (/\b(support|help|issue|problem|complaint|warranty|repair|fault)\b/i.test(lower)
        || /મદદ|સમસ્યા|ફરિયાદ/.test(raw)
        || /मदद|समस्या|शिकायत/.test(raw)) {
        return {
            intent: 'support_request',
            confidence: 1,
            intentReason: 'Detected support request from help/issue keywords.',
            detectedLanguage,
        };
    }

    if (/\b(product|catalogue|catalog|model|dali|driver|led|panel|specification|spec)\b/i.test(lower)
        || /પ્રોડક્ટ|મોડલ|ડ્રાઈવર/.test(raw)
        || /उत्पाद|मॉडल|ड्राइवर/.test(raw)
        || /need information|enquiry|inquiry|interested in/i.test(lower)) {
        return {
            intent: 'product_enquiry',
            confidence: 1,
            intentReason: 'Detected product enquiry from product/requirement keywords.',
            detectedLanguage,
        };
    }

    return {
        intent: 'unknown',
        confidence: 1,
        intentReason: 'No strong keyword match; classified as unknown.',
        detectedLanguage,
    };
}

/** @returns {{ classify: (text: string) => object }} */
export function createIntentClassifier() {
    return {
        classify(text) {
            const result = classifyDeterministic(text);
            if (!WHATSAPP_AI_INTENT_TYPES.includes(result.intent)) {
                result.intent = 'unknown';
            }
            return result;
        },
    };
}

export default createIntentClassifier;
