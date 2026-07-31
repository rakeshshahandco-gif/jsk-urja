import { SUPPORTED_FAMILIES } from './constants.js';
import { stableStringify } from './normalize.util.js';

/**
 * Deterministic in-memory adapters only.
 * Never import write-capable CRM / scoring persistence / KG mutation / messaging services.
 */

export function isFamilySupported(familyCode) {
    return SUPPORTED_FAMILIES.has(familyCode);
}

function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function bandFromScore(score, bands = {}) {
    const high = num(bands.high ?? bands.HIGH ?? 80, 80);
    const mid = num(bands.mid ?? bands.MEDIUM ?? 50, 50);
    if (score >= high) return 'HIGH';
    if (score >= mid) return 'MEDIUM';
    return 'LOW';
}

function scoreRecord(record, payload) {
    const weights = payload?.weights || payload?.dimensions || { fit: 0.5, intent: 0.5 };
    const fit = num(record.fit ?? record.features?.fit, 0.5);
    const intent = num(record.intent ?? record.features?.intent, 0.5);
    const wFit = num(weights.fit ?? weights.FIT ?? 0.5, 0.5);
    const wIntent = num(weights.intent ?? weights.INTENT ?? 0.5, 0.5);
    const denom = (wFit + wIntent) || 1;
    let score = ((fit * wFit) + (intent * wIntent)) / denom * 100;
    const thr = payload?.thresholds || payload;
    if (thr?.boost != null) score += num(thr.boost);
    if (thr?.cap != null) score = Math.min(score, num(thr.cap, 100));
    score = Math.max(0, Math.min(100, score));
    const priority = bandFromScore(score, payload?.bands || payload?.priorityBands || {});
    return {
        kind: 'LEAD_SCORE',
        score: Math.round(score * 100) / 100,
        priority,
        grade: priority === 'HIGH' ? 'A' : (priority === 'MEDIUM' ? 'B' : 'C'),
        mutated: false,
        persisted: false,
    };
}

function classifyLabel(record, payload, field = 'industry') {
    const mappings = payload?.mappings || payload?.rules || [];
    const text = String(record.text || record.label || record[field] || '').toLowerCase();
    let label = payload?.defaultLabel || 'UNKNOWN';
    if (Array.isArray(mappings)) {
        for (const m of mappings) {
            const from = String(m?.from || m?.key || m?.pattern || '').toLowerCase();
            if (from && text.includes(from)) {
                label = m.to || m.value || m.label || label;
                break;
            }
        }
    } else if (mappings && typeof mappings === 'object') {
        for (const [k, v] of Object.entries(mappings)) {
            if (text.includes(String(k).toLowerCase())) { label = v; break; }
        }
    }
    return { kind: 'LABEL', field, label: String(label), mutated: false, persisted: false };
}

function productRec(record, payload) {
    const products = payload?.products || payload?.mappings || [];
    const industry = String(record.industry || record.label || '').toLowerCase();
    const minFit = num(payload?.minFit ?? payload?.fitThreshold ?? 0.4, 0.4);
    const out = [];
    const list = Array.isArray(products) ? products : Object.entries(products).map(([k, v]) => ({ id: k, ...(typeof v === 'object' ? v : { name: v }) }));
    for (const p of list) {
        if (p?.missing === true) continue;
        const fit = num(p.fit ?? record.fit ?? 0.5, 0.5);
        const industries = (p.industries || []).map((x) => String(x).toLowerCase());
        if (industries.length && industry && !industries.some((i) => industry.includes(i))) continue;
        if (fit >= minFit) out.push({ id: p.id || p.productId || p.name, fit });
    }
    return { kind: 'PRODUCTS', products: out, mutated: false, persisted: false, sent: false };
}

function thresholdDecision(record, payload, key = 'similarity') {
    const threshold = num(payload?.threshold ?? payload?.min ?? payload?.value ?? 0.7, 0.7);
    const value = num(record[key] ?? record.score ?? record.value, 0);
    return {
        kind: 'THRESHOLD',
        key,
        value,
        threshold,
        pass: value >= threshold,
        mutated: false,
        persisted: false,
    };
}

function contactRole(record, payload) {
    const mappings = payload?.mappings || payload?.roles || {};
    const title = String(record.title || record.role || '').toLowerCase();
    let role = payload?.defaultRole || 'UNKNOWN';
    const confThr = num(payload?.confidenceThreshold ?? 0.5, 0.5);
    const confidence = num(record.confidence ?? 0.6, 0.6);
    if (Array.isArray(mappings)) {
        for (const m of mappings) {
            if (title.includes(String(m.from || m.key || '').toLowerCase())) {
                role = m.to || m.role || role;
                break;
            }
        }
    } else {
        for (const [k, v] of Object.entries(mappings)) {
            if (title.includes(String(k).toLowerCase())) { role = v; break; }
        }
    }
    return {
        kind: 'CONTACT',
        role,
        confidence,
        accepted: confidence >= confThr,
        mutated: false,
        persisted: false,
    };
}

function kgSuggest(record, payload) {
    const minConf = num(payload?.minConfidence ?? payload?.threshold ?? 0.6, 0.6);
    const relType = payload?.relationshipType || record.relationshipType || 'RELATED_TO';
    const confidence = num(record.confidence ?? 0.5, 0.5);
    return {
        kind: 'KG',
        relationshipType: relType,
        confidence,
        suggested: confidence >= minConf,
        mutated: false,
        persisted: false,
        graphModified: false,
    };
}

function templateEval(record, payload, kind) {
    const template = payload?.template || payload?.body || payload?.text || '';
    const required = payload?.requiredFields || ['subject', 'body'];
    const present = required.filter((f) => template.includes(`{{${f}}}`) || (record[f] != null));
    const blob = String(template).toLowerCase();
    const blocksUnsupported = !(blob.includes('send_whatsapp') || blob.includes('create_task') || blob.includes('activate') || blob.includes('deploy'));
    return {
        kind,
        structureOk: present.length === required.length || String(template).length > 0,
        citationPresent: /\[cite:|source:/i.test(String(template)) || !!record.citation,
        unsupportedActionBlocked: blocksUnsupported,
        privacySafe: !/@[a-z0-9.-]+\.[a-z]{2,}/i.test(String(template)),
        mutated: false,
        persisted: false,
        sent: false,
        liveProviderUsed: false,
    };
}

function dataQuality(record, payload) {
    const rules = payload?.rules || payload?.requiredFields || ['name'];
    const missing = (Array.isArray(rules) ? rules : []).filter((f) => {
        const key = typeof f === 'string' ? f : f?.field;
        return key && (record[key] == null || record[key] === '');
    });
    return {
        kind: 'DATA_QUALITY',
        missing,
        pass: missing.length === 0,
        mutated: false,
        persisted: false,
    };
}

function sourcePriority(record, payload) {
    const order = payload?.priority || payload?.order || ['crm', 'web', 'manual'];
    const source = String(record.source || 'manual').toLowerCase();
    const idx = order.findIndex((s) => String(s).toLowerCase() === source);
    return {
        kind: 'SOURCE_PRIORITY',
        source,
        rank: idx >= 0 ? idx : order.length,
        mutated: false,
        persisted: false,
    };
}

/**
 * Evaluate one record against a configuration payload in memory.
 * @returns {{ supported: boolean, output?: object, code?: string }}
 */
export function evaluateRecord(familyCode, payload, record) {
    if (!isFamilySupported(familyCode)) {
        return { supported: false, code: 'EVALUATION_NOT_SUPPORTED' };
    }
    const p = payload || {};
    let output;
    switch (familyCode) {
        case 'LEAD_SCORE_DIMENSIONS':
        case 'LEAD_SCORE_WEIGHTS':
        case 'LEAD_SCORE_THRESHOLDS':
        case 'LEAD_PRIORITY_BANDS':
            output = scoreRecord(record, p);
            break;
        case 'INDUSTRY_CLASSIFICATION_RULES':
            output = classifyLabel(record, p, 'industry');
            break;
        case 'CUSTOMER_TYPE_MAPPINGS':
            output = classifyLabel(record, p, 'customerType');
            break;
        case 'LEAD_RELEVANCE_RULES':
            output = classifyLabel(record, { ...p, defaultLabel: p.defaultLabel || 'IRRELEVANT' }, 'relevance');
            break;
        case 'PRODUCT_RECOMMENDATION_MAPPINGS':
        case 'PRODUCT_FIT_THRESHOLDS':
            output = productRec(record, p);
            break;
        case 'SIMILAR_COMPANY_THRESHOLDS':
            output = thresholdDecision(record, p, 'similarity');
            break;
        case 'DUPLICATE_DETECTION_THRESHOLDS':
        case 'ENTITY_RESOLUTION_THRESHOLDS':
            output = thresholdDecision(record, p, 'duplicateScore');
            break;
        case 'CONTACT_ROLE_MAPPINGS':
        case 'CONTACT_CONFIDENCE_THRESHOLDS':
            output = contactRole(record, p);
            break;
        case 'KG_RELATIONSHIP_RULES':
        case 'KG_CONFIDENCE_THRESHOLDS':
            output = kgSuggest(record, p);
            break;
        case 'ASSISTANT_TEMPLATES':
        case 'ASSISTANT_CLARIFICATION_TEMPLATES':
            output = templateEval(record, p, 'ASSISTANT_TEMPLATE');
            break;
        case 'MARKETING_DRAFT_TEMPLATES':
            output = templateEval(record, p, 'MARKETING_DRAFT');
            break;
        case 'DATA_QUALITY_VALIDATION_RULES':
            output = dataQuality(record, p);
            break;
        case 'SOURCE_PRIORITY_RULES':
            output = sourcePriority(record, p);
            break;
        default:
            return { supported: false, code: 'EVALUATION_NOT_SUPPORTED' };
    }
    output.fingerprint = stableStringify(output).slice(0, 64);
    return { supported: true, output };
}
