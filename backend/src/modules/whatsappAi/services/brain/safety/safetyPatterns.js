/**
 * Phase 1C.5 — Safety detection patterns (deterministic).
 */

export const SAFETY_ENGINE_VERSION = 'safety_budget_v1';

export const COMMERCIAL_PATTERNS = Object.freeze([
    { id: 'price_promise', re: /\b(price\s+is|costs?\s+only|we\s+offer\s+(at\s+)?₹|rs\.?\s*\d|INR\s*\d|\$\s*\d)/i, risk: 'high' },
    { id: 'stock_promise', re: /\b(in\s+stock|available\s+now|ready\s+to\s+ship\s+\d+|we\s+have\s+\d+\s+units)/i, risk: 'high' },
    { id: 'delivery_promise', re: /\b(deliver(y|ed)?\s+(by|within|tomorrow)|dispatch\s+(today|tomorrow|within)|shipping\s+in\s+\d+)/i, risk: 'high' },
    { id: 'warranty_claim', re: /\b(lifetime\s+warranty|warranty\s+of\s+\d+\s+years?|we\s+guarantee\s+\d+\s+year)/i, risk: 'high' },
    { id: 'discount', re: /\b(\d+\s*%\s*off|special\s+discount|flat\s+\d+\s*%|best\s+price\s+guarantee)/i, risk: 'medium' },
    { id: 'commercial_commitment', re: /\b(we\s+confirm\s+the\s+order|order\s+is\s+confirmed|contractually\s+bound)/i, risk: 'high' },
    { id: 'payment_terms', re: /\b(net\s+\d+|advance\s+\d+\s*%|pay\s+now\s+to\s+confirm|upi\s+id\s*[:=])/i, risk: 'medium' },
]);

export const CONFIDENTIAL_PATTERNS = Object.freeze([
    { id: 'margin_disclosure', re: /\b(margin\s*[:=]\s*\d|our\s+cost\s+is|supplier\s+price|landed\s+cost)/i, risk: 'high' },
    { id: 'secret_leak', re: /\b(api[_-]?key|sk-[a-z0-9]{8,}|bearer\s+[a-z0-9]|password\s*[:=])/i, risk: 'critical' },
    { id: 'internal_notes', re: /\b(internal\s+note|do\s+not\s+share|confidential\s+to\s+staff)/i, risk: 'high' },
]);

export const INJECTION_PATTERNS = Object.freeze([
    { id: 'ignore_instructions', re: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i },
    { id: 'reveal_prompt', re: /reveal\s+(your\s+)?(system\s+)?prompt/i },
    { id: 'dan_jailbreak', re: /you\s+are\s+now\s+dan/i },
    { id: 'exfiltrate', re: /exfiltrate|dump\s+(the\s+)?(system|hidden)\s+prompt/i },
]);

export const UNSAFE_CONTENT_PATTERNS = Object.freeze([
    { id: 'unsafe_url', re: /https?:\/\/(?!(?:www\.)?(?:jsk|jszurja|localhost)[^\s]*)[^\s]+/i },
    { id: 'script_content', re: /<script[\s>]|javascript:\s*|onerror\s*=/i },
]);

export default {
    SAFETY_ENGINE_VERSION,
    COMMERCIAL_PATTERNS,
    CONFIDENTIAL_PATTERNS,
    INJECTION_PATTERNS,
    UNSAFE_CONTENT_PATTERNS,
};
