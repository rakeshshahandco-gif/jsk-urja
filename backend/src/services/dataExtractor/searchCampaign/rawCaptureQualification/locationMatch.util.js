/**
 * Strict city location classification for CP7 (post-capture).
 * Office confirmation uses enrichment addresses only — not Google title/snippet.
 */

export const LOCATION_MATCH_MODES = Object.freeze({
    STRICT_CITY: 'strict_city',
    STRICT_STATE: 'strict_state',
    STRICT_COUNTRY: 'strict_country',
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

const STATE_ALIASES = {
    maharashtra: ['maharashtra', 'mh'],
    gujarat: ['gujarat', 'gj'],
    karnataka: ['karnataka', 'ka'],
    haryana: ['haryana', 'hr'],
    delhi: ['delhi', 'nct', 'nct of delhi', 'new delhi'],
    tamil_nadu: ['tamil nadu', 'tamilnadu', 'tn'],
    telangana: ['telangana', 'ts'],
    rajasthan: ['rajasthan', 'rj'],
    uttar_pradesh: ['uttar pradesh', 'up'],
    west_bengal: ['west bengal', 'wb'],
    madhya_pradesh: ['madhya pradesh', 'mp'],
    kerala: ['kerala', 'kl'],
    punjab: ['punjab', 'pb'],
    goa: ['goa'],
    odisha: ['odisha', 'orissa', 'od'],
    bihar: ['bihar', 'br'],
    andhra_pradesh: ['andhra pradesh', 'ap'],
};

const STATE_CITIES = {
    maharashtra: [
        'mumbai', 'bombay', 'navi mumbai', 'thane', 'pune', 'pimpri', 'chinchwad',
        'nashik', 'nasik', 'nagpur', 'kolhapur', 'chhatrapati sambhajinagar',
        'aurangabad', 'solapur', 'vasai', 'virar', 'kalyan', 'dombivli', 'panvel',
        'bhiwandi', 'ulhasnagar', 'amravati', 'nanded', 'sangli', 'satara',
        'jalgaon', 'ahmednagar', 'latur', 'akola', 'chandrapur', 'parbhani',
        'jalna', 'dhule', 'malegaon', 'mira bhayandar', 'kalbadevi', 'goregaon',
        'andheri', 'bandra', 'worli', 'chembur', 'vasai virar',
    ],
    gujarat: ['vadodara', 'baroda', 'ahmedabad', 'surat', 'rajkot', 'gandhinagar', 'bhavnagar', 'jamnagar'],
    karnataka: ['bangalore', 'bengaluru', 'mysore', 'mysuru', 'mangalore', 'mangaluru', 'hubli', 'belgaum'],
    haryana: ['gurugram', 'gurgaon', 'faridabad', 'panipat', 'karnal', 'ambala', 'rohtak'],
    delhi: ['delhi', 'new delhi', 'ncr'],
    rajasthan: ['jaipur', 'udaipur', 'jodhpur', 'kota', 'ajmer'],
    tamil_nadu: ['chennai', 'coimbatore', 'madurai', 'tiruppur'],
    telangana: ['hyderabad', 'secunderabad', 'warangal'],
    uttar_pradesh: ['noida', 'lucknow', 'kanpur', 'ghaziabad', 'varanasi', 'agra'],
    west_bengal: ['kolkata', 'calcutta', 'howrah'],
    punjab: ['ludhiana', 'amritsar', 'jalandhar', 'mohali'],
    madhya_pradesh: ['indore', 'bhopal', 'gwalior'],
    kerala: ['kochi', 'cochin', 'thiruvananthapuram', 'trivandrum'],
    goa: ['panaji', 'vasco', 'margao'],
    andhra_pradesh: ['visakhapatnam', 'vijayawada', 'tirupati'],
};

const INDIA_ALIASES = ['india', 'in', 'bharat', 'hindustan', 'republic of india'];
const OTHER_COUNTRY_HINTS = [
    'china', 'usa', 'united states', 'uae', 'dubai', 'singapore', 'uk',
    'united kingdom', 'germany', 'malaysia', 'vietnam', 'taiwan',
];

function canonStateKey(state) {
    const key = norm(state).replace(/_/g, ' ');
    if (!key) return '';
    for (const [canon, aliases] of Object.entries(STATE_ALIASES)) {
        const name = canon.replace(/_/g, ' ');
        if (key === name || key === canon || aliases.includes(key)) return name;
    }
    return key;
}

export function stateAliasList(state) {
    const canon = canonStateKey(state);
    if (!canon) return [];
    const underscored = canon.replace(/\s+/g, '_');
    const extras = STATE_ALIASES[underscored] || STATE_ALIASES[canon] || [];
    return [...new Set([canon, ...extras.map(norm)].filter(Boolean))];
}

function citiesForState(state) {
    const canon = canonStateKey(state).replace(/\s+/g, '_');
    const cities = STATE_CITIES[canon] || [];
    return cities.map(norm);
}

function textHasAlias(text, aliases) {
    const t = norm(text);
    if (!t) return false;
    return (aliases || []).some((a) => {
        if (!a) return false;
        if (a.length <= 3) return new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t);
        return t.includes(a);
    });
}

function detectStateFromText(text) {
    const t = norm(text);
    if (!t) return '';
    for (const [canon, aliases] of Object.entries(STATE_ALIASES)) {
        const name = canon.replace(/_/g, ' ');
        if (textHasAlias(t, [name, ...aliases])) return name;
    }
    for (const [canon, cities] of Object.entries(STATE_CITIES)) {
        if (cities.some((c) => c.length > 3 && t.includes(c))) return canon.replace(/_/g, ' ');
    }
    return '';
}

export function resolveLocationScope(campaign = {}) {
    const scope = norm(campaign.locationScope);
    if (scope === 'state' || scope === 'country' || scope === 'city') return scope;
    return 'city';
}

function countryAliasList(country) {
    const key = norm(country);
    if (!key) return [];
    if (INDIA_ALIASES.includes(key)) return [...INDIA_ALIASES];
    return [key];
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
    if (explicit === 'strict_state' || explicit === 'state') return LOCATION_MATCH_MODES.STRICT_STATE;
    if (explicit === 'strict_country' || explicit === 'country') return LOCATION_MATCH_MODES.STRICT_COUNTRY;
    const scope = resolveLocationScope(campaign);
    if (scope === 'city') return LOCATION_MATCH_MODES.STRICT_CITY;
    if (scope === 'state') return LOCATION_MATCH_MODES.STRICT_STATE;
    if (scope === 'country') return LOCATION_MATCH_MODES.STRICT_COUNTRY;
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

function officeClassification(type) {
    const bucket = officeTypeBucket(type);
    if (bucket === 'branch') return LOCATION_CLASSIFICATIONS.EXACT_CITY_BRANCH;
    if (bucket === 'factory') return LOCATION_CLASSIFICATIONS.EXACT_CITY_FACTORY;
    return LOCATION_CLASSIFICATIONS.EXACT_CITY_OFFICE;
}

function classifyStateScope({
    campaign, enrichment, addresses, ownerApprovedLocation, base, websiteServeText,
}) {
    const selectedState = String(campaign.state || '').trim();
    const aliases = stateAliasList(selectedState);
    const cities = citiesForState(selectedState);
    const needles = [...aliases, ...cities];
    const extra = {
        ...base,
        selectedState,
        selectedCountry: String(campaign.country || '').trim(),
    };

    if (ownerApprovedLocation && aliases.length) {
        return {
            ...extra,
            locationMatch: 'match',
            locationClassification: LOCATION_CLASSIFICATIONS.OWNER_APPROVED,
            officeInSelectedCity: true,
            locationHits: aliases.slice(0, 1),
            locationEvidenceUrl: addresses[0]?.sourceUrl || enrichment.websiteUrl || '',
        };
    }
    if (!aliases.length) {
        return {
            ...extra,
            locationMatch: 'unknown',
            locationClassification: LOCATION_CLASSIFICATIONS.NOT_CONFIRMED,
        };
    }

    const matchingAddrs = addresses.filter((a) => textHasAlias(addressHaystack(a), needles)
        || textHasAlias(a.state, aliases)
        || textHasAlias(a.city, cities));
    const structuredHit = textHasAlias(enrichment.state, aliases) || textHasAlias(enrichment.city, cities);
    const serves = detectsServesCity(websiteServeText, needles.slice(0, 12));

    if (matchingAddrs.length || structuredHit) {
        const best = matchingAddrs[0] || {
            type: 'Office',
            sourceUrl: enrichment.websiteUrl || '',
            city: enrichment.city,
            state: enrichment.state,
        };
        return {
            ...extra,
            locationMatch: 'match',
            locationClassification: officeClassification(best.type),
            officeInSelectedCity: true,
            servesSelectedCity: serves,
            locationHits: needles.filter((a) => textHasAlias(addressHaystack(best) || `${enrichment.city} ${enrichment.state}`, [a])).slice(0, 5),
            locationEvidenceUrl: best.sourceUrl || enrichment.websiteUrl || '',
            confirmedCities: extra.confirmedCities.length ? extra.confirmedCities : [best.city || selectedState].filter(Boolean),
            confirmedStates: extra.confirmedStates.length ? extra.confirmedStates : [selectedState],
        };
    }

    const otherHits = [];
    for (const a of addresses) {
        const detected = detectStateFromText(`${addressHaystack(a)} ${a.state || ''} ${a.city || ''}`);
        if (detected && !aliases.includes(norm(detected))) otherHits.push(a.city || detected);
    }
    const enrichDetected = detectStateFromText(`${enrichment.city || ''} ${enrichment.state || ''}`);
    if (enrichDetected && !aliases.includes(norm(enrichDetected))) otherHits.push(enrichment.city || enrichDetected);
    if (otherHits.length && (addresses.length || enrichment.city || enrichment.state)) {
        return {
            ...extra,
            locationMatch: 'mismatch',
            locationClassification: LOCATION_CLASSIFICATIONS.DIFFERENT_CITY,
            officeInSelectedCity: false,
            servesSelectedCity: serves,
            locationHits: [...new Set(otherHits)].slice(0, 5),
            locationEvidenceUrl: addresses[0]?.sourceUrl || enrichment.websiteUrl || '',
        };
    }

    if (serves) {
        return {
            ...extra,
            locationMatch: 'partial',
            locationClassification: LOCATION_CLASSIFICATIONS.SERVES_NO_OFFICE,
            officeInSelectedCity: false,
            servesSelectedCity: true,
            locationHits: aliases.slice(0, 1),
            locationEvidenceUrl: enrichment.websiteUrl || '',
        };
    }

    if (!addresses.length && !enrichment.city && !enrichment.state) {
        return {
            ...extra,
            locationMatch: 'unknown',
            locationClassification: LOCATION_CLASSIFICATIONS.ADDRESS_MISSING,
            servesSelectedCity: false,
        };
    }

    return {
        ...extra,
        locationMatch: 'unknown',
        locationClassification: LOCATION_CLASSIFICATIONS.NOT_CONFIRMED,
        servesSelectedCity: serves,
        locationEvidenceUrl: enrichment.websiteUrl || '',
    };
}

function classifyCountryScope({
    campaign, enrichment, addresses, ownerApprovedLocation, base,
}) {
    const selectedCountry = String(campaign.country || '').trim();
    const aliases = countryAliasList(selectedCountry);
    const extra = {
        ...base,
        selectedState: String(campaign.state || '').trim(),
        selectedCountry,
    };
    const hay = [
        enrichment.country,
        enrichment.state,
        enrichment.city,
        ...addresses.map((a) => addressHaystack(a)),
    ].join(' ');

    if (ownerApprovedLocation && aliases.length) {
        return {
            ...extra,
            locationMatch: 'match',
            locationClassification: LOCATION_CLASSIFICATIONS.OWNER_APPROVED,
            officeInSelectedCity: true,
            locationHits: aliases.slice(0, 1),
            locationEvidenceUrl: addresses[0]?.sourceUrl || enrichment.websiteUrl || '',
        };
    }
    if (!aliases.length) {
        return {
            ...extra,
            locationMatch: 'unknown',
            locationClassification: LOCATION_CLASSIFICATIONS.NOT_CONFIRMED,
        };
    }

    const countryHit = textHasAlias(hay, aliases) || textHasAlias(enrichment.country, aliases)
        || addresses.some((a) => textHasAlias(a.country, aliases));
    const indianGeoHit = INDIA_ALIASES.includes(norm(selectedCountry))
        && Boolean(detectStateFromText(hay) || addresses.some((a) => a.city || a.state));
    if (countryHit || indianGeoHit) {
        const best = addresses[0] || {};
        return {
            ...extra,
            locationMatch: 'match',
            locationClassification: officeClassification(best.type),
            officeInSelectedCity: true,
            locationHits: aliases.slice(0, 1),
            locationEvidenceUrl: best.sourceUrl || enrichment.websiteUrl || '',
        };
    }

    const otherCountry = OTHER_COUNTRY_HINTS.find((c) => textHasAlias(hay, [c]));
    if (otherCountry && (addresses.length || enrichment.country)) {
        return {
            ...extra,
            locationMatch: 'mismatch',
            locationClassification: LOCATION_CLASSIFICATIONS.DIFFERENT_CITY,
            locationHits: [otherCountry],
            locationEvidenceUrl: addresses[0]?.sourceUrl || enrichment.websiteUrl || '',
        };
    }

    if (!addresses.length && !enrichment.city && !enrichment.country) {
        return {
            ...extra,
            locationMatch: 'unknown',
            locationClassification: LOCATION_CLASSIFICATIONS.ADDRESS_MISSING,
        };
    }
    return {
        ...extra,
        locationMatch: 'unknown',
        locationClassification: LOCATION_CLASSIFICATIONS.NOT_CONFIRMED,
        locationEvidenceUrl: enrichment.websiteUrl || '',
    };
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
        selectedState: String(campaign.state || '').trim(),
        selectedCountry: String(campaign.country || '').trim(),
        confirmedCities,
        confirmedStates,
        officeInSelectedCity: false,
        servesSelectedCity: false,
        locationEvidenceUrl: '',
        locationHits: [],
        addressCount: addresses.length,
    };

    const websiteServeText = [
        ...(enrichment.productsServices || []),
        enrichment.manufacturerEvidence || '',
        ...(enrichment.sourceEvidence || []).map((e) => e.value),
    ].join(' \n ');

    if (mode === LOCATION_MATCH_MODES.STRICT_STATE) {
        return classifyStateScope({
            campaign, enrichment, addresses, ownerApprovedLocation, base, websiteServeText,
        });
    }
    if (mode === LOCATION_MATCH_MODES.STRICT_COUNTRY) {
        return classifyCountryScope({
            campaign, enrichment, addresses, ownerApprovedLocation, base,
        });
    }

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

export function formatLocationMatchLabel(locationMatch) {
    const m = String(locationMatch || '');
    if (m === 'match') return 'Yes';
    if (m === 'mismatch') return 'No';
    if (m === 'partial') return 'Partial';
    return 'Not Confirmed';
}

export function formatRequestedLocation(campaign = {}) {
    return [campaign.city, campaign.state, campaign.country]
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .join(', ');
}

export function formatDetectedLocation({
    city, state, country, confirmedCities = [], confirmedStates = [],
} = {}) {
    const parts = [
        city || confirmedCities[0] || '',
        state || confirmedStates[0] || '',
        country || '',
    ].map((s) => String(s || '').trim()).filter(Boolean);
    return [...new Set(parts)].join(', ');
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
