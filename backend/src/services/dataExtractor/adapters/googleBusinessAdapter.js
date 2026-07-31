import { scoreExtractorConfidence } from '../extractor.utils.js';
import { normalizeExtractedRecord } from '../companyNormalizer.service.js';
import {
    getGooglePlacesApiKey,
    isGooglePlacesConfigured,
    isGoogleCseConfigured,
} from '../googleCredentials.service.js';
import { runWebSearchProvider } from '../providers/searchProvider.factory.js';

function getPlacesApiKey(settings) {
    return getGooglePlacesApiKey(settings);
}

const FIELD_MASK = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.addressComponents',
    'places.nationalPhoneNumber',
    'places.internationalPhoneNumber',
    'places.websiteUri',
    'places.googleMapsUri',
    'places.types',
    'places.rating',
    'places.businessStatus',
].join(',');

function normalizeText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
}

function regionFromCountry(country) {
    const c = normalizeText(country).toLowerCase();
    if (!c || c.includes('india')) return 'IN';
    if (c.includes('china')) return 'CN';
    if (c.includes('usa') || c.includes('united states')) return 'US';
    if (c.includes('uk') || c.includes('united kingdom')) return 'GB';
    return 'IN';
}

export function isGoogleBusinessConfigured(settings = null) {
    return isGooglePlacesConfigured(settings) || isGoogleCseConfigured(settings);
}

export function getGoogleBusinessConfigMessage(settings = null) {
    if (isGooglePlacesConfigured(settings)) {
        return 'Google Places API is configured — full business data (phone, website, Maps link).';
    }
    if (isGoogleCseConfigured(settings)) {
        return 'Using Web Search fallback for Maps listings. Add Places API key in Settings for phone/website fields.';
    }
    return 'Add Google Places API key in Data Extractor → Settings → Google API keys (or GOOGLE_MAPS_API_KEY in backend/.env). Enable Places API (New) in Google Cloud.';
}

function buildTextQuery(input) {
    return [input.keyword, input.city, input.state, input.country]
        .map((s) => normalizeText(s))
        .filter(Boolean)
        .join(' ');
}

function parseAddressComponents(components = []) {
    const out = { city: '', stateProvince: '', country: '', pincode: '' };
    for (const comp of components) {
        const types = comp.types || [];
        const val = normalizeText(comp.longText || comp.shortText || comp.name);
        if (types.includes('locality') || types.includes('postal_town')) out.city = out.city || val;
        if (types.includes('administrative_area_level_1')) out.stateProvince = val;
        if (types.includes('country')) out.country = val;
        if (types.includes('postal_code')) out.pincode = val;
    }
    return out;
}

function mapsUrlForPlace(place) {
    if (place.googleMapsUri) return place.googleMapsUri;
    const id = place.id || '';
    if (id) return `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(id)}`;
    const name = place.displayName?.text || '';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
}

export function mapGooglePlaceToRecord(place, input) {
    const companyName = normalizeText(place.displayName?.text) || 'Google Business';
    const formattedAddress = normalizeText(place.formattedAddress);
    const addr = parseAddressComponents(place.addressComponents || []);
    const phone = normalizeText(place.nationalPhoneNumber || place.internationalPhoneNumber);
    const website = normalizeText(place.websiteUri);
    const mapsUrl = mapsUrlForPlace(place);
    const types = (place.types || []).slice(0, 5);
    const keyword = normalizeText(input.keyword);

    const record = {
        companyName,
        website,
        normalizedDomain: '',
        sourcePlatform: 'google_business',
        sourceUrl: mapsUrl,
        sourceReference: String(place.id || ''),
        phone,
        mobile: phone,
        address: formattedAddress,
        city: addr.city || normalizeText(input.city),
        stateProvince: addr.stateProvince || normalizeText(input.state),
        country: addr.country || normalizeText(input.country),
        pincode: addr.pincode,
        businessDescription: types.length ? `Google types: ${types.join(', ')}` : '',
        productCategories: types.filter((t) => !t.includes('point_of_interest') && !t.includes('establishment')),
        keywords: keyword ? [keyword] : [],
        extractedAt: new Date(),
        confidenceScore: scoreExtractorConfidence({
            companyName,
            website,
            phone,
            address: formattedAddress,
            city: addr.city,
        }),
        rawExtractedData: {
            adapter: 'google_places_text_search',
            placeId: place.id,
            types,
            rating: place.rating,
            businessStatus: place.businessStatus,
        },
    };

    if (Number(place.rating) >= 4) {
        record.confidenceScore = Math.min(100, record.confidenceScore + 5);
    }

    return normalizeExtractedRecord(record);
}

export async function callPlacesTextSearch({ textQuery, maxResults, timeoutMs, regionCode, settings }) {
    const apiKey = getPlacesApiKey(settings);
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify({
            textQuery,
            pageSize: Math.min(20, Math.max(1, maxResults)),
            languageCode: 'en',
            regionCode: regionCode || 'IN',
        }),
        signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        return { places: [], error: `Google Places invalid JSON: ${text.slice(0, 180)}` };
    }

    if (!res.ok) {
        const msg = data?.error?.message || text.slice(0, 180);
        return { places: [], error: `Google Places HTTP ${res.status}: ${msg}` };
    }

    return { places: data.places || [], error: '' };
}

async function searchGoogleBusinessViaCseFallback(input, settings) {
    const maxResults = Math.min(20, Math.max(1, Number(input.maxResults) || 10));
    const timeoutMs = settings?.searchTimeoutMs || 20000;
    const textQuery = `${buildTextQuery(input)} site:google.com/maps`.trim();
    const { items, error, providerName } = await runWebSearchProvider({
        query: textQuery,
        maxResults,
        timeoutMs,
        settings,
    });
    const errors = error ? [error] : [];
    const records = [];
    for (const item of items) {
        const link = String(item.link || '').trim();
        if (!link.includes('google.com/maps')) continue;
        const companyName = String(item.title || '').split('|')[0].split('-')[0].trim();
        records.push(normalizeExtractedRecord({
            companyName,
            website: link,
            sourcePlatform: 'google_business',
            sourceUrl: link,
            sourceReference: textQuery,
            businessDescription: String(item.snippet || '').trim(),
            keywords: input.keyword ? [String(input.keyword).trim()] : [],
            city: input.city || '',
            stateProvince: input.state || '',
            country: input.country || '',
            extractedAt: new Date(),
            confidenceScore: scoreExtractorConfidence({ companyName, website: link }),
            rawExtractedData: { adapter: 'google_maps_cse_fallback', provider: providerName },
        }));
    }
    return {
        records,
        errors,
        metadata: {
            sourceStatus: records.length ? 'ok' : (errors.length ? 'error' : 'no_results'),
            adapterId: 'google_business',
            apiType: 'cse_maps_fallback',
            note: 'Fallback mode: Maps URLs via Web Search. Add Places API key in Settings for phone & website.',
            textQuery,
            resultCount: records.length,
            previewOnly: true,
        },
    };
}

export async function testGoogleBusinessConnection(settings = null) {
    if (!isGoogleBusinessConfigured(settings)) {
        return { ok: false, message: getGoogleBusinessConfigMessage(settings) };
    }
    if (!isGooglePlacesConfigured(settings)) {
        const { items, error } = await runWebSearchProvider({
            query: 'manufacturer Mumbai site:google.com/maps',
            maxResults: 2,
            timeoutMs: 15000,
            settings,
        });
        if (error) return { ok: false, message: error };
        return {
            ok: true,
            message: `Maps fallback via Web Search — ${items.length} result(s). Add Places API key for full data.`,
            sampleCount: items.length,
        };
    }
    const { places, error } = await callPlacesTextSearch({
        textQuery: 'LED manufacturer Mumbai India',
        maxResults: 3,
        timeoutMs: 20000,
        regionCode: 'IN',
        settings,
    });
    if (error) return { ok: false, message: error };
    return {
        ok: true,
        message: `Connected — ${places.length} business(es) in sample search`,
        sampleCount: places.length,
    };
}

export async function searchGoogleBusiness(input, settings) {
    if (!isGoogleBusinessConfigured(settings)) {
        return {
            records: [],
            errors: [getGoogleBusinessConfigMessage(settings)],
            metadata: { sourceStatus: 'not_configured', adapterId: 'google_business' },
        };
    }

    if (!isGooglePlacesConfigured(settings)) {
        return searchGoogleBusinessViaCseFallback(input, settings);
    }

    const maxResults = Math.min(20, Math.max(1, Number(input.maxResults) || 10));
    const timeoutMs = settings?.searchTimeoutMs || 20000;
    const textQuery = buildTextQuery(input);
    const regionCode = regionFromCountry(input.country);

    const { places, error } = await callPlacesTextSearch({
        textQuery,
        maxResults,
        timeoutMs,
        regionCode,
        settings,
    });

    const errors = error ? [error] : [];
    const seen = new Set();
    const records = [];

    for (const place of places) {
        const pid = String(place.id || '');
        if (pid && seen.has(pid)) continue;
        if (pid) seen.add(pid);
        records.push(mapGooglePlaceToRecord(place, input));
        if (records.length >= maxResults) break;
    }

    return {
        records,
        errors,
        metadata: {
            sourceStatus: records.length ? 'ok' : (errors.length ? 'error' : 'no_results'),
            adapterId: 'google_business',
            apiType: 'google_places_text_search',
            note: 'Official Google Places Text Search — public business listings on Maps.',
            textQuery,
            resultCount: records.length,
            previewOnly: true,
        },
    };
}
