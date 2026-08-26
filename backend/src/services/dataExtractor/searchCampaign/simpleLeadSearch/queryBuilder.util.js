import { ApiError } from '../../../../utils/ApiError.js';
import {
    buildCombinedManufacturerExporterPhrase,
    buildManufacturerSearchPhrases,
    buildTypeSearchPhrases,
    formatSimpleSearchLabel,
} from './simpleBusinessType.util.js';

/**
 * Simple Lead Search query generation.
 * Legacy path (no businessTypes) preserves CP5B manufacturers-first templates.
 * Owner multi-select path: one recommended phrase per business type + optional keyword/China queries.
 */

function collapseWhitespace(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeDisplay(value = '') {
    return collapseWhitespace(value);
}

export const LOCATION_SCOPES = Object.freeze(['city', 'state', 'country', 'worldwide']);

export const SEARCH_MARKETS = Object.freeze([
    'india_global_web',
    'china_suppliers',
    'custom_country_global',
]);

export const DEFAULT_BUSINESS_TYPES = Object.freeze([
    'Manufacturer',
    'Provider',
    'Supplier',
    'System Integrator',
]);

/** Owner-facing business type options with one recommended Google phrase each. */
export const BUSINESS_TYPE_OPTIONS = Object.freeze([
    { id: 'Manufacturer', label: 'Manufacturer', phrase: 'manufacturers', priorityScore: 100 },
    { id: 'OEM / ODM', label: 'OEM / ODM', phrase: 'OEM ODM manufacturer', priorityScore: 98 },
    { id: 'Brand Owner', label: 'Brand Owner', phrase: 'brand owner', priorityScore: 92 },
    { id: 'Provider', label: 'Provider', phrase: 'providers', priorityScore: 90 },
    { id: 'Supplier', label: 'Supplier', phrase: 'suppliers', priorityScore: 88 },
    { id: 'Dealer', label: 'Dealer', phrase: 'dealers', priorityScore: 80 },
    { id: 'Distributor', label: 'Distributor', phrase: 'distributors', priorityScore: 78 },
    { id: 'Importer', label: 'Importer', phrase: 'importers', priorityScore: 76 },
    { id: 'Exporter', label: 'Exporter', phrase: 'exporters', priorityScore: 74 },
    { id: 'Wholesaler', label: 'Wholesaler', phrase: 'wholesalers', priorityScore: 72 },
    { id: 'Retailer', label: 'Retailer', phrase: 'retailers', priorityScore: 70 },
    { id: 'System Integrator', label: 'System Integrator', phrase: 'system integrators', priorityScore: 85 },
    { id: 'Service Provider', label: 'Service Provider', phrase: 'service providers', priorityScore: 68 },
    { id: 'Contractor', label: 'Contractor', phrase: 'contractors', priorityScore: 66 },
    { id: 'Consultant', label: 'Consultant', phrase: 'consultants', priorityScore: 64 },
    { id: 'Marketplace Seller', label: 'Marketplace Seller', phrase: 'marketplace sellers', priorityScore: 60 },
    { id: 'Other', label: 'Other', phrase: 'companies', priorityScore: 55 },
    { id: 'Any Business', label: 'Any Business', phrase: '', priorityScore: 50 },
]);

const BUSINESS_TYPE_BY_ID = new Map(BUSINESS_TYPE_OPTIONS.map((o) => [o.id.toLowerCase(), o]));

export const INDIA_GLOBAL_SOURCE_OPTIONS = Object.freeze([
    { id: 'google_web', label: 'Google Web', implemented: true },
    { id: 'company_websites', label: 'Company Websites', implemented: false },
    { id: 'indiamart', label: 'IndiaMART', implemented: false, siteHint: 'indiamart.com' },
    { id: 'tradeindia', label: 'TradeIndia', implemented: false, siteHint: 'tradeindia.com' },
    { id: 'justdial', label: 'Justdial', implemented: false, siteHint: 'justdial.com' },
    { id: 'exportersindia', label: 'ExportersIndia', implemented: false, siteHint: 'exportersindia.com' },
]);

export const CHINA_SOURCE_OPTIONS = Object.freeze([
    { id: '1688', label: '1688 Direct', implemented: true },
    { id: 'baidu', label: 'Baidu', implemented: true },
    { id: 'sogou', label: 'Sogou', implemented: true },
    { id: 'so360', label: '360 Search', implemented: true },
    { id: 'alibaba', label: 'Alibaba (indexed)', implemented: true },
    { id: 'made_in_china', label: 'Made-in-China (indexed)', implemented: true },
    { id: 'global_sources', label: 'Global Sources (indexed)', implemented: true },
    { id: 'chinese_company_websites', label: 'Chinese Company Websites', implemented: false },
    { id: 'google_global', label: 'Google Web (secondary)', implemented: true },
]);

/** Suggest major cities for state expansion (owner must select; not auto-all). */
export const MAJOR_CITIES_BY_STATE = Object.freeze({
    maharashtra: ['Mumbai', 'Pune', 'Thane', 'Navi Mumbai', 'Nashik', 'Nagpur', 'Aurangabad', 'Kolhapur'],
    gujarat: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Gandhinagar'],
    karnataka: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi'],
    'tamil nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli'],
    delhi: ['New Delhi', 'Delhi'],
    telangana: ['Hyderabad', 'Warangal'],
    'west bengal': ['Kolkata', 'Howrah', 'Durgapur'],
    rajasthan: ['Jaipur', 'Jodhpur', 'Udaipur'],
    'uttar pradesh': ['Lucknow', 'Noida', 'Kanpur', 'Ghaziabad'],
});

/** CP5B legacy exclusions (exact query text contracts). */
const LEGACY_EXCLUSIONS = Object.freeze(['-jobs', '-course', '-training']);
/** Expanded exclusions for multi-business-type / scoped search. */
const SAFE_EXCLUSIONS = Object.freeze(['-jobs', '-course', '-training', '-career', '-vacancy', '-tutorial']);
/** Job-style negatives that push Google into the Jobs vertical — skip for exact model SKUs. */
const JOB_STYLE_EXCLUSIONS = Object.freeze([
    '-jobs', '-job', '-course', '-training', '-career', '-vacancy',
    '-tutorial', '-tutor', '-hiring', '-recruitment', '-internship',
]);

export const MAX_GENERATED_QUERIES = 24;
/** Higher cap for per-model China families (cities + Chinese + Baidu + 1688). */
export const MAX_MODEL_CHINA_QUERIES = 110;

/** Auto-expanded when Country=China and city/state are blank. */
export const CHINA_PRIORITY_CITIES = Object.freeze([
    'Shenzhen', 'Dongguan', 'Guangzhou', 'Hangzhou', 'Ningbo',
]);
export const MAX_RELATED_KEYWORDS = 8;

const CN_PRODUCT_GLOSSARY = Object.freeze({
    'smart switch': '智能开关',
    'touch switch': '智能触摸开关',
    'home automation': '智能家居',
    'led light': 'LED灯',
    'dali driver': 'DALI驱动',
    tuya: '涂鸦',
    zigbee: 'Zigbee',
    matter: 'Matter',
    knx: 'KNX',
    dali: 'DALI',
});

function resolveBusinessType(raw) {
    const key = normalizeDisplay(raw).toLowerCase();
    if (!key) return null;
    const aliases = {
        manufacturer: 'Manufacturer',
        manufacturers: 'Manufacturer',
        oem_odm: 'OEM / ODM',
        'oem/odm': 'OEM / ODM',
        'oem odm': 'OEM / ODM',
        brand_owner: 'Brand Owner',
        'brand owner': 'Brand Owner',
        provider: 'Provider',
        supplier: 'Supplier',
        system_integrator: 'System Integrator',
        service_provider: 'Service Provider',
        any_business: 'Any Business',
        'any business': 'Any Business',
    };
    if (aliases[key] && BUSINESS_TYPE_BY_ID.has(aliases[key].toLowerCase())) {
        return BUSINESS_TYPE_BY_ID.get(aliases[key].toLowerCase());
    }
    if (BUSINESS_TYPE_BY_ID.has(key)) return BUSINESS_TYPE_BY_ID.get(key);
    // tolerate legacy lowercase ids
    for (const opt of BUSINESS_TYPE_OPTIONS) {
        if (opt.id.toLowerCase() === key || opt.label.toLowerCase() === key) return opt;
        if (opt.phrase.toLowerCase() === key) return opt;
    }
    return {
        id: normalizeDisplay(raw),
        label: normalizeDisplay(raw),
        phrase: normalizeDisplay(raw).toLowerCase(),
        priorityScore: 50,
    };
}

export function normalizeBusinessTypes(raw) {
    if (raw == null) return [];
    const list = Array.isArray(raw)
        ? raw
        : String(raw).split(/[,|]/).map((s) => s.trim()).filter(Boolean);
    const out = [];
    const seen = new Set();
    for (const item of list) {
        const opt = resolveBusinessType(item);
        if (!opt) continue;
        const k = opt.id.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(opt.id);
    }
    return out;
}

export function parseRelatedKeywords(raw) {
    if (raw == null || raw === '') return [];
    const list = Array.isArray(raw)
        ? raw
        : String(raw).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    const out = [];
    const seen = new Set();
    for (const item of list) {
        const s = normalizeDisplay(item);
        if (!s) continue;
        const k = s.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(s);
        if (out.length >= MAX_RELATED_KEYWORDS) break;
    }
    return out;
}

export function inferLocationScope({ locationScope, city, state, country, worldwide } = {}) {
    const raw = normalizeDisplay(locationScope).toLowerCase();
    if (LOCATION_SCOPES.includes(raw)) return raw;
    if (worldwide === true) return 'worldwide';
    if (normalizeDisplay(city)) return 'city';
    if (normalizeDisplay(state)) return 'state';
    if (normalizeDisplay(country)) return 'country';
    return 'worldwide';
}

export function validateLocationForScope({ locationScope, city, state, country } = {}) {
    const scope = inferLocationScope({ locationScope, city, state, country });
    const cityN = normalizeDisplay(city);
    const stateN = normalizeDisplay(state);
    const countryN = normalizeDisplay(country);
    if (scope === 'city' && !cityN) {
        return { ok: false, message: 'City is required for City location scope' };
    }
    if (scope === 'state') {
        if (!countryN) return { ok: false, message: 'Country is required for State location scope' };
        if (!stateN) return { ok: false, message: 'State is required for State location scope' };
    }
    if (scope === 'country' && !countryN) {
        return { ok: false, message: 'Country is required for Country location scope' };
    }
    return { ok: true, locationScope: scope, city: cityN, state: stateN, country: countryN };
}

/**
 * Location phrase for Google query text.
 * City scope: city only (do not append state/country when city is enough).
 */
export function buildLocationPhrase({ locationScope, city, state, country, worldwide } = {}) {
    const scope = inferLocationScope({ locationScope, city, state, country, worldwide });
    const cityN = normalizeDisplay(city);
    const stateN = normalizeDisplay(state);
    const countryN = normalizeDisplay(country);
    if (scope === 'worldwide') return '';
    if (scope === 'city') return cityN;
    if (scope === 'state') return stateN;
    if (scope === 'country') return countryN;
    return cityN || stateN || countryN || '';
}

export function buildCampaignName(product, city, state, extras = {}) {
    const p = normalizeDisplay(product);
    const scope = inferLocationScope({
        locationScope: extras.locationScope,
        city,
        state,
        country: extras.country,
        worldwide: extras.worldwide,
    });
    const market = normalizeDisplay(extras.searchMarket || '').toLowerCase();
    if (market === 'china_suppliers') {
        return `${p} — China Suppliers`;
    }
    if (scope === 'worldwide') return `${p} — Worldwide`;
    if (scope === 'city' && normalizeDisplay(city)) return `${p} — ${normalizeDisplay(city)}`;
    if (scope === 'state' && normalizeDisplay(state)) return `${p} — ${normalizeDisplay(state)}`;
    if (scope === 'country' && normalizeDisplay(extras.country || '')) {
        return `${p} — ${normalizeDisplay(extras.country)}`;
    }
    // Legacy fallback
    const c = normalizeDisplay(city);
    const s = normalizeDisplay(state);
    if (c) return `${p} — ${c}`;
    if (s) return `${p} — ${s}`;
    return p;
}

function buildPhraseTemplates(productLower) {
    const isHomeAuto = /\bhome\s+automation\b/i.test(productLower) || productLower === 'home automation';
    return [
        { suffix: 'manufacturers', priorityScore: 100 },
        { suffix: 'companies', priorityScore: 90 },
        { suffix: 'providers', priorityScore: 85 },
        { suffix: 'suppliers', priorityScore: 80 },
        { suffix: 'dealers', priorityScore: 75 },
        { suffix: 'distributors', priorityScore: 70 },
        { suffix: 'system integrators', priorityScore: 65 },
        {
            suffix: isHomeAuto ? 'smart home companies' : 'companies',
            priorityScore: 60,
            skipIfDuplicateCompanies: !isHomeAuto,
            replaceProduct: isHomeAuto,
        },
    ];
}

function buildExclusionSuffix(excludeKeywords, { legacy = false, skipJobStyle = false } = {}) {
    const base = skipJobStyle ? [] : (legacy ? LEGACY_EXCLUSIONS : SAFE_EXCLUSIONS);
    const extraExcludes = Array.isArray(excludeKeywords)
        ? excludeKeywords.map((k) => normalizeDisplay(k)).filter(Boolean).map((k) => (k.startsWith('-') ? k : `-${k}`))
        : [];
    const exclusions = [...base, ...extraExcludes];
    const seenEx = new Set();
    const exParts = [];
    for (const e of exclusions) {
        const key = e.toLowerCase();
        if (seenEx.has(key)) continue;
        if (skipJobStyle && JOB_STYLE_EXCLUSIONS.includes(key)) continue;
        seenEx.add(key);
        exParts.push(e);
    }
    return exParts.length ? ` ${exParts.join(' ')}` : '';
}

export function isChinaCountry(country) {
    const c = normalizeDisplay(country).toLowerCase();
    return c === 'china' || c === 'prc' || c === 'cn'
        || c === "people's republic of china" || c === 'p.r.c.';
}

/** Map planner sourcePlatform to SearchQuery sourceHint (native portal vs Google-indexed). */
export function sourceHintFromPlatform(sourcePlatform) {
    const p = String(sourcePlatform || '').toLowerCase();
    if (p === 'baidu') return 'baidu';
    if (p === '1688') return '1688';
    if (p === 'sogou') return 'sogou';
    if (p === 'so360' || p === '360') return 'so360';
    return 'google';
}

/** Bucket for counters. site:1688.com on Google stays google — never "direct 1688". */
export function chinaSourceBucket(sourcePlatform) {
    const p = String(sourcePlatform || '').toLowerCase();
    if (p === '1688') return '1688';
    if (p === 'baidu') return 'baidu';
    if (p === 'sogou') return 'sogou';
    if (p === 'so360' || p === '360') return 'so360';
    if (p === 'alibaba') return 'alibaba';
    if (p === 'made_in_china') return 'made_in_china';
    if (p === 'global_sources') return 'global_sources';
    return 'google';
}

/**
 * Exact product/model SKU (ZT2S, BT2S, ZTC, BTC) — not an industry phrase.
 */
export function looksLikeModelCode(raw) {
    const s = normalizeDisplay(raw);
    if (!s || /\s/.test(s)) return false;
    if (s.length < 2 || s.length > 16) return false;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,15}$/.test(s)) return false;
    const hasLetter = /[A-Za-z]/.test(s);
    const hasDigit = /\d/.test(s);
    if (hasLetter && hasDigit) return true;
    return hasLetter && !hasDigit && s.length >= 2 && s.length <= 5;
}

const MODEL_NOISE_SUFFIX = /(?:\s|-)*(?:modules?|moduls?|模组|模块)$/i;

function normalizeModelToken(part) {
    let s = normalizeDisplay(part);
    if (!s) return '';
    s = s.replace(MODEL_NOISE_SUFFIX, '').trim();
    return s.replace(/\s+/g, '');
}

/**
 * Split "ZT2S, BT2S, ZTC, BTC" into separate models. Empty when product is a phrase.
 * "ZT2S MODULE" / "ZT2S 模组" still count as model ZT2S (not a 7-query industry phrase).
 */
export function parseProductModels(product) {
    const raw = normalizeDisplay(product);
    if (!raw) return [];
    const parts = raw.split(/[,;，、|/]+/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return [];
    const out = [];
    const seen = new Set();
    for (const p of parts) {
        const token = normalizeModelToken(p);
        if (!looksLikeModelCode(token)) continue;
        const k = token.toUpperCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(token);
    }
    return out;
}

function quoteModel(model) {
    return `"${String(model || '').replace(/"/g, '')}"`;
}

function modelSpecialty(model) {
    const u = String(model || '').toUpperCase();
    if (u === 'BTC' || (u.startsWith('BT') && u !== 'ZT2S')) {
        return { zigbee: false, bluetooth: true, zhModule: '蓝牙模组' };
    }
    if (u === 'ZTC' || u.startsWith('ZT')) {
        return { zigbee: true, bluetooth: false, zhModule: '模组' };
    }
    return { zigbee: /Z/.test(u), bluetooth: /B/.test(u), zhModule: '模组' };
}

function pushQuery(out, seenText, item, maxQueries = MAX_GENERATED_QUERIES) {
    const queryText = String(item.queryText || '').replace(/\s+/g, ' ').trim();
    if (!queryText) return;
    const key = `${queryText.toLowerCase()}::${String(item.sourcePlatform || 'google').toLowerCase()}`;
    if (seenText.has(key)) return;
    if (out.length >= maxQueries) return;
    seenText.add(key);
    out.push({
        queryText,
        priorityScore: Number(item.priorityScore) || 50,
        businessType: item.businessType || '',
        relatedKeyword: item.relatedKeyword || '',
        locationLabel: item.locationLabel || '',
        locationScope: item.locationScope || '',
        queryLanguage: item.queryLanguage || 'en',
        translatedQuery: item.translatedQuery || '',
        sourcePlatform: item.sourcePlatform || 'google',
        recommended: Boolean(item.recommended),
        enabled: item.enabled !== false,
        isAlternate: Boolean(item.isAlternate),
        isExpansion: Boolean(item.isExpansion),
        ownerDisplayLabel: item.ownerDisplayLabel || '',
    });
}

function translateProductToChinese(product) {
    const raw = normalizeDisplay(product);
    if (!raw) return '';
    // Already Chinese (or mixed with CJK) — preserve original Unicode product text.
    if (/[\u4e00-\u9fff]/.test(raw)) return raw;
    const key = raw.toLowerCase();
    if (CN_PRODUCT_GLOSSARY[key]) return CN_PRODUCT_GLOSSARY[key];
    // Prefer known token replacements inside longer phrases
    let out = key;
    for (const [en, zh] of Object.entries(CN_PRODUCT_GLOSSARY)) {
        if (out.includes(en)) out = out.replace(en, zh);
    }
    if (out !== key && /[\u4e00-\u9fff]/.test(out)) return out.replace(/\s+/g, '');
    return '';
}

function chinaPhraseForBusinessType(btId) {
    const id = String(btId || '').toLowerCase();
    if (id.includes('oem')) return 'OEM ODM';
    if (id.includes('brand')) return '品牌商';
    if (id.includes('supplier')) return '供应商';
    if (id.includes('manufacturer')) return '厂家';
    return '厂家';
}

/**
 * Parse expandCities / expandStates / selectedStates from array or comma-separated string.
 * Trims, drops empties, dedupes (case-insensitive).
 */
export function parseLocationExpandList(raw) {
    if (raw == null || raw === '') return [];
    const list = Array.isArray(raw)
        ? raw
        : String(raw).split(/[,，;；|]/).map((s) => s.trim());
    const out = [];
    const seen = new Set();
    for (const item of list) {
        const s = normalizeDisplay(item);
        if (!s) continue;
        const k = s.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(s);
    }
    return out;
}

/**
 * Legacy CP5B path — all phrase templates when businessTypes not provided.
 */
function buildLegacyQueries({ product, city, state, country, excludeKeywords }) {
    const productRaw = normalizeDisplay(product);
    if (!productRaw) return [];
    const productLower = productRaw.toLowerCase();
    const cityN = normalizeDisplay(city);
    const stateN = normalizeDisplay(state);
    const countryN = normalizeDisplay(country);

    let location = '';
    if (cityN && stateN) location = `${cityN}`;
    else if (cityN) location = cityN;
    else if (stateN) location = stateN;
    else if (countryN) location = countryN;

    const exSuffix = buildExclusionSuffix(excludeKeywords, { legacy: true });
    const templates = buildPhraseTemplates(productLower);
    const out = [];
    const seenText = new Set();

    for (const t of templates) {
        if (t.skipIfDuplicateCompanies) continue;
        let phrase;
        if (t.replaceProduct && t.suffix === 'smart home companies') {
            phrase = location ? `smart home companies ${location}` : 'smart home companies';
        } else {
            phrase = location ? `${productLower} ${t.suffix} ${location}` : `${productLower} ${t.suffix}`;
        }
        pushQuery(out, seenText, {
            queryText: `${phrase}${exSuffix}`,
            priorityScore: t.priorityScore,
            businessType: t.suffix === 'manufacturers' ? 'Manufacturer' : '',
            locationLabel: location,
            locationScope: cityN ? 'city' : (stateN ? 'state' : (countryN ? 'country' : 'worldwide')),
            queryLanguage: 'en',
            recommended: t.priorityScore === 100,
        });
    }
    if (out[0]) out[0].recommended = true;
    return out;
}

function rowToQuery(row, extras) {
    return {
        queryText: `${row.core}${extras.exSuffix}`,
        priorityScore: row.priorityScore,
        businessType: extras.businessType,
        locationLabel: extras.location,
        locationScope: extras.locationScope,
        queryLanguage: 'en',
        sourcePlatform: extras.sourcePlatform,
        recommended: false,
        ownerDisplayLabel: extras.ownerDisplayLabel,
        isAlternate: Boolean(row.isAlternate),
    };
}

function buildPrimaryBusinessTypeQueries({
    productLower,
    productDisplay,
    businessTypes,
    location,
    locationScope,
    exSuffix,
    sourcePlatform,
}) {
    const planned = [];
    const types = businessTypes.map(resolveBusinessType).filter(Boolean);
    types.sort((a, b) => Number(b.priorityScore) - Number(a.priorityScore));
    const typeIds = types.map((t) => t.id);
    const ownerDisplayLabel = formatSimpleSearchLabel(productDisplay || productLower, typeIds, location);
    const extras = { exSuffix, location, locationScope, sourcePlatform, ownerDisplayLabel };

    if (types.length === 1 && /manufacturer/i.test(types[0].id)) {
        return buildManufacturerSearchPhrases({ product: productLower, location }).map((row, i) => ({
            queryText: `${row.core}${exSuffix}`,
            priorityScore: row.priorityScore,
            businessType: 'Manufacturer',
            locationLabel: location,
            locationScope,
            queryLanguage: 'en',
            sourcePlatform,
            recommended: i === 0,
            ownerDisplayLabel,
            isAlternate: i > 0,
        }));
    }

    const hasMfr = types.some((t) => /manufacturer/i.test(t.id));
    const hasExporter = types.some((t) => /exporter/i.test(t.id));
    if (hasMfr) {
        buildManufacturerSearchPhrases({ product: productLower, location }).forEach((row, i) => {
            planned.push(rowToQuery({ ...row, isAlternate: i > 0 }, { ...extras, businessType: 'Manufacturer' }));
        });
    }
    for (const t of types) {
        if (/manufacturer/i.test(t.id)) continue;
        const extra = buildTypeSearchPhrases({ product: productLower, location, businessType: t.id });
        if (extra.length) {
            extra.forEach((row) => {
                planned.push(rowToQuery(row, { ...extras, businessType: t.id }));
            });
            continue;
        }
        const core = t.phrase ? `${productLower} ${t.phrase}` : productLower;
        const phrase = location ? `${core} ${location}` : core;
        planned.push({
            queryText: `${phrase}${exSuffix}`,
            priorityScore: t.priorityScore,
            businessType: t.id,
            locationLabel: location,
            locationScope,
            queryLanguage: 'en',
            sourcePlatform,
            recommended: false,
            ownerDisplayLabel,
        });
    }
    if (hasMfr && hasExporter) {
        buildCombinedManufacturerExporterPhrase({ product: productLower, location }).forEach((row) => {
            planned.push(rowToQuery(row, { ...extras, businessType: 'Manufacturer' }));
        });
    }
    if (planned[0]) planned[0].recommended = true;
    return planned;
}

function buildKeywordQueries({
    productLower,
    relatedKeywords,
    businessTypes,
    location,
    locationScope,
    exSuffix,
    sourcePlatform,
}) {
    if (!relatedKeywords.length || !businessTypes.length) return [];
    const primary = resolveBusinessType(businessTypes[0]) || BUSINESS_TYPE_OPTIONS[0];
    const planned = [];
    let score = 50;
    for (const kw of relatedKeywords) {
        const kwLower = kw.toLowerCase();
        // Prefer keyword as product focus with primary business type
        const phrase = location
            ? `${kwLower} ${primary.phrase} ${location}`
            : `${kwLower} ${primary.phrase}`;
        planned.push({
            queryText: `${phrase}${exSuffix}`,
            priorityScore: score,
            businessType: primary.id,
            relatedKeyword: kw,
            locationLabel: location,
            locationScope,
            queryLanguage: 'en',
            sourcePlatform,
            isAlternate: true,
        });
        score = Math.max(40, score - 2);

        // Optional combined product+keyword for a second business type when available
        if (businessTypes.length > 1 && planned.length < relatedKeywords.length * 2) {
            const secondary = resolveBusinessType(businessTypes[1]);
            if (secondary) {
                const combo = location
                    ? `${kwLower} ${productLower} ${secondary.phrase} ${location}`
                    : `${kwLower} ${productLower} ${secondary.phrase}`;
                planned.push({
                    queryText: `${combo}${exSuffix}`,
                    priorityScore: score,
                    businessType: secondary.id,
                    relatedKeyword: kw,
                    locationLabel: location,
                    locationScope,
                    queryLanguage: 'en',
                    sourcePlatform,
                    isAlternate: true,
                });
                score = Math.max(38, score - 2);
            }
        }
    }
    return planned;
}

function buildExpansionCityQueries({
    productLower,
    businessTypes,
    expandCities,
    locationScope,
    exSuffix,
    sourcePlatform,
}) {
    const cities = (expandCities || []).map(normalizeDisplay).filter(Boolean);
    if (!cities.length) return [];
    const types = businessTypes.map(resolveBusinessType).filter(Boolean).slice(0, 2);
    const planned = [];
    let score = 45;
    for (const cityName of cities) {
        for (const t of types) {
            planned.push({
                queryText: `${productLower} ${t.phrase} ${cityName}${exSuffix}`,
                priorityScore: score,
                businessType: t.id,
                locationLabel: cityName,
                locationScope: 'city',
                queryLanguage: 'en',
                sourcePlatform,
                isExpansion: true,
                isAlternate: true,
            });
            score = Math.max(30, score - 1);
        }
    }
    return planned;
}

function buildWorldwideExtras({ productLower, businessTypes, exSuffix, sourcePlatform }) {
    const manufacturer = businessTypes.map(resolveBusinessType).find((t) => /manufacturer/i.test(t?.id || ''));
    const supplier = businessTypes.map(resolveBusinessType).find((t) => /supplier/i.test(t?.id || ''));
    const planned = [];
    if (manufacturer) {
        planned.push({
            queryText: `global ${productLower} manufacturers${exSuffix}`,
            priorityScore: 48,
            businessType: manufacturer.id,
            locationLabel: 'Worldwide',
            locationScope: 'worldwide',
            queryLanguage: 'en',
            sourcePlatform,
            isAlternate: true,
        });
    }
    if (supplier) {
        planned.push({
            queryText: `international ${productLower} suppliers${exSuffix}`,
            priorityScore: 46,
            businessType: supplier.id,
            locationLabel: 'Worldwide',
            locationScope: 'worldwide',
            queryLanguage: 'en',
            sourcePlatform,
            isAlternate: true,
        });
    }
    return planned;
}

function parseChinaProductPhrases(product) {
    const parts = String(product || '').split(/[,;，、|/]+/).map((s) => normalizeDisplay(s)).filter(Boolean);
    return parts.length ? parts : [];
}

function chinaPreferredBusinessTypes(types) {
    const list = Array.isArray(types) ? types.filter(Boolean) : [];
    const core = list.filter((t) => {
        const id = String(t.id || '').toLowerCase();
        if (/system integrator|consultant|contractor|service provider/.test(id)) return false;
        if (id === 'provider') return false;
        return /manufacturer|oem|odm|supplier|factory|distributor/.test(id);
    });
    return core.length ? core : list.slice(0, 2);
}

function chinaSwitchShorthand(phrase) {
    const p = String(phrase || '');
    if (/开关/.test(p)) return '智能开关';
    return p;
}

function china1688RelatedTerm(keyword, phrases) {
    const kw = normalizeDisplay(keyword);
    if (!kw) return '';
    const base = chinaSwitchShorthand(phrases[0] || '');
    if (!base) return kw;
    if (/[\u4e00-\u9fff]/.test(kw)) return `${kw}${base}`;
    return `${kw}${base}`;
}

function chinaHasCjk(text) {
    return /[\u4e00-\u9fff]/.test(String(text || ''));
}

function buildChinaQueries({
    product,
    relatedKeywords,
    businessTypes,
    country,
    exSuffix,
    expandStates = [],
}) {
    const productRaw = normalizeDisplay(product);
    const phrases = parseChinaProductPhrases(productRaw);
    const countryN = normalizeDisplay(country) || 'China';
    const types = chinaPreferredBusinessTypes(
        (businessTypes.length ? businessTypes : ['Manufacturer', 'OEM / ODM', 'Supplier'])
            .map(resolveBusinessType)
            .filter(Boolean),
    );
    const kws = (relatedKeywords || []).map((k) => normalizeDisplay(k)).filter(Boolean).slice(0, 6);
    const planned = [];
    const cities = ['深圳', '东莞', '广州', '杭州'];

    let pri = 100;
    for (const p of phrases) {
        const preserved = chinaHasCjk(p) ? p : (translateProductToChinese(p) || p);
        pushChinaItem(planned, {
            queryText: preserved,
            translatedQuery: `${p} 1688`,
            priorityScore: pri--,
            businessType: 'Supplier',
            relatedKeyword: p,
            locationLabel: countryN,
            sourcePlatform: '1688',
        });
    }
    for (const kw of kws.slice(0, 4)) {
        const text = china1688RelatedTerm(kw, phrases);
        if (!text) continue;
        pushChinaItem(planned, {
            queryText: text,
            translatedQuery: `${kw} 1688`,
            priorityScore: pri--,
            businessType: 'Supplier',
            relatedKeyword: kw,
            locationLabel: countryN,
            sourcePlatform: '1688',
            isAlternate: true,
        });
    }

    pri = 89;
    const baiduRoles = ['厂家', '生产厂家', '供应商'];
    phrases.forEach((p, idx) => {
        const preserved = chinaHasCjk(p) ? p : (translateProductToChinese(p) || p);
        for (const role of baiduRoles) {
            pushChinaItem(planned, {
                queryText: `${preserved} ${role}`,
                translatedQuery: `${p} ${role}`,
                priorityScore: pri--,
                businessType: chinaBusinessRole(role),
                relatedKeyword: p,
                locationLabel: countryN,
                sourcePlatform: 'baidu',
                isAlternate: true,
            });
        }
        const city = cities[idx % cities.length];
        pushChinaItem(planned, {
            queryText: `${preserved} ${city} 厂家`,
            translatedQuery: `${p} ${city} factory`,
            priorityScore: pri--,
            businessType: 'Manufacturer',
            relatedKeyword: p,
            locationLabel: city,
            locationScope: 'city',
            sourcePlatform: 'baidu',
            isAlternate: true,
        });
        if (types.some((t) => /oem/i.test(t.id))) {
            pushChinaItem(planned, {
                queryText: `${preserved} OEM`,
                translatedQuery: `${p} OEM`,
                priorityScore: pri--,
                businessType: 'OEM / ODM',
                relatedKeyword: p,
                locationLabel: countryN,
                sourcePlatform: 'baidu',
                isAlternate: true,
            });
        }
    });
    for (const kw of kws.slice(0, 4)) {
        const p = chinaHasCjk(phrases[0] || '') ? phrases[0] : (translateProductToChinese(phrases[0] || '') || phrases[0] || '');
        if (!p) continue;
        const joined = chinaHasCjk(kw) ? `${kw}${p} 厂家` : `${kw}${p} 厂家`;
        pushChinaItem(planned, {
            queryText: joined,
            translatedQuery: `${kw} ${p} factory`,
            priorityScore: pri--,
            businessType: 'Manufacturer',
            relatedKeyword: kw,
            locationLabel: countryN,
            sourcePlatform: 'baidu',
            isAlternate: true,
        });
    }

    pri = 69;
    for (const p of phrases) {
        const preserved = chinaHasCjk(p) ? p : (translateProductToChinese(p) || p);
        for (const role of baiduRoles.slice(0, 2)) {
            pushChinaItem(planned, {
                queryText: `${preserved} ${role}`,
                translatedQuery: `${p} Sogou`,
                priorityScore: pri--,
                businessType: chinaBusinessRole(role),
                relatedKeyword: p,
                locationLabel: countryN,
                sourcePlatform: 'sogou',
                isAlternate: true,
            });
        }
    }

    pri = 61;
    for (const p of phrases) {
        const preserved = chinaHasCjk(p) ? p : (translateProductToChinese(p) || p);
        for (const role of ['厂家', '供应商']) {
            pushChinaItem(planned, {
                queryText: `${preserved} ${role}`,
                translatedQuery: `${p} 360 Search`,
                priorityScore: pri--,
                businessType: chinaBusinessRole(role),
                relatedKeyword: p,
                locationLabel: countryN,
                sourcePlatform: 'so360',
                isAlternate: true,
            });
        }
    }

    pri = 50;
    for (const p of phrases) {
        const q = chinaHasCjk(p) ? p : `"${p.replace(/"/g, '')}"`;
        pushChinaItem(planned, {
            queryText: `site:alibaba.com ${q}`,
            translatedQuery: `${p} Alibaba indexed`,
            priorityScore: pri--,
            businessType: 'Supplier',
            relatedKeyword: p,
            locationLabel: countryN,
            queryLanguage: chinaHasCjk(p) ? 'zh' : 'en',
            sourcePlatform: 'alibaba',
            isAlternate: true,
        });
        pushChinaItem(planned, {
            queryText: `site:made-in-china.com ${q}`,
            translatedQuery: `${p} Made-in-China indexed`,
            priorityScore: pri--,
            businessType: 'Manufacturer',
            relatedKeyword: p,
            locationLabel: countryN,
            queryLanguage: chinaHasCjk(p) ? 'zh' : 'en',
            sourcePlatform: 'made_in_china',
            isAlternate: true,
        });
        pushChinaItem(planned, {
            queryText: `site:globalsources.com ${q}`,
            translatedQuery: `${p} Global Sources indexed`,
            priorityScore: pri--,
            businessType: 'Supplier',
            relatedKeyword: p,
            locationLabel: countryN,
            queryLanguage: chinaHasCjk(p) ? 'zh' : 'en',
            sourcePlatform: 'global_sources',
            isAlternate: true,
        });
    }

    pri = 40;
    for (const p of phrases) {
        const preserved = chinaHasCjk(p) ? p : p;
        pushChinaItem(planned, {
            queryText: `${preserved} manufacturer ${countryN}${exSuffix}`,
            priorityScore: pri--,
            businessType: 'Manufacturer',
            relatedKeyword: p,
            locationLabel: countryN,
            queryLanguage: chinaHasCjk(preserved) ? 'zh' : 'en',
            sourcePlatform: 'google_global',
            isAlternate: true,
        });
        pushChinaItem(planned, {
            queryText: `${preserved} supplier ${countryN}${exSuffix}`,
            priorityScore: pri--,
            businessType: 'Supplier',
            relatedKeyword: p,
            locationLabel: countryN,
            queryLanguage: chinaHasCjk(preserved) ? 'zh' : 'en',
            sourcePlatform: 'google_global',
            isAlternate: true,
        });
    }

    const states = parseLocationExpandList(expandStates);
    if (states.length) {
        const expandTypes = types.slice(0, 2);
        const expandPhrase = phrases[0] || productRaw;
        for (const st of states) {
            for (const t of expandTypes) {
                pushChinaItem(planned, {
                    queryText: `${expandPhrase} ${t.phrase} ${st} ${countryN}${exSuffix}`,
                    translatedQuery: `${expandPhrase} ${t.phrase} ${st}`,
                    priorityScore: Math.min(t.priorityScore || 48, 48),
                    businessType: t.id,
                    relatedKeyword: expandPhrase,
                    locationLabel: st,
                    locationScope: 'state',
                    queryLanguage: chinaHasCjk(expandPhrase) ? 'zh' : 'en',
                    sourcePlatform: 'google_global',
                    isExpansion: true,
                    isAlternate: true,
                });
            }
        }
    }

    if (planned[0]) planned[0].recommended = true;
    return planned;
}

function chinaBusinessRole(text) {
    if (/厂家|制造商|工厂|生产/.test(text)) return 'Manufacturer';
    if (/经销商|代理商/.test(text)) return 'Distributor';
    return 'Supplier';
}

function native1688TermsForModel(model) {
    const u = String(model || '').toUpperCase();
    const spec = modelSpecialty(model);
    if (u === 'ZT2S') return [`${model} 模组`, `${model} 涂鸦`, `${model} Zigbee 模组`];
    if (u === 'BT2S') return [`${model} 模组`, `${model} 蓝牙模组`, `${model} 涂鸦`];
    if (u === 'BTC') return [`${model} 蓝牙模组`];
    if (u === 'ZTC') return [`${model} Zigbee 模组`];
    const out = [`${model} 模组`];
    if (spec.bluetooth) out.push(`${model} 蓝牙模组`);
    if (spec.zigbee) out.push(`${model} Zigbee 模组`);
    return out;
}

function nativeBaiduTermsForModel(model) {
    const u = String(model || '').toUpperCase();
    if (u === 'ZT2S') {
        return [
            `${model} 模组`, `${model} 涂鸦`, `${model} 供应商`, `${model} 厂家`,
            `${model} 生产厂家`, `${model} Zigbee 模组`, `${model} 深圳 供应商`, `${model} 东莞 厂家`,
            `${model} 广州 厂家`, `${model} 杭州 供应商`, `${model} 宁波 厂家`,
        ];
    }
    if (u === 'BT2S') {
        return [
            `${model} 蓝牙模组`, `${model} 涂鸦`, `${model} 供应商`, `${model} 厂家`,
            `${model} 生产厂家`, `${model} 深圳 蓝牙模组`, `${model} 东莞 厂家`, `${model} 广州 蓝牙模组`,
        ];
    }
    if (u === 'BTC') {
        return [
            `${model} 蓝牙模组`, `${model} 供应商`, `${model} 厂家`, `${model} 蓝牙模组 供应商`,
            `${model} 深圳 蓝牙模组`,
        ];
    }
    if (u === 'ZTC') {
        return [
            `${model} Zigbee 模组`, `${model} 供应商`, `${model} 厂家`,
            `${model} 杭州 Zigbee 模组`, `${model} 深圳 厂家`,
        ];
    }
    const spec = modelSpecialty(model);
    const out = [`${model} 模组`, `${model} 供应商`, `${model} 厂家`];
    if (spec.bluetooth) out.push(`${model} 蓝牙模组`);
    if (spec.zigbee) out.push(`${model} Zigbee 模组`);
    return out;
}

function pushChinaItem(planned, {
    queryText, translatedQuery, priorityScore, businessType, relatedKeyword,
    locationLabel, locationScope, queryLanguage, sourcePlatform, isAlternate, isExpansion,
}) {
    planned.push({
        queryText,
        translatedQuery: translatedQuery || '',
        priorityScore,
        businessType,
        relatedKeyword: relatedKeyword || '',
        locationLabel: locationLabel || '',
        locationScope: locationScope || 'country',
        queryLanguage: queryLanguage || 'zh',
        sourcePlatform,
        isAlternate: Boolean(isAlternate),
        isExpansion: Boolean(isExpansion),
    });
}

/**
 * China native-first families for NEW campaigns only.
 * Order: 1688 → Baidu → Sogou → 360 → indexed B2B → Google Web (secondary).
 * site:1688.com remains Google-indexed discovery, never direct 1688.
 */
function buildChinaModelQueries({
    models,
    country = 'China',
    expandCities = [],
    excludeKeywords,
    city = '',
    state = '',
} = {}) {
    const countryN = normalizeDisplay(country) || 'China';
    const planned = [];
    const exSuffix = buildExclusionSuffix(excludeKeywords, { skipJobStyle: true });
    void expandCities;
    void city;
    void state;

    let pri = 100;
    for (const model of models) {
        for (const text of native1688TermsForModel(model)) {
            pushChinaItem(planned, {
                queryText: text,
                translatedQuery: `${model} module 1688`,
                priorityScore: pri--,
                businessType: chinaBusinessRole(text),
                relatedKeyword: model,
                locationLabel: countryN,
                sourcePlatform: '1688',
            });
        }
    }

    pri = 89;
    for (const model of models) {
        for (const text of nativeBaiduTermsForModel(model)) {
            pushChinaItem(planned, {
                queryText: text,
                translatedQuery: `${quoteModel(model)} supplier China`,
                priorityScore: pri--,
                businessType: chinaBusinessRole(text),
                relatedKeyword: model,
                locationLabel: /深圳/.test(text) ? 'Shenzhen' : (/东莞/.test(text) ? 'Dongguan' : (/杭州/.test(text) ? 'Hangzhou' : countryN)),
                locationScope: /深圳|东莞|广州|杭州|宁波/.test(text) ? 'city' : 'country',
                sourcePlatform: 'baidu',
                isExpansion: /深圳|东莞|广州|杭州|宁波/.test(text),
                isAlternate: true,
            });
        }
    }

    pri = 69;
    for (const model of models) {
        const terms = nativeBaiduTermsForModel(model).slice(0, 2);
        for (const text of terms) {
            pushChinaItem(planned, {
                queryText: text,
                translatedQuery: `${quoteModel(model)} Sogou`,
                priorityScore: pri--,
                businessType: chinaBusinessRole(text),
                relatedKeyword: model,
                locationLabel: countryN,
                sourcePlatform: 'sogou',
                isAlternate: true,
            });
        }
    }

    pri = 61;
    for (const model of models) {
        const terms = nativeBaiduTermsForModel(model).slice(0, 2);
        for (const text of terms) {
            pushChinaItem(planned, {
                queryText: text,
                translatedQuery: `${quoteModel(model)} 360 Search`,
                priorityScore: pri--,
                businessType: chinaBusinessRole(text),
                relatedKeyword: model,
                locationLabel: countryN,
                sourcePlatform: 'so360',
                isAlternate: true,
            });
        }
    }

    pri = 50;
    for (const model of models) {
        const q = quoteModel(model);
        pushChinaItem(planned, {
            queryText: `site:alibaba.com ${q}`,
            translatedQuery: `${q} Alibaba indexed`,
            priorityScore: pri--,
            businessType: 'Supplier',
            relatedKeyword: model,
            locationLabel: countryN,
            queryLanguage: 'en',
            sourcePlatform: 'alibaba',
            isAlternate: true,
        });
        pushChinaItem(planned, {
            queryText: `site:made-in-china.com ${q}`,
            translatedQuery: `${q} Made-in-China indexed`,
            priorityScore: pri--,
            businessType: 'Manufacturer',
            relatedKeyword: model,
            locationLabel: countryN,
            queryLanguage: 'en',
            sourcePlatform: 'made_in_china',
            isAlternate: true,
        });
        pushChinaItem(planned, {
            queryText: `site:globalsources.com ${q}`,
            translatedQuery: `${q} Global Sources indexed`,
            priorityScore: pri--,
            businessType: 'Supplier',
            relatedKeyword: model,
            locationLabel: countryN,
            queryLanguage: 'en',
            sourcePlatform: 'global_sources',
            isAlternate: true,
        });
        pushChinaItem(planned, {
            queryText: `site:1688.com ${q}`,
            translatedQuery: `${q} 1688 via Google index`,
            priorityScore: pri--,
            businessType: 'Supplier',
            relatedKeyword: model,
            locationLabel: countryN,
            queryLanguage: 'zh',
            sourcePlatform: 'google_global',
            isAlternate: true,
        });
    }

    pri = 40;
    for (const model of models) {
        const q = quoteModel(model);
        pushChinaItem(planned, {
            queryText: `${q} manufacturer ${countryN}${exSuffix}`,
            priorityScore: pri--,
            businessType: 'Manufacturer',
            relatedKeyword: model,
            locationLabel: countryN,
            queryLanguage: 'en',
            sourcePlatform: 'google_global',
            isAlternate: true,
        });
        pushChinaItem(planned, {
            queryText: `${q} supplier ${countryN}${exSuffix}`,
            priorityScore: pri--,
            businessType: 'Supplier',
            relatedKeyword: model,
            locationLabel: countryN,
            queryLanguage: 'en',
            sourcePlatform: 'google_global',
            isAlternate: true,
        });
    }

    if (planned[0]) planned[0].recommended = true;
    return planned;
}

function buildSplitModelQueries({
    models,
    location,
    locationScope,
    excludeKeywords,
    sourcePlatform,
}) {
    const planned = [];
    const exSuffix = buildExclusionSuffix(excludeKeywords, { skipJobStyle: true });
    let score = 100;
    for (const model of models) {
        const q = quoteModel(model);
        const loc = location ? ` ${location}` : '';
        planned.push({
            queryText: `${q} manufacturer${loc}${exSuffix}`,
            priorityScore: score,
            businessType: 'Manufacturer',
            relatedKeyword: model,
            locationLabel: location,
            locationScope,
            queryLanguage: 'en',
            sourcePlatform,
        });
        planned.push({
            queryText: `${q} supplier${loc}${exSuffix}`,
            priorityScore: score - 4,
            businessType: 'Supplier',
            relatedKeyword: model,
            locationLabel: location,
            locationScope,
            queryLanguage: 'en',
            sourcePlatform,
            isAlternate: true,
        });
        score = Math.max(60, score - 8);
    }
    if (planned[0]) planned[0].recommended = true;
    return planned;
}

/**
 * @returns {Array<object>} planned queries (max MAX_GENERATED_QUERIES)
 */
export function buildSimpleQueries({
    product,
    city,
    state,
    country,
    excludeKeywords,
    businessTypes,
    relatedKeywords,
    locationScope,
    searchMarket,
    expandCities,
    expandStates,
    includeAlternates = true,
    worldwide,
} = {}) {
    const productRaw = normalizeDisplay(product);
    if (!productRaw) return [];

    const models = parseProductModels(productRaw);
    const countryHint = normalizeDisplay(country);
    const chinaHint = isChinaCountry(countryHint)
        || normalizeDisplay(searchMarket || '').toLowerCase() === 'china_suppliers';

    if (models.length && chinaHint) {
        const planned = buildChinaModelQueries({
            models,
            country: isChinaCountry(countryHint) ? countryHint : 'China',
            expandCities,
            excludeKeywords,
            city,
            state,
        });
        const out = [];
        const seen = new Set();
        for (const q of planned) pushQuery(out, seen, q, MAX_MODEL_CHINA_QUERIES);
        if (out[0]) {
            out.forEach((q) => { q.recommended = false; });
            out[0].recommended = true;
        }
        return out;
    }

    if (models.length >= 2) {
        const scopeEarly = inferLocationScope({ locationScope, city, state, country, worldwide });
        const locEarly = buildLocationPhrase({
            locationScope: scopeEarly,
            city: normalizeDisplay(city),
            state: normalizeDisplay(state),
            country: normalizeDisplay(country),
            worldwide: scopeEarly === 'worldwide',
        });
        const planned = buildSplitModelQueries({
            models,
            location: locEarly,
            locationScope: scopeEarly,
            excludeKeywords,
            sourcePlatform: 'google',
        });
        const out = [];
        const seen = new Set();
        for (const q of planned) pushQuery(out, seen, q, MAX_MODEL_CHINA_QUERIES);
        return out;
    }

    const typesProvided = businessTypes != null
        && ((Array.isArray(businessTypes) && businessTypes.length > 0)
            || (typeof businessTypes === 'string' && normalizeDisplay(businessTypes)));

    // Legacy CP5B: no businessTypes → full template set
    if (!typesProvided && searchMarket == null && locationScope == null && relatedKeywords == null) {
        return buildLegacyQueries({ product, city, state, country, excludeKeywords });
    }

    const types = normalizeBusinessTypes(
        typesProvided ? businessTypes : DEFAULT_BUSINESS_TYPES,
    );
    const keywords = parseRelatedKeywords(relatedKeywords);
    const market = normalizeDisplay(searchMarket || 'india_global_web').toLowerCase() || 'india_global_web';
    const scope = inferLocationScope({ locationScope, city, state, country, worldwide });
    const locCheck = validateLocationForScope({
        locationScope: scope,
        city,
        state,
        country: market === 'china_suppliers' && !normalizeDisplay(country) ? 'China' : country,
    });
    const cityN = locCheck.city || normalizeDisplay(city);
    const stateN = locCheck.state || normalizeDisplay(state);
    let countryN = locCheck.country || normalizeDisplay(country);
    if (market === 'china_suppliers' && !countryN) countryN = 'China';

    const exSuffix = buildExclusionSuffix(excludeKeywords);
    const sourcePlatform = market === 'china_suppliers' ? 'google_global' : 'google';

    if (market === 'china_suppliers') {
        const china = buildChinaQueries({
            product: productRaw,
            relatedKeywords: keywords,
            businessTypes: types,
            country: countryN,
            exSuffix,
            expandStates,
        });
        if (china.length > MAX_MODEL_CHINA_QUERIES) {
            throw new ApiError(
                400,
                `This selection creates ${china.length} queries. Please reduce business types or states.`,
            );
        }
        const out = [];
        const seen = new Set();
        for (const q of china) pushQuery(out, seen, q, MAX_MODEL_CHINA_QUERIES);
        if (out[0]) {
            out.forEach((q) => { q.recommended = false; });
            out[0].recommended = true;
        }
        return out;
    }

    const location = buildLocationPhrase({
        locationScope: scope,
        city: cityN,
        state: stateN,
        country: countryN,
        worldwide: scope === 'worldwide',
    });

    const productLower = productRaw.toLowerCase();
    const chunks = [
        ...buildPrimaryBusinessTypeQueries({
            productLower,
            productDisplay: productRaw,
            businessTypes: types,
            location,
            locationScope: scope,
            exSuffix,
            sourcePlatform,
        }),
    ];

    if (includeAlternates) {
        chunks.push(...buildKeywordQueries({
            productLower,
            relatedKeywords: keywords,
            businessTypes: types,
            location,
            locationScope: scope,
            exSuffix,
            sourcePlatform,
        }));
    }

    if (scope === 'state' && Array.isArray(expandCities) && expandCities.length) {
        chunks.push(...buildExpansionCityQueries({
            productLower,
            businessTypes: types,
            expandCities,
            locationScope: scope,
            exSuffix,
            sourcePlatform,
        }));
    }

    if (scope === 'country' && Array.isArray(expandStates) && expandStates.length) {
        for (const st of expandStates.map(normalizeDisplay).filter(Boolean)) {
            chunks.push(...buildPrimaryBusinessTypeQueries({
                productLower,
                productDisplay: productRaw,
                businessTypes: types.slice(0, 2),
                location: st,
                locationScope: 'state',
                exSuffix,
                sourcePlatform,
            }).map((q) => ({ ...q, isExpansion: true, isAlternate: true, priorityScore: Math.min(q.priorityScore, 44) })));
        }
    }

    if (scope === 'worldwide' && includeAlternates) {
        chunks.push(...buildWorldwideExtras({
            productLower,
            businessTypes: types,
            exSuffix,
            sourcePlatform,
        }));
    }

    const out = [];
    const seen = new Set();
    for (const q of chunks) pushQuery(out, seen, q);
    // Ensure exactly one recommended
    out.forEach((q) => { q.recommended = false; });
    if (out[0]) out[0].recommended = true;
    const ownerLabel = formatSimpleSearchLabel(productRaw, types, location);
    out.forEach((q) => {
        q.ownerDisplayLabel = ownerLabel;
    });
    return out;
}

export function estimateQueryCount(args = {}) {
    return buildSimpleQueries(args).length;
}

export function suggestMajorCitiesForState(state) {
    const key = normalizeDisplay(state).toLowerCase();
    return MAJOR_CITIES_BY_STATE[key] ? [...MAJOR_CITIES_BY_STATE[key]] : [];
}

export function businessTypesMatchKey(types = []) {
    return normalizeBusinessTypes(types).map((t) => t.toLowerCase()).sort().join('|');
}

export function relatedKeywordsMatchKey(keywords = []) {
    return parseRelatedKeywords(keywords).map((k) => k.toLowerCase()).sort().join('|');
}
