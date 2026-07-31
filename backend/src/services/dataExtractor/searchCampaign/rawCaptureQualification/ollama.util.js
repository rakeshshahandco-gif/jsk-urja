/**
 * Optional local Ollama qualification. Never required.
 * On any failure/malformed JSON -> caller falls back to rule engine.
 */
import {
    getOllamaConfig,
    isOllamaQualificationEnabled,
    OLLAMA_SCHEMA_VERSION,
    QUALIFICATION_DECISIONS,
    CONFIDENCE_LEVELS,
    BUSINESS_TYPES,
} from './constants.js';

const ALLOWED_DECISIONS = new Set(QUALIFICATION_DECISIONS);
const ALLOWED_CONF = new Set(CONFIDENCE_LEVELS);
const ALLOWED_BT = new Set(BUSINESS_TYPES);

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
 * Validate AI JSON against strict schema. Returns null if invalid.
 */
export function validateOllamaQualification(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const systemDecision = String(raw.systemDecision || '');
    if (!ALLOWED_DECISIONS.has(systemDecision)) return null;
    const relevanceScore = clampScore(raw.relevanceScore);
    if (relevanceScore == null) return null;
    const confidence = String(raw.confidence || '');
    if (!ALLOWED_CONF.has(confidence)) return null;
    const decisionReason = String(raw.decisionReason || '').trim().slice(0, 2000);
    if (!decisionReason) return null;
    const businessType = String(raw.businessType || 'unknown');
    if (!ALLOWED_BT.has(businessType)) return null;
    const locationMatch = String(raw.locationMatch || 'unknown');
    if (!['match', 'partial', 'mismatch', 'unknown'].includes(locationMatch)) return null;

    return {
        systemDecision,
        relevanceScore,
        confidence,
        decisionReason,
        matchedKeywords: asStringArray(raw.matchedKeywords),
        unmatchedOrConflictingEvidence: asStringArray(raw.unmatchedOrConflictingEvidence),
        productsMatched: asStringArray(raw.productsMatched),
        businessType,
        locationMatch,
        sourceEvidence: Array.isArray(raw.sourceEvidence)
            ? raw.sourceEvidence.slice(0, 40).map((e) => ({
                field: String(e?.field || '').slice(0, 80),
                value: String(e?.value || '').slice(0, 1000),
                sourceUrl: String(e?.sourceUrl || '').slice(0, 2048),
                note: String(e?.note || 'ollama').slice(0, 500),
            })).filter((e) => e.field || e.value)
            : [],
        qualificationMethod: 'ollama_local',
        aiModel: String(raw.aiModel || '').slice(0, 120),
        aiSchemaVersion: OLLAMA_SCHEMA_VERSION,
    };
}

function buildPrompt({ campaign, enrichment, captures, ruleHint }) {
    const product = campaign?.targetIndustry
        || (campaign?.targetProducts || [])[0]
        || campaign?.name
        || 'Home Automation';
    const city = campaign?.city || '';
    const evidence = {
        product,
        city,
        state: campaign?.state || '',
        companyName: enrichment?.companyName || '',
        websiteUrl: enrichment?.websiteUrl || '',
        businessTypeHint: enrichment?.businessType || '',
        productsServices: (enrichment?.productsServices || []).slice(0, 20),
        manufacturerEvidence: enrichment?.manufacturerEvidence || '',
        cityFromSite: enrichment?.city || '',
        isDirectorySource: Boolean(enrichment?.isDirectorySource),
        google: (captures || []).slice(0, 5).map((c) => ({
            title: c.title,
            snippet: String(c.snippet || '').slice(0, 400),
            url: c.resultUrlOriginal || c.resultUrlNormalized,
        })),
        evidenceSnippets: (enrichment?.sourceEvidence || []).slice(0, 15).map((e) => ({
            field: e.field,
            value: String(e.value || '').slice(0, 200),
            sourceUrl: e.sourceUrl,
        })),
        ruleHintDecision: ruleHint?.systemDecision,
        ruleHintReason: ruleHint?.decisionReason,
    };

    return `You qualify B2B companies for a product/location search. Use ONLY the JSON evidence. Never invent products, contacts, or capabilities. If evidence is insufficient, use human_review_required.

Target product/industry: ${product}
Target location city: ${city || '(not specified)'}

Evidence JSON:
${JSON.stringify(evidence)}

Respond with ONLY valid JSON (no markdown) matching:
{
  "systemDecision": "strong_match|possible_match|rejected|human_review_required",
  "relevanceScore": 0-100,
  "confidence": "low|medium|high",
  "decisionReason": "string",
  "matchedKeywords": ["string"],
  "unmatchedOrConflictingEvidence": ["string"],
  "productsMatched": ["string"],
  "businessType": "manufacturer|oem_odm|brand_owner|importer|distributor|dealer|supplier|system_integrator|service_provider|directory_marketplace|unknown",
  "locationMatch": "match|partial|mismatch|unknown",
  "sourceEvidence": [{"field":"","value":"","sourceUrl":"","note":""}]
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
 * Attempt Ollama qualification. Returns validated result or null.
 */
export async function tryOllamaQualify({ campaign, enrichment, captures, ruleHint }) {
    if (!isOllamaQualificationEnabled()) return null;
    const cfg = getOllamaConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
        const prompt = buildPrompt({ campaign, enrichment, captures, ruleHint });
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
        const validated = validateOllamaQualification(parsed);
        if (!validated) return null;
        validated.aiModel = cfg.model;
        return validated;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export { isOllamaQualificationEnabled, OLLAMA_SCHEMA_VERSION };