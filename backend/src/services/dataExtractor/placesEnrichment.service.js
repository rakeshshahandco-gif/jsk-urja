/**
 * Optional Google Places enrichment for SerpAPI / web_search results.
 * SerpAPI must continue working when Places is disabled or not configured.
 */
import {
    getGooglePlacesApiKey,
    isGooglePlacesConfigured,
} from './googleCredentials.service.js';
import {
    callPlacesTextSearch,
    mapGooglePlaceToRecord,
} from './adapters/googleBusinessAdapter.js';
import { preferNonEmpty, preferNonEmptyPreferIncoming, isBlank } from './providerSecrets.util.js';
import { normalizeExtractorUrl } from './extractor.utils.js';

function digits(phone) {
    return String(phone || '').replace(/\D/g, '');
}

function namesSimilar(a, b) {
    const na = String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const nb = String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.includes(nb) || nb.includes(na)) return true;
    return false;
}

function domainOf(website) {
    return normalizeExtractorUrl(website || '').domain || '';
}

/**
 * Match priority when SerpAPI and Places return the same business:
 * 1. Google Place ID  2. Normalized website domain  3. Normalized phone
 * 4. Normalized email  5. Exact company name + city  6. Similar company name + address
 */
export function scorePlaceMatch(record, placeRec) {
    let score = 0;
    const placeId = placeRec?.rawExtractedData?.placeId || placeRec?.sourceReference || '';
    const recPlaceId = record?.rawExtractedData?.placeId || '';
    if (placeId && recPlaceId && placeId === recPlaceId) score += 100;

    const d1 = domainOf(record.website);
    const d2 = domainOf(placeRec.website);
    if (d1 && d2 && d1 === d2) score += 90;

    const p1 = digits(record.phone || record.mobile);
    const p2 = digits(placeRec.phone || placeRec.mobile);
    if (p1.length >= 8 && p2.length >= 8 && (p1.slice(-8) === p2.slice(-8))) score += 80;

    const e1 = String(record.email || '').toLowerCase();
    const e2 = String(placeRec.email || '').toLowerCase();
    if (e1 && e2 && e1 === e2) score += 75;

    const cityMatch = String(record.city || '').toLowerCase() === String(placeRec.city || '').toLowerCase()
        || !record.city
        || !placeRec.city;
    if (String(record.companyName || '').toLowerCase() === String(placeRec.companyName || '').toLowerCase() && cityMatch) {
        score += 60;
    } else if (namesSimilar(record.companyName, placeRec.companyName) && cityMatch) {
        score += 40;
        const a1 = String(record.address || '').toLowerCase();
        const a2 = String(placeRec.address || '').toLowerCase();
        if (a1 && a2 && (a1.includes(a2.slice(0, 12)) || a2.includes(a1.slice(0, 12)))) score += 15;
    }

    return score;
}

/**
 * Safe field merge — never replace a valid existing field with empty / weaker blank.
 * Places wins for Place ID, Maps link, and category/types when present.
 */
export function mergeSerpAndPlacesRecord(serpRecord, placeRec) {
    if (!placeRec) return serpRecord;

    const placeId = placeRec.rawExtractedData?.placeId || placeRec.sourceReference || '';
    const mapsLink = placeRec.sourceUrl || placeRec.rawExtractedData?.googleMapsLink || '';
    const types = placeRec.productCategories || placeRec.rawExtractedData?.types || [];

    const merged = {
        ...serpRecord,
        companyName: preferNonEmpty(serpRecord.companyName, placeRec.companyName),
        website: preferNonEmpty(serpRecord.website, placeRec.website),
        normalizedDomain: preferNonEmpty(serpRecord.normalizedDomain, placeRec.normalizedDomain),
        phone: preferNonEmpty(serpRecord.phone, placeRec.phone),
        mobile: preferNonEmpty(serpRecord.mobile, placeRec.mobile || placeRec.phone),
        email: preferNonEmpty(serpRecord.email, placeRec.email),
        address: preferNonEmpty(serpRecord.address, placeRec.address),
        city: preferNonEmpty(serpRecord.city, placeRec.city),
        stateProvince: preferNonEmpty(serpRecord.stateProvince, placeRec.stateProvince),
        country: preferNonEmpty(serpRecord.country, placeRec.country),
        pincode: preferNonEmpty(serpRecord.pincode, placeRec.pincode),
        businessDescription: preferNonEmpty(serpRecord.businessDescription, placeRec.businessDescription),
        natureOfBusiness: preferNonEmptyPreferIncoming(
            serpRecord.natureOfBusiness,
            types?.[0] || placeRec.natureOfBusiness,
        ),
        productCategories: (serpRecord.productCategories?.length
            ? serpRecord.productCategories
            : (types || placeRec.productCategories || [])),
        confidenceScore: Math.max(serpRecord.confidenceScore || 0, placeRec.confidenceScore || 0),
        rawExtractedData: {
            ...(serpRecord.rawExtractedData || {}),
            placeId: preferNonEmpty(serpRecord.rawExtractedData?.placeId, placeId),
            googleMapsLink: preferNonEmpty(serpRecord.rawExtractedData?.googleMapsLink, mapsLink),
            googlePlaceId: preferNonEmpty(serpRecord.rawExtractedData?.googlePlaceId, placeId),
            businessCategory: preferNonEmpty(
                serpRecord.rawExtractedData?.businessCategory,
                types?.[0] || '',
            ),
            sources: {
                ...((serpRecord.rawExtractedData || {}).sources || {}),
                serpapi: (serpRecord.rawExtractedData || {}).sources?.serpapi
                    || { provider: serpRecord.rawExtractedData?.provider || 'serpapi' },
                google_places: {
                    placeId,
                    mapsLink,
                    types,
                    rating: placeRec.rawExtractedData?.rating,
                },
            },
            sourceProviders: [
                ...new Set([
                    ...((serpRecord.rawExtractedData || {}).sourceProviders || [serpRecord.rawExtractedData?.provider || 'serpapi']),
                    'google_places',
                ].filter(Boolean)),
            ],
        },
    };

    if (placeId && isBlank(merged.sourceReference)) {
        merged.sourceReference = placeId;
    }

    return merged;
}

export function isPlacesEnrichmentEnabled(settings = null) {
    const g = settings?.sourceConnectors?.google || {};
    if (g.placesEnrichmentEnabled === false) return false;
    // Default: enrich when Places key exists and enrichment not explicitly disabled
    return isGooglePlacesConfigured(settings);
}

export async function enrichRecordsWithGooglePlaces(records, input, settings) {
    if (!isPlacesEnrichmentEnabled(settings) || !isGooglePlacesConfigured(settings)) {
        return { records, errors: [], enrichedCount: 0, skipped: 'places_disabled_or_not_configured' };
    }

    const timeoutMs = Number(settings?.sourceConnectors?.google?.placesTimeoutMs)
        || Number(settings?.searchTimeoutMs)
        || 15000;
    const resultLimit = Math.min(
        5,
        Number(settings?.sourceConnectors?.google?.placesResultLimit) || 3,
    );
    const errors = [];
    let enrichedCount = 0;
    const out = [];

    for (const record of records) {
        const company = String(record.companyName || '').trim();
        if (!company) {
            out.push(record);
            continue;
        }

        const textQuery = [company, input.city, input.state, input.country]
            .map((s) => String(s || '').trim())
            .filter(Boolean)
            .join(' ');

        try {
            const { places, error } = await callPlacesTextSearch({
                textQuery,
                maxResults: resultLimit,
                timeoutMs,
                regionCode: String(input.country || '').toLowerCase().includes('india') ? 'IN' : 'IN',
                settings,
            });
            if (error) {
                errors.push(`Places enrich ${company}: ${error}`);
                out.push(record);
                continue;
            }
            if (!places?.length) {
                out.push(record);
                continue;
            }

            let best = null;
            let bestScore = 0;
            for (const place of places) {
                const placeRec = mapGooglePlaceToRecord(place, input);
                const score = scorePlaceMatch(record, placeRec);
                if (score > bestScore) {
                    bestScore = score;
                    best = placeRec;
                }
            }

            if (best && bestScore >= 40) {
                out.push(mergeSerpAndPlacesRecord(record, best));
                enrichedCount += 1;
            } else {
                out.push(record);
            }
        } catch (err) {
            errors.push(`Places enrich ${company}: ${err?.message || 'failed'}`);
            out.push(record);
        }
    }

    return { records: out, errors, enrichedCount };
}

export { getGooglePlacesApiKey };
