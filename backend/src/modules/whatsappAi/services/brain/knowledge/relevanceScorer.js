/**
 * Phase 1C.2 — Deterministic relevance scoring with matched reasons.
 */

import { JSK_PRODUCT_ALIASES } from '../productIntelligence/productAliasDictionary.js';

const WEIGHTS = Object.freeze({
    productFamily: 40,
    alias: 35,
    protocol: 30,
    intentCategory: 20,
    keywordOverlap: 18,
    technicalParam: 15,
    language: 8,
});

function normalizeText(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9\u0900-\u097f\u0a80-\u0aff\s.+-]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function tokenizeKeywords(text) {
    const norm = normalizeText(text);
    if (!norm) return [];
    const stop = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'is', 'please', 'need', 'want']);
    return norm.split(' ').filter((t) => t.length >= 2 && !stop.has(t));
}

function docSearchText(doc) {
    return normalizeText([
        doc.title,
        doc.content,
        doc.category,
        doc.subcategory,
        ...(Array.isArray(doc.keywords) ? doc.keywords : []),
    ].filter(Boolean).join(' '));
}

/**
 * Build query facets from brain inputs.
 */
export function buildRetrievalQuery({ intent, productIntelligence, messageText }) {
    const pi = productIntelligence || {};
    const protocols = Array.isArray(pi.protocols?.list) ? [...pi.protocols.list] : [];
    const aliases = (pi.aliasesMatched || []).map((a) => a.alias);
    const familyId = pi.productFamily?.id || null;
    const familyLabel = pi.productFamily?.label || null;
    const keywords = tokenizeKeywords(messageText || '');

    return {
        intent: intent || 'unknown',
        language: pi.language?.primaryCode || pi.language?.code || 'en',
        normalizedKeywords: keywords,
        productFamilies: familyId ? [familyId] : [],
        productFamilyLabels: familyLabel ? [familyLabel] : [],
        aliases,
        protocols,
        modelSeries: [],
        wattage: pi.electrical?.wattage?.value ?? null,
        voltage: pi.electrical?.voltage?.value ?? null,
        current: pi.electrical?.current
            ? `${pi.electrical.current.value}${pi.electrical.current.unit}`
            : null,
    };
}

function intentCategoryHints(intent) {
    const map = {
        product_enquiry: ['product', 'product_knowledge', 'product_enquiry', 'specification', 'specs'],
        technical_support: ['faq', 'technical_faq', 'technical_support', 'support', 'specification'],
        warranty: ['faq', 'warranty', 'support'],
        complaint: ['faq', 'support', 'company'],
        price_enquiry: ['sales_policy', 'commercial', 'commercial_policy', 'price_policy'],
        quotation_request: ['sales_policy', 'commercial', 'product'],
        availability_enquiry: ['product', 'sales_policy', 'commercial'],
        general_greeting: ['company', 'company_info'],
        dealer_enquiry: ['sales_policy', 'commercial', 'company'],
        distributor_enquiry: ['sales_policy', 'commercial', 'company'],
        sample_request: ['product', 'sales_policy'],
        order_status: ['company', 'faq'],
        unknown: [],
    };
    return map[intent] || [];
}

/**
 * Score one knowledge document against a retrieval query.
 * @returns {{ score: number, matchedReasons: string[] }}
 */
export function scoreKnowledgeDocument(doc, query) {
    const reasons = [];
    let score = 0;
    const hay = docSearchText(doc);
    const category = normalizeText(doc.category || '');
    const subcategory = normalizeText(doc.subcategory || '');
    const catBlob = `${category} ${subcategory}`;

    // Product family
    for (const label of query.productFamilyLabels || []) {
        const n = normalizeText(label);
        if (n && hay.includes(n)) {
            score += WEIGHTS.productFamily;
            reasons.push('exact_product_family_match');
            break;
        }
    }
    for (const fid of query.productFamilies || []) {
        if (hay.includes(normalizeText(fid.replace(/_/g, ' '))) || hay.includes(normalizeText(fid))) {
            if (!reasons.includes('exact_product_family_match')) {
                score += WEIGHTS.productFamily * 0.85;
                reasons.push('product_family_id_match');
            }
            break;
        }
    }

    // Aliases
    const aliasPool = [
        ...(query.aliases || []),
        ...JSK_PRODUCT_ALIASES
            .filter((a) => (query.productFamilies || []).includes(a.familyId))
            .map((a) => a.alias),
    ];
    for (const alias of aliasPool) {
        const n = normalizeText(alias);
        if (n && n.length >= 3 && hay.includes(n)) {
            score += WEIGHTS.alias;
            reasons.push('product_alias_match');
            break;
        }
    }

    // Protocols
    const protocolNeedles = {
        dali: ['dali'],
        dt6: ['dt6', 'dt 6', 'dt-6'],
        dt8: ['dt8', 'dt 8', 'dt-8'],
        ble_mesh: ['ble mesh', 'ble-mesh', 'bluetooth mesh'],
        ble: ['ble'],
        zigbee: ['zigbee'],
        wifi: ['wifi', 'wi-fi', 'wi fi'],
        phase_cut: ['phase cut', 'phase-cut', 'triac'],
    };
    for (const p of query.protocols || []) {
        const needles = protocolNeedles[p] || [normalizeText(p)];
        if (needles.some((n) => hay.includes(n))) {
            score += WEIGHTS.protocol;
            reasons.push(`protocol_match:${p}`);
        }
    }

    // Intent / category
    const hints = intentCategoryHints(query.intent);
    if (hints.some((h) => catBlob.includes(normalizeText(h)) || hay.includes(normalizeText(h)))) {
        score += WEIGHTS.intentCategory;
        reasons.push('intent_category_match');
    }

    // Keyword overlap
    const kwDoc = new Set([
        ...tokenizeKeywords(doc.title),
        ...tokenizeKeywords((doc.keywords || []).join(' ')),
        ...tokenizeKeywords(String(doc.content || '').slice(0, 500)),
    ]);
    let overlap = 0;
    for (const k of query.normalizedKeywords || []) {
        if (kwDoc.has(k) || hay.includes(k)) overlap += 1;
    }
    if (overlap > 0) {
        const add = Math.min(WEIGHTS.keywordOverlap, overlap * 4);
        score += add;
        reasons.push(`keyword_overlap:${overlap}`);
    }

    // Technical params
    if (query.wattage != null && hay.includes(String(query.wattage))) {
        score += WEIGHTS.technicalParam;
        reasons.push('wattage_match');
    }
    if (query.voltage != null && hay.includes(String(query.voltage))) {
        score += WEIGHTS.technicalParam * 0.8;
        reasons.push('voltage_match');
    }
    if (query.current && hay.includes(normalizeText(String(query.current)))) {
        score += WEIGHTS.technicalParam * 0.7;
        reasons.push('current_match');
    }

    // Language bonus only when other relevance already exists (avoid all-EN docs matching unknown queries).
    const docLang = normalizeText(doc.language || 'en');
    const qLang = normalizeText(query.language || 'en');
    if (score > 0 && (docLang === qLang || qLang === 'mixed')) {
        score += WEIGHTS.language;
        reasons.push('language_match');
    }

    return { score, matchedReasons: reasons };
}

export function scoreDocumentReference(doc, query) {
    const reasons = [];
    let score = 0;
    const hay = normalizeText([doc.title, doc.documentType, doc.fileName].filter(Boolean).join(' '));

    for (const label of query.productFamilyLabels || []) {
        if (hay.includes(normalizeText(label))) {
            score += WEIGHTS.productFamily * 0.7;
            reasons.push('exact_product_family_match');
            break;
        }
    }
    for (const p of query.protocols || []) {
        if (hay.includes(normalizeText(p.replace(/_/g, ' '))) || hay.includes(normalizeText(p))) {
            score += WEIGHTS.protocol * 0.7;
            reasons.push(`protocol_match:${p}`);
        }
    }
    let overlap = 0;
    for (const k of query.normalizedKeywords || []) {
        if (hay.includes(k)) overlap += 1;
    }
    if (overlap) {
        score += Math.min(12, overlap * 3);
        reasons.push(`keyword_overlap:${overlap}`);
    }
    const docLang = normalizeText(doc.language || 'en');
    if (docLang === normalizeText(query.language || 'en') || query.language === 'mixed') {
        score += WEIGHTS.language;
        reasons.push('language_match');
    }
    return { score, matchedReasons: reasons };
}

export { WEIGHTS, normalizeText };
