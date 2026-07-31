/** Checkpoint 7 — qualification constants (no paid AI required). */
export const RULE_ENGINE_VERSION = 'cp7-home-automation-rules-v2-strict-location';
export const OLLAMA_SCHEMA_VERSION = 'cp7-qualification-json-v1';

export const QUALIFICATION_DECISIONS = Object.freeze([
    'strong_match',
    'possible_match',
    'rejected',
    'human_review_required',
]);

export const QUALIFICATION_STATUSES = Object.freeze([
    'queued',
    'processing',
    'qualified',
    'possible',
    'rejected',
    'review_required',
    'failed',
    'stopped',
]);

export const QUALIFICATION_JOB_STATUSES = Object.freeze([
    'queued',
    'processing',
    'completed',
    'partial',
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

export const BUSINESS_TYPES = Object.freeze([
    'manufacturer',
    'oem_odm',
    'brand_owner',
    'importer',
    'distributor',
    'dealer',
    'supplier',
    'system_integrator',
    'service_provider',
    'directory_marketplace',
    'unknown',
]);

export const MAX_CONCURRENCY = 3;

/** Feature flag: optional local Ollama. Core path always works without it. */
export function isOllamaQualificationEnabled() {
    return String(process.env.CP7_OLLAMA_ENABLED || '').toLowerCase() === 'true'
        || String(process.env.DATA_EXTRACTOR_OLLAMA_QUALIFY || '').toLowerCase() === 'true';
}

export function getOllamaConfig() {
    return {
        baseUrl: String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
        model: String(process.env.OLLAMA_QUALIFY_MODEL || process.env.OLLAMA_MODEL || 'llama3.2').trim(),
        timeoutMs: Math.min(60000, Math.max(3000, Number(process.env.OLLAMA_QUALIFY_TIMEOUT_MS || 12000))),
    };
}