export function computeLeadScore(record) {
    let score = 0;

    if (record.companyName) score += 15;
    if (record.website) score += 10;
    if (record.email) score += 20;
    if (record.phone || record.mobile) score += 15;
    if (record.address) score += 5;
    if (record.city && record.stateProvince) score += 10;
    if (record.country) score += 5;
    if (record.businessDescription && record.businessDescription.length > 40) score += 10;

    if (record.aiClassification) {
        const cls = String(record.aiClassification).toLowerCase();
        if (cls === 'manufacturer' || cls === 'oem') score += 8;
        else if (cls === 'exporter' || cls === 'trader') score += 4;
    }

    const nature = String(record.natureOfBusiness || '').toLowerCase();
    if (nature === 'manufacturer' || nature === 'oem') score += 10;
    else if (nature === 'trader' || nature === 'exporter') score += 5;

    if (record.duplicateStatus === 'possible_duplicate') score -= 15;
    if (record._isDuplicate) score -= 10;

    const confidence = Number(record.confidenceScore) || 0;
    score += Math.round(confidence * 0.15);

    return Math.max(0, Math.min(100, score));
}

export function applyLeadScores(records) {
    return records.map((rec) => ({
        ...rec,
        leadScore: computeLeadScore(rec),
    }));
}
