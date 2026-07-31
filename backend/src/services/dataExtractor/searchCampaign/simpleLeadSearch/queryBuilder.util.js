import { ApiError } from '../../../../utils/ApiError.js';

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
    { id: 'alibaba', label: 'Alibaba', implemented: false },
    { id: '1688', label: '1688', implemented: false },
    { id: 'made_in_china', label: 'Made-in-China', implemented: false },
    { id: 'global_sources', label: 'Global Sources', implemented: false },
    { id: 'baidu', label: 'Baidu', implemented: false },
    { id: 'chinese_company_websites', label: 'Chinese Company Websites', implemented: false },
    { id: 'google_global', label: 'Google Global Results', implemented: true },
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

export const MAX_GENERATED_QUERIES = 24;
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

function buildExclusionSuffix(excludeKeywords, { legacy = false } = {}) {
    const base = legacy ? LEGACY_EXCLUSIONS : SAFE_EXCLUSIONS;
    const extraExcludes = Array.isArray(excludeKeywords)
        ? excludeKeywords.map((k) => normalizeDisplay(k)).filter(Boolean).map((k) => (k.startsWith('-') ? k : `-${k}`))
        : [];
    const exclusions = [...base, ...extraExcludes];
    const seenEx = new Set();
    const exParts = [];
    for (const e of exclusions) {
        const key = e.toLowerCase();
        if (seenEx.has(key)) continue;
        seenEx.add(key);
        exParts.push(e);
    }
    return exParts.length ? ` ${exParts.join(' ')}` : '';
}

function pushQuery(out, seenText, item) {
    const queryText = String(item.queryText || '').replace(/\s+/g, ' ').trim();
    if (!queryText) return;
    const key = queryText.toLowerCase();
    if (seenText.has(key)) return;
    if (out.length >= MAX_GENERATED_QUERIES) return;
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

function buildPrimaryBusinessTypeQueries({
    productLower,
    businessTypes,
    location,
    locationScope,
    exSuffix,
    sourcePlatform,
}) {
    const planned = [];
    const types = businessTypes.map(resolveBusinessType).filter(Boolean);
    types.sort((a, b) => Number(b.priorityScore) - Number(a.priorityScore));
    for (const t of types) {
        const phrase = location
            ? `${productLower} ${t.phrase} ${location}`
            : `${productLower} ${t.phrase}`;
        planned.push({
            queryText: `${phrase}${exSuffix}`,
            priorityScore: t.priorityScore,
            businessType: t.id,
            locationLabel: location,
            locationScope,
            queryLanguage: 'en',
            sourcePlatform,
            recommended: false,
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

function buildChinaQueries({
    product,
    relatedKeywords,
    businessTypes,
    country,
    exSuffix,
    expandStates = [],
}) {
    const productRaw = normalizeDisplay(product);
    const productLower = productRaw.toLowerCase();
    const countryN = normalizeDisplay(country) || 'China';
    const types = (businessTypes.length ? businessTypes : ['Manufacturer', 'OEM / ODM'])
        .map(resolveBusinessType)
        .filter(Boolean);
    const planned = [];
    const sourcePlatform = 'google_global';
    const states = parseLocationExpandList(expandStates);

    for (const t of types) {
        planned.push({
            queryText: `${productRaw} ${t.phrase} ${countryN}${exSuffix}`,
            priorityScore: t.priorityScore,
            businessType: t.id,
            locationLabel: countryN,
            locationScope: 'country',
            queryLanguage: 'en',
            sourcePlatform,
        });
    }

    for (const kw of relatedKeywords) {
        const kwDisp = normalizeDisplay(kw);
        const primary = types[0];
        planned.push({
            queryText: `${kwDisp} ${primary.phrase} ${countryN}${exSuffix}`,
            priorityScore: 55,
            businessType: primary.id,
            relatedKeyword: kw,
            locationLabel: countryN,
            locationScope: 'country',
            queryLanguage: 'en',
            sourcePlatform,
            isAlternate: true,
        });
    }

    // Chinese variants (bounded) — preserve Unicode product text
    const zhProduct = translateProductToChinese(product) || productRaw;
    for (const t of types.slice(0, 2)) {
        const zhRole = chinaPhraseForBusinessType(t.id);
        const zhQuery = `${zhProduct}${zhRole}`;
        planned.push({
            queryText: zhQuery,
            translatedQuery: `${productRaw} ${t.phrase} ${countryN}`,
            priorityScore: Math.max(40, t.priorityScore - 20),
            businessType: t.id,
            locationLabel: countryN,
            locationScope: 'country',
            queryLanguage: 'zh',
            sourcePlatform,
            isAlternate: true,
        });
    }
    for (const kw of relatedKeywords.slice(0, 4)) {
        const zhKw = translateProductToChinese(kw) || normalizeDisplay(kw);
        const zhQuery = `${zhKw}${chinaPhraseForBusinessType(types[0]?.id)}`;
        planned.push({
            queryText: zhQuery,
            translatedQuery: `${normalizeDisplay(kw)} ${types[0]?.phrase || 'manufacturers'} ${countryN}`,
            priorityScore: 42,
            businessType: types[0]?.id || 'Manufacturer',
            relatedKeyword: kw,
            locationLabel: countryN,
            locationScope: 'country',
            queryLanguage: 'zh',
            sourcePlatform,
            isAlternate: true,
        });
    }

    // Province / state expansion (optional) — separate EN queries per selected Chinese province
    if (states.length) {
        const expandTypes = types.slice(0, 2);
        for (const st of states) {
            for (const t of expandTypes) {
                planned.push({
                    queryText: `${productRaw} ${t.phrase} ${st} ${countryN}${exSuffix}`,
                    priorityScore: Math.min(t.priorityScore, 48),
                    businessType: t.id,
                    locationLabel: st,
                    locationScope: 'state',
                    queryLanguage: 'en',
                    sourcePlatform,
                    isExpansion: true,
                    isAlternate: true,
                });
            }
        }
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
        if (china.length > MAX_GENERATED_QUERIES) {
            throw new ApiError(
                400,
                `This selection creates ${china.length} queries. Please reduce business types or states.`,
            );
        }
        const out = [];
        const seen = new Set();
        for (const q of china) pushQuery(out, seen, q);
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
