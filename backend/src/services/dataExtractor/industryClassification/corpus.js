function uniqStrings(list = []) {
    return [...new Set((list || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

function normalizeText(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9\s./:-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildClassificationCorpus(record = {}) {
    const raw = record.rawExtractedData || {};
    const parts = [
        record.companyName,
        record.legalName,
        record.businessDescription,
        record.natureOfBusiness,
        record.website,
        record.sourceUrl,
        record.city,
        record.stateProvince || record.state,
        record.country,
        raw.websiteTitle,
        raw.metaDescription,
        raw.aboutPageText,
        raw.productPageText,
        raw.indiamartDescription,
        raw.facebookCategory,
        raw.instagramCategory,
        raw.instagramBio,
        ...(record.productCategories || []),
        ...(record.keywords || []),
        ...(raw.publicProductNames || []),
        ...(raw.directoryCategories || []),
        ...(raw.indiamartCategories || []),
        ...(raw.sourceUrls || []),
        ...((raw.discoveredWebsites || []).map((x) => x.normalized || x.value)),
        ...((raw.discoveredDomains || []).map((x) => x.normalized || x.value)),
        ...((raw.publicEmails || []).map((x) => x.normalized || x.value)),
    ];
    const corpus = normalizeText(parts.filter(Boolean).join(' \n '));
    const sourceUrls = uniqStrings([
        record.sourceUrl,
        ...(raw.sourceUrls || []),
        ...((raw.discoveredWebsites || []).map((x) => x.normalized || x.value)),
    ]);
    const sourceProviders = uniqStrings([
        ...(raw.sourceProviders || []),
        raw.sourceProvider,
        record.sourcePlatform,
    ]);
    return { corpus, sourceUrls, sourceProviders, normalized: corpus };
}

export function keywordHits(haystack, keywords = []) {
    const hits = [];
    for (const word of uniqStrings(keywords).map((x) => x.toLowerCase())) {
        if (!word) continue;
        if (haystack.includes(word)) hits.push(word);
    }
    return hits;
}

export function phrasePresent(haystack, phrase) {
    const p = normalizeText(phrase);
    return !!p && haystack.includes(p);
}

export { uniqStrings, normalizeText };
