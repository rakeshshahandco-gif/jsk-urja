/**
 * Geographic comparison.
 * Never fabricates coordinates. Radius only when both sides have valid lat/lng.
 */
export function haversineKm(a, b) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function coordsOf(record = {}) {
    const lat = Number(record.latitude ?? record.lat ?? record.geo?.lat);
    const lng = Number(record.longitude ?? record.lng ?? record.geo?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
    }
    return null;
}

export function compareGeography(seedRecord = {}, candidateRecord = {}, settings = {}) {
    const seedCoords = coordsOf(seedRecord);
    const candCoords = coordsOf(candidateRecord);
    const defaultRadius = Number(settings.defaultRadiusKm) || 25;

    if (seedCoords && candCoords) {
        const distanceKm = haversineKm(seedCoords, candCoords);
        const within = distanceKm <= defaultRadius;
        return {
            matchType: within ? 'RADIUS_MATCH' : 'COORDINATE_DISTANCE',
            distanceKm: Math.round(distanceKm * 10) / 10,
            geographicConfidence: within ? 85 : 60,
            score: within ? 100 : distanceKm <= defaultRadius * 2 ? 40 : 10,
            reason: within
                ? `Within ${defaultRadius} km (distance ${distanceKm.toFixed(1)} km)`
                : `Coordinates available; distance ${distanceKm.toFixed(1)} km`,
            source: 'geocoded_coordinates',
        };
    }

    const seedCity = String(seedRecord.city || '').trim().toLowerCase();
    const candCity = String(candidateRecord.city || '').trim().toLowerCase();
    const seedState = String(seedRecord.stateProvince || seedRecord.state || '').trim().toLowerCase();
    const candState = String(candidateRecord.stateProvince || candidateRecord.state || '').trim().toLowerCase();
    const seedPin = String(seedRecord.pincode || seedRecord.pin || '').trim();
    const candPin = String(candidateRecord.pincode || candidateRecord.pin || '').trim();
    const seedEstate = String(seedRecord.industrialEstate || seedRecord.industrialArea || '').trim().toLowerCase();
    const candEstate = String(candidateRecord.industrialEstate || candidateRecord.industrialArea || '').trim().toLowerCase();

    if (seedEstate && candEstate && seedEstate === candEstate) {
        return {
            matchType: 'TEXTUAL_LOCATION_MATCH',
            distanceKm: null,
            geographicConfidence: 70,
            score: 90,
            reason: `Same industrial estate/area (textual): ${seedRecord.industrialEstate || seedRecord.industrialArea}`,
            source: 'textual_location',
        };
    }
    if (seedPin && candPin && seedPin === candPin) {
        return {
            matchType: 'TEXTUAL_LOCATION_MATCH',
            distanceKm: null,
            geographicConfidence: 65,
            score: 80,
            reason: `Same PIN code (textual): ${seedPin}`,
            source: 'textual_location',
        };
    }
    if (seedCity && candCity && seedCity === candCity) {
        return {
            matchType: 'TEXTUAL_LOCATION_MATCH',
            distanceKm: null,
            geographicConfidence: 55,
            score: 70,
            reason: `Same city (textual match, not exact distance): ${seedRecord.city}`,
            source: 'textual_location',
        };
    }
    if (seedState && candState && seedState === candState) {
        return {
            matchType: 'TEXTUAL_LOCATION_MATCH',
            distanceKm: null,
            geographicConfidence: 40,
            score: 40,
            reason: `Same state (textual match, not exact distance): ${seedRecord.stateProvince || seedRecord.state}`,
            source: 'textual_location',
        };
    }
    if (!seedCity && !seedState && !seedPin && !seedCoords) {
        return {
            matchType: 'INSUFFICIENT_LOCATION',
            distanceKm: null,
            geographicConfidence: 0,
            score: 0,
            reason: 'Insufficient location data',
            source: 'none',
        };
    }
    return {
        matchType: 'NO_MATCH',
        distanceKm: null,
        geographicConfidence: 20,
        score: 0,
        reason: 'No shared textual location; radius unavailable without coordinates',
        source: 'textual_location',
    };
}

export function assertRadiusRequiresCoordinates(seedRecord, candidateRecord) {
    return !!(coordsOf(seedRecord) && coordsOf(candidateRecord));
}
