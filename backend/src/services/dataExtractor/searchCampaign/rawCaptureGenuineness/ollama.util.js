/**
 * Optional local Ollama genuineness verification. Never required.
 * On any failure/malformed JSON -> caller falls back to the rule engine.
 * Never writes to the database directly (caller persists the validated result).
 */
import {
    getOllamaConfig,
    isOllamaGenuinenessEnabled,
    OLLAMA_SCHEMA_VERSION,
    GENUINENESS_DECISIONS,
    CONFIDENCE_LEVELS,
    MANUFACTURER_EVIDENCE,
} from './constants.js';

const ALLOWED_DECISIONS = new Set(GENUINENESS_DECISIONS);
const ALLOWED_CONF = new Set(CONFIDENCE_LEVELS);
const ALLOWED_MANUFACTURER = new Set(MANUFACTURER_EVIDENCE);

function clampScore(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return null;
    return Math.max(0, Math.min(100, Math.round(x)));
}

function asStringArray(v, max = 30) {
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x || '').trim()).filter(Boolean).slice(0, max);
}

/**
 * Validate AI JSON against a strict schema. Returns null if invalid.
 */
export function validateOllamaGenuineness(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const genuinenessDecision = String(raw.genuinenessDecision || '');
    if (!ALLOWED_DECISIONS.has(genuinenessDecision)) return null;
    const genuinenessScore = clampScore(raw.genuinenessScore);
    if (genuinenessScore == null) return null;
    const genuinenessConfidence = String(raw.genuinenessConfidence || '');
    if (!ALLOWED_CONF.has(genuinenessConfidence)) return null;
    const verificationReason = String(raw.verificationReason || '').trim().slice(0, 2000);
    if (!verificationReason) return null;
    const manufacturerEvidence = String(raw.manufacturerEvidence || 'unknown');
    if (!ALLOWED_MANUFACTURER.has(manufacturerEvidence)) return null;

    return {
        genuinenessDecision,
        genuinenessScore,
        genuinenessConfidence,
        verificationReason,
        positiveSignals: asStringArray(raw.positiveSignals),
        warningSignals: asStringArray(raw.warningSignals),
        conflictingEvidence: asStringArray(raw.conflictingEvidence),
        missingCriticalFields: asStringArray(raw.missingCriticalFields),
        evidenceUrls: asStringArray(raw.evidenceUrls, 40),
        manufacturerEvidence,
        verificationMethod: 'ollama_local',
        aiModel: String(raw.aiModel || '').slice(0, 120),
        aiSchemaVersion: OLLAMA_SCHEMA_VERSION,
    };
}

function buildPrompt({ enrichment, qualification, rawCapture, productHint, ruleHint }) {
    const evidence = {
        productHint: productHint || '',
        companyName: enrichment?.companyName || '',
        websiteUrl: enrichment?.websiteUrl || '',
        isDirectorySource: Boolean(enrichment?.isDirectorySource),
        businessTypeHint: qualification?.businessType || enrichment?.businessType || '',
        phones: (enrichment?.phones || []).slice(0, 5).map((p) => ({ value: p.original, confidence: p.confidence })),
        emails: (enrichment?.emails || []).slice(0, 5).map((e) => e.value),
        addresses: (enrichment?.addresses || []).slice(0, 3).map((a) => a.raw),
        socials: {
            facebook: enrichment?.facebook?.url || '',
            instagram: enrichment?.instagram?.url || '',
            linkedin: enrichment?.linkedin?.url || '',
        },
        manufacturerEvidenceText: enrichment?.manufacturerEvidence || '',
        sourceEvidence: (enrichment?.sourceEvidence || []).slice(0, 15).map((e) => ({
            field: e.field, value: String(e.value || '').slice(0, 200), sourceUrl: e.sourceUrl,
        })),
        searchResultTitle: rawCapture?.title || '',
        searchResultSnippet: String(rawCapture?.snippet || '').slice(0, 400),
        qualificationDecision: qualification?.systemDecision || '',
        ruleHintDecision: ruleHint?.genuinenessDecision || '',
        ruleHintReason: ruleHint?.verificationReason || '',
    };

    return `You verify whether a B2B company appears to be a REAL, contactable, independently verifiable business (genuineness check), NOT whether it matches a product/industry. Use ONLY the JSON evidence below. Never invent contacts, websites, or claims. Absence of a social media profile is NOT evidence of being fake. A free email address alone is NOT evidence of being fake. Only call it a verified manufacturer if manufacturer evidence appears on the company's own website/source evidence, not only in a search-result title/snippet.

Evidence JSON:
${JSON.stringify(evidence)}

Respond with ONLY valid JSON (no markdown) matching:
{
  "genuinenessDecision": "verified_genuine|likely_genuine|human_review_required|directory_or_marketplace_only|suspected_unreliable|rejected_unusable",
  "genuinenessScore": 0-100,
  "genuinenessConfidence": "low|medium|high",
  "verificationReason": "string",
  "positiveSignals": ["string"],
  "warningSignals": ["string"],
  "conflictingEvidence": ["string"],
  "missingCriticalFields": ["string"],
  "evidenceUrls": ["string"],
  "manufacturerEvidence": "manufacturer_evidence_strong|manufacturer_evidence_possible|trader_or_distributor|unsupported_manufacturer_claim|unknown"
}`;
}

function extractJsonObject(text) {
    const s = String(text || '').trim();
    if (!s) return null;
    try {
        return JSON.parse(s);
    } catch {
        const start = s.indexOf('{');
        const end = s.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(s.slice(start, end + 1));
            } catch {
                return null;
            }
        }
        return null;
    }
}

/**
 * Attempt Ollama genuineness verification. Returns validated result or null.
 * Never persists anything itself.
 */
export async function tryOllamaVerifyGenuineness({ enrichment, qualification, rawCapture, productHint, ruleHint }) {
    if (!isOllamaGenuinenessEnabled()) return null;
    const cfg = getOllamaConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
        const prompt = buildPrompt({ enrichment, qualification, rawCapture, productHint, ruleHint });
        const res = await fetch(`${cfg.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                model: cfg.model,
                prompt,
                stream: false,
                format: 'json',
                options: { temperature: 0 },
            }),
        });
        if (!res.ok) return null;
        const body = await res.json();
        const parsed = extractJsonObject(body?.response);
        const validated = validateOllamaGenuineness(parsed);
        if (!validated) return null;
        validated.aiModel = cfg.model;
        return validated;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export { isOllamaGenuinenessEnabled, OLLAMA_SCHEMA_VERSION };
