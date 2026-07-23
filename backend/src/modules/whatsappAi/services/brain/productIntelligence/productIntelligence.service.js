/**
 * Phase 1C.1 — JSK Product Intelligence Engine.
 * Deterministic enrichment only. No LLM, network, WhatsApp, or CRM writes.
 */

import { JSK_PRODUCT_FAMILIES, getProductFamilyById } from './productFamilyTaxonomy.js';
import { JSK_PRODUCT_ALIASES } from './productAliasDictionary.js';
import { detectLanguageDetailed, detectPrimaryLanguageCode } from './languageDetect.js';

export const JSK_PRODUCT_INTELLIGENCE_VERSION = 'jsk_product_intelligence_v1';

const ALIASES_BY_LENGTH = [...JSK_PRODUCT_ALIASES].sort((a, b) => b.alias.length - a.alias.length);

function clamp01(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(1, x));
}

function matchProductFamily(text) {
    const raw = String(text || '');
    const lower = raw.toLowerCase();
    const matched = [];

    for (const entry of ALIASES_BY_LENGTH) {
        const alias = entry.alias;
        const hay = /[^\x00-\x7F]/.test(alias) ? raw : lower;
        const needle = /[^\x00-\x7F]/.test(alias) ? alias : alias.toLowerCase();
        if (hay.includes(needle)) {
            // Avoid double-counting same family from shorter alias if longer already matched
            if (matched.some((m) => m.familyId === entry.familyId)) continue;
            matched.push({
                familyId: entry.familyId,
                alias: entry.alias,
                weight: entry.weight,
            });
        }
    }

    if (!matched.length) {
        return {
            productFamily: null,
            aliasesMatched: [],
            confidence: 0,
        };
    }

    // Prefer highest weight, then longest alias
    matched.sort((a, b) => b.weight - a.weight || b.alias.length - a.alias.length);
    const best = matched[0];
    const family = getProductFamilyById(best.familyId);

    return {
        productFamily: family
            ? {
                id: family.id,
                label: family.label,
                category: family.category,
                confidence: clamp01(best.weight),
            }
            : null,
        aliasesMatched: matched.map((m) => ({
            familyId: m.familyId,
            alias: m.alias,
            weight: m.weight,
        })),
        confidence: clamp01(best.weight),
    };
}

function extractQuantity(text) {
    const raw = String(text || '');
    const patterns = [
        /\b(\d{1,5})\s*(pcs|pieces|nos|no\.?|qty|units?|nos\.)\b/i,
        /\bqty[:\s]*(\d{1,5})\b/i,
        /\bquantity[:\s]*(\d{1,5})\b/i,
        /(\d{1,5})\s*(પીસ|નંગ|नग|पीस)/i,
        /\b(\d{1,5})\s*x\b/i,
    ];
    for (const re of patterns) {
        const m = raw.match(re);
        if (m) {
            const value = Number(m[1]);
            if (Number.isFinite(value) && value > 0) {
                const unit = (m[2] || 'pcs').toString().toLowerCase();
                return {
                    value,
                    unit: /x/i.test(m[0]) ? 'x' : unit,
                    confidence: 0.92,
                    raw: m[0],
                };
            }
        }
    }
    return null;
}

function extractElectrical(text) {
    const raw = String(text || '');
    let wattage = null;
    let voltage = null;
    let current = null;
    let confParts = [];

    const watt = raw.match(/\b(\d{1,4})\s*w(?:att)?s?\b/i)
        || raw.match(/\b(\d{1,4})\s*वाट\b/i)
        || raw.match(/\b(\d{1,4})\s*વોટ\b/i);
    if (watt) {
        wattage = { value: Number(watt[1]), unit: 'W', confidence: 0.93, raw: watt[0] };
        confParts.push(0.93);
    }

    const volt = raw.match(/\b(\d{2,3})\s*v(?:olt)?s?\b/i)
        || raw.match(/\b(\d{2,3})\s*vac\b/i)
        || raw.match(/\b(\d{2,3})\s*वोल्ट\b/i);
    if (volt) {
        voltage = { value: Number(volt[1]), unit: 'V', confidence: 0.9, raw: volt[0] };
        confParts.push(0.9);
    }

    const amp = raw.match(/\b(\d+(?:\.\d+)?)\s*mA\b/i)
        || raw.match(/\b(\d+(?:\.\d+)?)\s*(a|amp|amps)\b/i);
    if (amp) {
        const isMa = /mA/i.test(amp[0]);
        current = {
            value: Number(amp[1]),
            unit: isMa ? 'mA' : 'A',
            confidence: 0.88,
            raw: amp[0],
        };
        confParts.push(0.88);
    }

    return {
        wattage,
        voltage,
        current,
        confidence: confParts.length
            ? Number((confParts.reduce((a, b) => a + b, 0) / confParts.length).toFixed(3))
            : 0,
    };
}

function extractProtocols(text) {
    const lower = String(text || '').toLowerCase();
    const protocols = {
        dali: /\bdali\b/i.test(lower) || lower.includes('डाली') || lower.includes('ડાલી'),
        dt6: /\bdt\s*-?\s*6\b/i.test(lower),
        dt8: /\bdt\s*-?\s*8\b/i.test(lower),
        bleMesh: /\bble\s*-?\s*mesh\b/i.test(lower) || /\bbluetooth\s+mesh\b/i.test(lower),
        ble: /\bble\b/i.test(lower) && !/\bble\s*-?\s*mesh\b/i.test(lower),
        zigbee: /\bzigbee\b/i.test(lower) || lower.includes('जिगबी'),
        wifi: /\bwi-?fi\b/i.test(lower) || /\bwifi\b/i.test(lower),
    };

    // If ble mesh matched, also mark ble as related but prefer bleMesh in list
    if (protocols.bleMesh) {
        protocols.ble = true;
    }

    const list = [];
    if (protocols.dali) list.push('dali');
    if (protocols.dt6) list.push('dt6');
    if (protocols.dt8) list.push('dt8');
    if (protocols.bleMesh) list.push('ble_mesh');
    else if (protocols.ble) list.push('ble');
    if (protocols.zigbee) list.push('zigbee');
    if (protocols.wifi) list.push('wifi');

    return {
        ...protocols,
        list,
        confidence: list.length ? Number(Math.min(0.98, 0.7 + list.length * 0.06).toFixed(3)) : 0,
    };
}

function extractColourTemperature(text) {
    const m = String(text || '').match(/\b(\d{3,4})\s*k\b/i);
    if (!m) return null;
    const value = Number(m[1]);
    if (value < 1000 || value > 10000) return null;
    return { value, unit: 'K', confidence: 0.9, raw: m[0] };
}

function extractCustomerCompany(text) {
    const m = String(text || '').match(/\b(?:from|company|for)\s+([A-Z][A-Za-z0-9 &.\-]{2,60})/);
    if (!m) return null;
    return { value: m[1].trim(), confidence: 0.55, raw: m[0] };
}

function overallConfidence(parts) {
    const weights = parts.filter((p) => p && p.weight > 0 && p.score > 0);
    if (!weights.length) return 0.2;
    let num = 0;
    let den = 0;
    for (const p of weights) {
        num += p.score * p.weight;
        den += p.weight;
    }
    return Number(clamp01(num / den).toFixed(3));
}

/**
 * Analyze text into a structured Product Intelligence object.
 * @param {string} text
 * @param {{ languageHint?: string }} [hints]
 */
export function analyzeProductIntelligence(text = '', hints = {}) {
    const raw = String(text || '');
    const language = detectLanguageDetailed(raw);
    if (hints.languageHint && ['en', 'hi', 'gu'].includes(hints.languageHint) && language.code === 'en' && language.confidence < 0.6) {
        language.code = hints.languageHint;
        language.confidence = Math.max(language.confidence, 0.55);
    }

    const familyMatch = matchProductFamily(raw);
    const quantity = extractQuantity(raw);
    const electrical = extractElectrical(raw);
    const protocols = extractProtocols(raw);
    const colourTemperature = extractColourTemperature(raw);
    const customerCompany = extractCustomerCompany(raw);

    const breakdown = {
        language: language.confidence,
        productFamily: familyMatch.confidence,
        quantity: quantity?.confidence || 0,
        electrical: electrical.confidence,
        protocols: protocols.confidence,
    };

    const confidence = {
        overall: overallConfidence([
            { score: breakdown.language, weight: 0.15 },
            { score: breakdown.productFamily, weight: 0.35 },
            { score: breakdown.quantity, weight: 0.15 },
            { score: breakdown.electrical, weight: 0.2 },
            { score: breakdown.protocols, weight: 0.15 },
        ]),
        breakdown,
    };

    return {
        version: JSK_PRODUCT_INTELLIGENCE_VERSION,
        language: {
            code: language.code,
            primaryCode: detectPrimaryLanguageCode(raw),
            confidence: language.confidence,
            scores: language.scores,
            scriptHints: language.scriptHints,
        },
        productFamily: familyMatch.productFamily,
        aliasesMatched: familyMatch.aliasesMatched,
        quantity,
        electrical: {
            wattage: electrical.wattage,
            voltage: electrical.voltage,
            current: electrical.current,
            confidence: electrical.confidence,
        },
        protocols,
        colourTemperature,
        customerCompany,
        confidence,
        unresolvedTokens: [],
        familiesCatalogSize: JSK_PRODUCT_FAMILIES.length,
    };
}

/**
 * Map Product Intelligence → Phase 1C.0 entity map shape (compat).
 */
export function productIntelligenceToEntityMap(pi) {
    const language = pi?.language?.primaryCode || 'en';
    return {
        productName: pi?.productFamily?.label || null,
        quantity: pi?.quantity?.value ?? null,
        wattage: pi?.electrical?.wattage?.value ?? null,
        voltage: pi?.electrical?.voltage?.value ?? null,
        current: pi?.electrical?.current
            ? `${pi.electrical.current.value}${pi.electrical.current.unit}`
            : null,
        dt6: !!pi?.protocols?.dt6,
        dt8: !!pi?.protocols?.dt8,
        ble: !!(pi?.protocols?.ble || pi?.protocols?.bleMesh),
        zigbee: !!pi?.protocols?.zigbee,
        wifi: !!pi?.protocols?.wifi,
        colourTemperature: pi?.colourTemperature?.value ?? null,
        customerCompany: pi?.customerCompany?.value ?? null,
        language,
        unresolvedTokens: Array.isArray(pi?.unresolvedTokens) ? pi.unresolvedTokens : [],
        // additive non-breaking enrichment mirror
        productFamilyId: pi?.productFamily?.id || null,
        productIntelligenceConfidence: pi?.confidence?.overall ?? null,
    };
}

/** @returns {{ analyze: Function, toEntityMap: Function, version: string }} */
export function createProductIntelligenceEngine() {
    return {
        version: JSK_PRODUCT_INTELLIGENCE_VERSION,
        analyze: analyzeProductIntelligence,
        toEntityMap: productIntelligenceToEntityMap,
    };
}

export default createProductIntelligenceEngine;
