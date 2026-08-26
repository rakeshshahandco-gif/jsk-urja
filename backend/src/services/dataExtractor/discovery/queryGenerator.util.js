/**
 * Phase 1 — generic search-query generator.
 * Reusable for any keyword (not hard-coded to Home Automation).
 * Stores structured query objects for extraction-run transparency.
 */

function collapseWhitespace(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

export const BUSINESS_INTENT_MODIFIERS = Object.freeze([
    { id: 'company', phrase: 'company', priority: 100 },
    { id: 'manufacturer', phrase: 'manufacturer', priority: 96 },
    { id: 'supplier', phrase: 'supplier', priority: 92 },
    { id: 'dealer', phrase: 'dealer', priority: 88 },
    { id: 'distributor', phrase: 'distributor', priority: 86 },
    { id: 'wholesaler', phrase: 'wholesaler', priority: 82 },
    { id: 'exporter', phrase: 'exporter', priority: 78 },
    { id: 'importer', phrase: 'importer', priority: 76 },
    { id: 'system_integrator', phrase: 'system integrator', priority: 84 },
    { id: 'integrator', phrase: 'integrator', priority: 80 },
    { id: 'service_provider', phrase: 'service provider', priority: 74 },
    { id: 'solution_provider', phrase: 'solution provider', priority: 72 },
    { id: 'contractor', phrase: 'contractor', priority: 68 },
    { id: 'consultant', phrase: 'consultant', priority: 66 },
]);

export const DIRECTORY_SITE_HINTS = Object.freeze([
    { id: 'indiamart', host: 'indiamart.com', label: 'IndiaMART' },
    { id: 'tradeindia', host: 'tradeindia.com', label: 'TradeIndia' },
    { id: 'justdial', host: 'justdial.com', label: 'Justdial' },
    { id: 'exportersindia', host: 'exportersindia.com', label: 'ExportersIndia' },
]);

/** Optional synonym groups — applied only when the user keyword already matches a term. */
const SYNONYM_GROUPS = Object.freeze([
    ['home automation', 'smart home', 'smart home automation', 'building automation', 'lighting automation'],
    ['led driver', 'led power supply', 'constant current driver'],
    ['dali', 'dali lighting', 'dali driver'],
]);

const INDIA_STATES = Object.freeze([
    'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh', 'goa', 'gujarat',
    'haryana', 'himachal pradesh', 'jharkhand', 'karnataka', 'kerala', 'madhya pradesh',
    'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland', 'odisha', 'punjab',
    'rajasthan', 'sikkim', 'tamil nadu', 'telangana', 'tripura', 'uttar pradesh', 'uttarakhand',
    'west bengal', 'delhi', 'jammu and kashmir', 'ladakh', 'puducherry',
]);

const COUNTRIES = Object.freeze(['india', 'china', 'uae', 'usa', 'united states', 'uk', 'united kingdom', 'singapore', 'germany']);

const SAFE_EXCLUSIONS = Object.freeze(['-jobs', '-course', '-training', '-career', '-vacancy']);

export const MAX_PHASE1_QUERIES = 22;

function keywordAlreadyHasModifier(keywordLower, phrase) {
    const tokens = phrase.toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.every((t) => keywordLower.includes(t));
}

function synonymVariations(keyword) {
    const key = collapseWhitespace(keyword).toLowerCase();
    if (!key) return [];
    const out = [];
    for (const group of SYNONYM_GROUPS) {
        if (!group.some((term) => key === term || key.includes(term) || term.includes(key))) continue;
        for (const term of group) {
            if (term !== key) out.push(term);
        }
    }
    return [...new Set(out)].slice(0, 4);
}

export function parseLocationInput(location = '', extras = {}) {
    const raw = collapseWhitespace(location);
    const city = collapseWhitespace(extras.city);
    const state = collapseWhitespace(extras.state);
    const country = collapseWhitespace(extras.country);
    if (city || state || country) {
        return { city, state, country, locationLabel: [city, state, country].filter(Boolean).join(', ') };
    }
    if (!raw) return { city: '', state: '', country: '', locationLabel: '' };
    const lower = raw.toLowerCase();
    if (COUNTRIES.includes(lower)) return { city: '', state: '', country: raw, locationLabel: raw };
    if (INDIA_STATES.includes(lower)) return { city: '', state: raw, country: 'India', locationLabel: raw };
    return { city: raw, state: '', country: '', locationLabel: raw };
}

function pushQuery(out, seen, item, maxQueries) {
    const queryText = collapseWhitespace(item.queryText || '');
    if (!queryText) return;
    const key = queryText.toLowerCase();
    if (seen.has(key)) return;
    if (out.length >= maxQueries) return;
    seen.add(key);
    out.push({
        queryText,
        priorityScore: Number(item.priorityScore) || 50,
        businessType: item.businessType || '',
        relatedKeyword: item.relatedKeyword || '',
        locationLabel: item.locationLabel || '',
        sourcePlatform: item.sourcePlatform || 'public_web',
        siteHint: item.siteHint || '',
        recommended: Boolean(item.recommended),
        status: 'queued',
    });
}

/**
 * @param {{ keyword: string, location?: string, city?: string, state?: string, country?: string, includeDirectories?: boolean, maxQueries?: number }} args
 */
export function generatePhase1Queries(args = {}) {
    const keyword = collapseWhitespace(args.keyword);
    if (!keyword) return [];
    const loc = parseLocationInput(args.location, args);
    const location = loc.locationLabel;
    const includeDirectories = args.includeDirectories !== false;
    const maxQueries = Math.min(MAX_PHASE1_QUERIES, Math.max(4, Number(args.maxQueries) || MAX_PHASE1_QUERIES));
    const productLower = keyword.toLowerCase();
    const exSuffix = ` ${SAFE_EXCLUSIONS.join(' ')}`;
    const out = [];
    const seen = new Set();

    pushQuery(out, seen, {
        queryText: location ? `${productLower} ${location}${exSuffix}` : `${productLower}${exSuffix}`,
        priorityScore: 100,
        businessType: '',
        locationLabel: location,
        recommended: true,
    }, maxQueries);

    for (const mod of BUSINESS_INTENT_MODIFIERS) {
        if (keywordAlreadyHasModifier(productLower, mod.phrase)) continue;
        const phrase = location
            ? `${productLower} ${mod.phrase} ${location}${exSuffix}`
            : `${productLower} ${mod.phrase}${exSuffix}`;
        pushQuery(out, seen, {
            queryText: phrase,
            priorityScore: mod.priority,
            businessType: mod.id,
            locationLabel: location,
        }, maxQueries);
    }

    for (const variant of synonymVariations(keyword)) {
        const phrase = location ? `${variant} ${location}${exSuffix}` : `${variant}${exSuffix}`;
        pushQuery(out, seen, {
            queryText: phrase,
            priorityScore: 70,
            relatedKeyword: variant,
            locationLabel: location,
        }, maxQueries);
    }

    if (includeDirectories) {
        let dirPri = 58;
        for (const dir of DIRECTORY_SITE_HINTS) {
            const core = location ? `${productLower} ${location}` : productLower;
            pushQuery(out, seen, {
                queryText: `${core} site:${dir.host}`,
                priorityScore: dirPri--,
                businessType: 'directory',
                locationLabel: location,
                sourcePlatform: 'public_web',
                siteHint: dir.host,
            }, maxQueries);
        }
    }

    if (out[0]) {
        out.forEach((q) => { q.recommended = false; });
        out[0].recommended = true;
    }
    return out;
}

export function locationPhraseFromJob(job = {}) {
    return [job.city, job.state, job.country].map((s) => collapseWhitespace(s)).filter(Boolean).join(' ');
}
