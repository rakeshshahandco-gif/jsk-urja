/**
 * Strict city location classification for CP7 (post-capture).
 * Office confirmation uses enrichment addresses only — not Google title/snippet.
 */

export const LOCATION_MATCH_MODES = Object.freeze({
    STRICT_CITY: 'strict_city',
    SERVES_CITY: 'serves_city',
    BROAD: 'broad',
});

export const LOCATION_CLASSIFICATIONS = Object.freeze({
    EXACT_CITY_OFFICE: 'Exact City Office Confirmed',
    EXACT_CITY_BRANCH: 'Exact City Branch Confirmed',
    EXACT_CITY_FACTORY: 'Exact City Factory Confirmed',
    SERVES_NO_OFFICE: 'Serves Selected City — No Office Confirmed',
    NEARBY_CITY: 'Nearby City',
    DIFFERENT_CITY: 'Different City Confirmed',
    NOT_CONFIRMED: 'Location Not Confirmed',
    ADDRESS_MISSING: 'Address Missing',
    OWNER_APPROVED: 'Owner Approved Location',
});

const CITY_ALIASES = {
    bangalore: ['bangalore', 'bengaluru', 'bengaluru urban', 'bangaluru', 'banglore'],
    bengaluru: ['bangalore', 'bengaluru', 'bengaluru urban', 'bangaluru', 'banglore'],
    'bengaluru urban': ['bangalore', 'bengaluru', 'bengaluru urban', 'banglore'],
    banglore: ['bangalore', 'bengaluru', 'bengaluru urban', 'bangaluru', 'banglore'],
    gurugram: ['gurugram', 'gurgaon'],
    gurgaon: ['gurugram', 'gurgaon'],
    mumbai: ['mumbai', 'bombay'],
    delhi: ['delhi', 'new delhi', 'ncr'],
    'new delhi': ['delhi', 'new delhi'],
};

function norm(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Normalize campaign city spelling for matching / display.
 * Preserves original entered value for audit; interprets known typos.
 */
export function normalizeCampaignCity(raw) {
    const entered = String(raw || '').trim();
    const key = entered.toLowerCase().replace(/\s+/g, ' ').trim();
    const bangaloreKeys = new Set(['bangalore', 'bengaluru', 'bengaluru urban', 'bangaluru', 'banglore']);
    if (bangaloreKeys.has(key)) {
        return {
            entered,
            canonical: 'Bangalore',
            display: 'Bangalore / Bengaluru',
            wasCorrected: key === 'banglore' || key === 'bangaluru',
        };
    }
    return {
        entered,
        canonical: entered,
        display: entered || '',
        wasCorrected: false,
    };
}

export function cityAliasList(city) {
    const normalized = normalizeCampaignCity(city);
    const key = norm(normalized.canonical || city);
    if (!key) return [];
    const extras = CITY_ALIASES[key] || CITY_ALIASES[norm(city)] || [];
    return [...new Set([key, norm(city), ...extras.map(norm)].filter(Boolean))];
}

export function resolveLocationMatchMode(campaign = {}) {
    const explicit = norm(campaign.locationMatchMode || campaign.locationMode || '');
    if (explicit === 'serves_city' || explicit === 'serves') return LOCATION_MATCH_MODES.SERVES_CITY;
    if (explicit === 'broad' || explicit === 'nearby') return LOCATION_MATCH_MODES.BROAD;
    if (explicit === 'strict_city' || explicit === 'strict') return LOCATION_MATCH_MODES.STRICT_CITY;
    const scope = norm(campaign.locationScope || 'city');
    if (scope === 'city') return LOCATION_MATCH_MODES.STRICT_CITY;
    return LOCATION_MATCH_MODES.BROAD;
}

function addressHaystack(addr) {
    return norm([addr?.raw, addr?.city, addr?.state, addr?.country, addr?.pinCode, addr?.type, addr?.evidenceLabel].join(' '));
}

function cityMatchesText(text, aliases) {
    const t = norm(text);
    return aliases.some((a) => a && t.includes(a));
}

function officeTypeBucket(type) {
    const t = norm(type);
    if (/factory|manufactur|plant|production/.test(t)) return 'factory';
    if (/branch/.test(t)) return 'branch';
    if (/experience|showroom/.test(t)) return 'branch';
    return 'office';
}

/**
 * Detect “serves selected city” language without counting as an office.
 */
export function detectsServesCity(text, aliases) {
    const t = norm(text);
    if (!aliases.length) return false;
    const cityAlt = aliases.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const patterns = [
        new RegExp(`\\b(serves?|serving|service\\s+in|projects?\\s+in|working\\s+in|available\\s+in|pan[- ]india[^.]{0,40}(${cityAlt}))\\b`, 'i'),
        new RegExp(`\\b(${cityAlt})\\s+(projects?|installations?|clients?|customers?)\\b`, 'i'),
        new RegExp(`\\bacross\\s+(india|cities)[^.]{0,60}\\b(${cityAlt})\\b`, 'i'),
    ];
    return patterns.some((re) => re.test(t));
}

/**
 * Classify location using official enrichment addresses (+ top-level city/state).
 * Google title/snippet must NOT confirm an office.
 */
export function classifyStrictLocation({
    campaign = {},
    enrichment = {},
    ownerApprovedLocation = false,
} = {}) {
    const mode = resolveLocationMatchMode(campaign);
    const selectedCity = campaign.city || '';
    const aliases = cityAliasList(selectedCity);
    const addresses = Array.isArray(enrichment.addresses) ? enrichment.addresses.filter((a) => a?.raw || a?.city) : [];
    const confirmedCities = [...new Set(addresses.map((a) => String(a.city || '').trim()).filter(Boolean))];
    const confirmedStates = [...new Set(addresses.map((a) => String(a.state || '').trim()).filter(Boolean))];

    const base = {
        locationMatchMode: mode,
        selectedCity,
        confirmedCities,
        confirmedStates,
        officeInSelectedCity: false,
        servesSelectedCity: false,
        locationEvidenceUrl: '',
        locationHits: [],
        addressCount: addresses.length,
    };

    if (ownerApprovedLocation && aliases.length) {
        return {
            ...base,
            locationMatch: 'match',
            locationClassification: LOCATION_CLASSIFICATIONS.OWNER_APPROVED,
            officeInSelectedCity: true,
            locationHits: aliases.slice(0, 1),
            locationEvidenceUrl: addresses[0]?.sourceUrl || enrichment.websiteUrl || '',
        };
    }

    if (!aliases.length) {
        return {
            ...base,
            locationMatch: 'unknown',
            locationClassification: LOCATION_CLASSIFICATIONS.NOT_CONFIRMED,
        };
    }

    // Reliable office evidence = addresses[] and structured enrichment city/state (not Google blob)
    const matchingAddrs = addresses.filter((a) => cityMatchesText(addressHaystack(a), aliases)
        || cityMatchesText(a.city, aliases));
    const structuredCityHit = cityMatchesText(enrichment.city, aliases);

    const websiteServeText = [
        ...(enrichment.productsServices || []),
        enrichment.manufacturerEvidence || '',
        ...(enrichment.sourceEvidence || []).map((e) => e.value),
    ].join(' \n ');
    const serves = detectsServesCity(websiteServeText, aliases);

    if (matchingAddrs.length || structuredCityHit) {
        const best = matchingAddrs[0] || {
            type: 'Office',
            sourceUrl: enrichment.websiteUrl || '',
            city: enrichment.city,
        };
        const bucket = officeTypeBucket(best.type);
        let classification = LOCATION_CLASSIFICATIONS.EXACT_CITY_OFFICE;
        if (bucket === 'branch') classification = LOCATION_CLASSIFICATIONS.EXACT_CITY_BRANCH;
        if (bucket === 'factory') classification = LOCATION_CLASSIFICATIONS.EXACT_CITY_FACTORY;
        return {
            ...base,
            locationMatch: 'match',
            locationClassification: classification,
            officeInSelectedCity: true,
            servesSelectedCity: serves,
            locationHits: aliases.filter((a) => cityMatchesText(addressHaystack(best) || enrichment.city, [a])),
            locationEvidenceUrl: best.sourceUrl || enrichment.websiteUrl || '',
            confirmedCities: confirmedCities.length ? confirmedCities : [selectedCity],
        };
    }

    // Different city confirmed via official addresses
    if (addresses.length && confirmedCities.length) {
        const other = confirmedCities.filter((c) => !cityMatchesText(c, aliases));
        if (other.length) {
            return {
                ...base,
                locationMatch: 'mismatch',
                locationClassification: LOCATION_CLASSIFICATIONS.DIFFERENT_CITY,
                officeInSelectedCity: false,
                servesSelectedCity: serves,
                locationHits: other.slice(0, 5),
                locationEvidenceUrl: addresses[0]?.sourceUrl || enrichment.websiteUrl || '',
            };
        }
    }

    if (serves || mode === LOCATION_MATCH_MODES.SERVES_CITY) {
        if (serves) {
            return {
                ...base,
                locationMatch: 'partial',
                locationClassification: LOCATION_CLASSIFICATIONS.SERVES_NO_OFFICE,
                officeInSelectedCity: false,
                servesSelectedCity: true,
                locationHits: aliases.slice(0, 1),
                locationEvidenceUrl: enrichment.websiteUrl || '',
            };
        }
    }

    if (!addresses.length && !enrichment.city) {
        return {
            ...base,
            locationMatch: 'unknown',
            locationClassification: LOCATION_CLASSIFICATIONS.ADDRESS_MISSING,
            servesSelectedCity: false,
        };
    }

    return {
        ...base,
        locationMatch: 'unknown',
        locationClassification: LOCATION_CLASSIFICATIONS.NOT_CONFIRMED,
        servesSelectedCity: serves,
        locationEvidenceUrl: enrichment.websiteUrl || '',
    };
}

export const PRODUCT_MATCH_STRENGTHS = Object.freeze({
    STRONG: 'Strong Product Match',
    POSSIBLE: 'Possible Product Match',
    WEAK: 'Weak Keyword Match',
    UNRELATED: 'Unrelated Product',
    JOB_COURSE: 'Job/Course/Training',
    DIRECTORY: 'Directory Only',
});

export function classifyProductMatchStrength({
    strongHits = [],
    possibleHits = [],
    rejectHits = [],
    isDirectory = false,
    companyEvidenceOnlyHits = 0,
} = {}) {
    if (rejectHits.length) return PRODUCT_MATCH_STRENGTHS.JOB_COURSE;
    if (isDirectory && !strongHits.length) return PRODUCT_MATCH_STRENGTHS.DIRECTORY;
    if (strongHits.length >= 2 || (strongHits.length >= 1 && companyEvidenceOnlyHits >= 2)) {
        return PRODUCT_MATCH_STRENGTHS.STRONG;
    }
    if (strongHits.length >= 1 || possibleHits.length >= 2) return PRODUCT_MATCH_STRENGTHS.POSSIBLE;
    if (possibleHits.length >= 1) return PRODUCT_MATCH_STRENGTHS.WEAK;
    return PRODUCT_MATCH_STRENGTHS.UNRELATED;
}
