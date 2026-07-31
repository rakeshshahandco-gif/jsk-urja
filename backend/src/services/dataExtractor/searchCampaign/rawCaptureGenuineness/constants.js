/** Checkpoint 8 (Phase B) - genuineness verification constants (no paid AI required). */
export const RULE_ENGINE_VERSION = 'cp8-genuineness-rules-v1';
export const OLLAMA_SCHEMA_VERSION = 'cp8-genuineness-json-v1';

export const GENUINENESS_DECISIONS = Object.freeze([
    'verified_genuine',
    'likely_genuine',
    'human_review_required',
    'directory_or_marketplace_only',
    'suspected_unreliable',
    'rejected_unusable',
]);

/** Human-readable labels for owner-facing UI. */
export const OWNER_LABELS = Object.freeze({
    verified_genuine: 'Verified Genuine',
    likely_genuine: 'Likely Genuine',
    human_review_required: 'Human Review Required',
    directory_or_marketplace_only: 'Directory / Marketplace Only',
    suspected_unreliable: 'Suspected Unreliable',
    rejected_unusable: 'Rejected / Unusable',
});

export const MANUFACTURER_EVIDENCE = Object.freeze([
    'manufacturer_evidence_strong',
    'manufacturer_evidence_possible',
    'trader_or_distributor',
    'unsupported_manufacturer_claim',
    'unknown',
]);

export const GENUINENESS_JOB_STATUSES = Object.freeze([
    'queued',
    'processing',
    'completed',
    'partial',
    'failed',
    'stopped',
]);

export const VERIFICATION_STATUSES = Object.freeze([
    'queued',
    'processing',
    'verified',
    'review_required',
    'directory_only',
    'unreliable',
    'rejected',
    'failed',
    'stopped',
]);

export const OWNER_REVIEW_STATUSES = Object.freeze([
    'unreviewed',
    'approved',
    'rejected',
    'possible',
    'send_for_review',
]);

export const CONFIDENCE_LEVELS = Object.freeze(['low', 'medium', 'high']);

export const VERIFICATION_METHODS = Object.freeze(['rule_based', 'ollama_local', 'rule_based_fallback']);

export const MAX_CONCURRENCY = 3;

/** Qualification decisions eligible for genuineness verification. */
export const ELIGIBLE_QUALIFICATION_DECISIONS = Object.freeze([
    'strong_match',
    'possible_match',
    'human_review_required',
]);

/** Feature flag: optional local Ollama. Core path always works without it. */
export function isOllamaGenuinenessEnabled() {
    return String(process.env.CP8_OLLAMA_ENABLED || '').toLowerCase() === 'true'
        || String(process.env.DATA_EXTRACTOR_OLLAMA_VERIFY || '').toLowerCase() === 'true';
}

export function getOllamaConfig() {
    return {
        baseUrl: String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
        model: String(process.env.OLLAMA_VERIFY_MODEL || process.env.OLLAMA_MODEL || 'llama3.2').trim(),
        timeoutMs: Math.min(60000, Math.max(3000, Number(process.env.OLLAMA_VERIFY_TIMEOUT_MS || 12000))),
    };
}
