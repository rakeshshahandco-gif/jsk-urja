/** Resolve Google API keys from company settings first, then backend .env */

export function getGoogleConnectors(settings) {
    return settings?.sourceConnectors?.google || {};
}

export function getGoogleCseCredentials(settings = null) {
    const g = getGoogleConnectors(settings);
    return {
        apiKey: String(g.cseApiKey || process.env.EXTRACTOR_GOOGLE_CSE_API_KEY || '').trim(),
        cx: String(g.cseCx || process.env.EXTRACTOR_GOOGLE_CSE_CX || '').trim(),
    };
}

export function getGooglePlacesApiKey(settings = null) {
    const g = getGoogleConnectors(settings);
    return String(
        g.placesApiKey
        || process.env.EXTRACTOR_GOOGLE_PLACES_API_KEY
        || process.env.GOOGLE_MAPS_API_KEY
        || '',
    ).trim();
}

export function isGoogleCseConfigured(settings = null) {
    const { apiKey, cx } = getGoogleCseCredentials(settings);
    return !!(apiKey && cx);
}

export function isGooglePlacesConfigured(settings = null) {
    return !!getGooglePlacesApiKey(settings);
}

export function getGoogleKeysUiHints(settings = null) {
    const g = getGoogleConnectors(settings);
    const envCse = getGoogleCseCredentials(null);
    const envPlaces = getGooglePlacesApiKey(null);
    return {
        cseApiKeySet: !!(g.cseApiKey || envCse.apiKey),
        cseCx: g.cseCx || envCse.cx || '',
        cseCxSet: !!(g.cseCx || envCse.cx),
        placesApiKeySet: !!(g.placesApiKey || envPlaces),
        fromEnv: {
            cse: !!(envCse.apiKey && envCse.cx) && !g.cseApiKey,
            places: !!envPlaces && !g.placesApiKey,
        },
    };
}
