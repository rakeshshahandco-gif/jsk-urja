/**
 * Phase 1C.0 — Intent detector using expanded brain taxonomy (keyword/heuristic).
 * Does not replace Phase 1B intentClassifier used by generateTestDraft.
 */

import { WHATSAPP_AI_BRAIN_INTENT_TYPES, isBrainIntent } from './intentTaxonomy.js';

function detectLanguage(text = '') {
    const s = String(text || '');
    if (/[\u0A80-\u0AFF]/.test(s)) return 'gu';
    if (/[\u0900-\u097F]/.test(s)) return 'hi';
    return 'en';
}

function classifyBrainIntent(text = '') {
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
            intent: 'general_greeting',
            confidence: 0.95,
            intentReason: 'Greeting pattern matched.',
            detectedLanguage,
        };
    }

    if (/\b(dealer|dealership|authorised\s+dealer|authorized\s+dealer)\b/i.test(lower)
        || /ડીલર|डीलर/.test(raw)) {
        return {
            intent: 'dealer_enquiry',
            confidence: 0.9,
            intentReason: 'Dealer keywords matched.',
            detectedLanguage,
        };
    }

    if (/\b(distributor|distribution\s+partner)\b/i.test(lower)
        || /ડિસ્ટ્રિબ્યુટર|डिस्ट्रीब्यूटर/.test(raw)) {
        return {
            intent: 'distributor_enquiry',
            confidence: 0.9,
            intentReason: 'Distributor keywords matched.',
            detectedLanguage,
        };
    }

    if (/\b(sample|demo\s+unit)\b/i.test(lower) || /સેમ્પલ|सैंपल/.test(raw)) {
        return {
            intent: 'sample_request',
            confidence: 0.88,
            intentReason: 'Sample request keywords matched.',
            detectedLanguage,
        };
    }

    if (/\b(warranty|guarantee|warrantee)\b/i.test(lower) || /વોરંટી|वारंटी/.test(raw)) {
        return {
            intent: 'warranty',
            confidence: 0.88,
            intentReason: 'Warranty keywords matched.',
            detectedLanguage,
        };
    }

    if (/\b(complaint|escalate|angry|refund)\b/i.test(lower)
        || /ફરિયાદ|शिकायत/.test(raw)) {
        return {
            intent: 'complaint',
            confidence: 0.85,
            intentReason: 'Complaint keywords matched.',
            detectedLanguage,
        };
    }

    if (/\b(quotation|quote\s+request|proforma|pi\b)\b/i.test(lower)
        || /કોટેશન|कोटेशन/.test(raw)) {
        return {
            intent: 'quotation_request',
            confidence: 0.9,
            intentReason: 'Quotation request keywords matched.',
            detectedLanguage,
        };
    }

    if (/\b(price|rate|cost|pricing|₹|rs\.? )\b/i.test(lower)
        || /કિંમત|ભાવ|कीमत|भाव/.test(raw)) {
        return {
            intent: 'price_enquiry',
            confidence: 0.9,
            intentReason: 'Price enquiry keywords matched.',
            detectedLanguage,
        };
    }

    if (/\b(stock|availability|available|ready\s+stock|in\s+stock)\b/i.test(lower)
        || /ઉપલબ્ધ|उपलब्ध/.test(raw)) {
        return {
            intent: 'availability_enquiry',
            confidence: 0.88,
            intentReason: 'Availability keywords matched.',
            detectedLanguage,
        };
    }

    if (/\b(order|dispatch|delivery|tracking|shipment|status)\b/i.test(lower)
        || /ઓર્ડર|ડિલિવરી|ऑर्डर|डिलीवरी/.test(raw)) {
        return {
            intent: 'order_status',
            confidence: 0.88,
            intentReason: 'Order status keywords matched.',
            detectedLanguage,
        };
    }

    if (/\b(dt6|dt8|dali|ble\s*mesh|zigbee|technical|wiring|dimming|spec)\b/i.test(lower)
        || /\b(support|help|issue|problem|fault|repair)\b/i.test(lower)
        || /મદદ|સમસ્યા|मदद|समस्या/.test(raw)) {
        return {
            intent: 'technical_support',
            confidence: 0.82,
            intentReason: 'Technical/support keywords matched.',
            detectedLanguage,
        };
    }

    if (/\b(product|catalogue|catalog|model|driver|led|panel|switch|controller)\b/i.test(lower)
        || /need information|enquiry|inquiry|interested in/i.test(lower)
        || /પ્રોડક્ટ|મોડલ|उत्पाद|मॉडल/.test(raw)) {
        return {
            intent: 'product_enquiry',
            confidence: 0.85,
            intentReason: 'Product enquiry keywords matched.',
            detectedLanguage,
        };
    }

    return {
        intent: 'unknown',
        confidence: 0.5,
        intentReason: 'No strong keyword match.',
        detectedLanguage,
    };
}

/** @returns {{ detect: (text: string) => object, taxonomy: string[] }} */
export function createIntentDetector() {
    return {
        taxonomy: [...WHATSAPP_AI_BRAIN_INTENT_TYPES],
        detect(text) {
            const result = classifyBrainIntent(text);
            if (!isBrainIntent(result.intent)) {
                result.intent = 'unknown';
            }
            return result;
        },
    };
}

export default createIntentDetector;
