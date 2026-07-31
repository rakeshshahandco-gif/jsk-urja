/**
 * Rule-based SearchQuery generator (Checkpoint 2).
 * Deterministic templates only — no external AI.
 */
import {
    collapseWhitespace,
    joinLocation,
    locationParts,
    normalizeQueryKey,
    queryTokenSignature,
} from './normalize.util.js';

/** Map campaign sources to SearchQuery sourceHint values used for generation. */
export function resolveGenerationSources(campaignSources = [], selectedSources = []) {
    const campaignHints = [];
    for (const s of campaignSources || []) {
        const v = String(s || '').toLowerCase();
        if (['google', 'facebook', 'indiamart', 'official_website', 'web'].includes(v)) {
            if (!campaignHints.includes(v)) campaignHints.push(v);
        }
    }
    if (!campaignHints.length) campaignHints.push('google');

    if (selectedSources?.length) {
        return selectedSources.filter((s) => campaignHints.includes(s) || s === 'manual');
    }
    return campaignHints;
}

function pushCandidate(bucket, candidate, seenExact, seenNear) {
    const text = collapseWhitespace(candidate.queryText || '');
    if (!text || text.length < 2) {
        bucket.rejectedAsLowQuality += 1;
        return;
    }
    const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length < 2 && !text.includes(':')) {
        bucket.rejectedAsLowQuality += 1;
        return;
    }
    if (tokens.length > 14) {
        bucket.rejectedAsLowQuality += 1;
        return;
    }

    const normalized = normalizeQueryKey(text);
    const signature = queryTokenSignature(text);
    if (seenExact.has(normalized)) {
        bucket.exactDuplicatesSkipped += 1;
        return;
    }
    if (seenNear.has(signature)) {
        bucket.nearDuplicatesSkipped += 1;
        return;
    }
    seenExact.add(normalized);
    seenNear.add(signature);
    bucket.items.push({
        ...candidate,
        queryText: text,
        queryNormalized: normalized,
        tokenSignature: signature,
    });
}

function withLoc(base, locStr) {
    if (!locStr) return base;
    return `${base} ${locStr}`;
}

function score({ hasIndustry, hasProduct, hasBiz, hasGeo, sourceSpecific, technical }) {
    let s = 40;
    if (hasIndustry && hasBiz && hasGeo) s = 92;
    else if (hasProduct && hasBiz && hasGeo) s = 90;
    else if (hasIndustry && hasGeo) s = 82;
    else if (hasProduct && hasGeo) s = 80;
    else if (hasIndustry && hasBiz) s = 78;
    else if (hasProduct && hasBiz) s = 76;
    else if (sourceSpecific) s = 74;
    else if (technical) s = 72;
    else if (hasIndustry) s = 65;
    else if (hasProduct) s = 62;
    return Math.max(0, Math.min(100, s));
}

function typeAllowed(selectedTypes, type) {
    if (!selectedTypes?.length) return true;
    return selectedTypes.includes(type);
}

/**
 * Build ranked candidate queries from a SearchCampaign document.
 */
export function generateQueryCandidates(campaign, options = {}) {
    const limit = options.requestedLimit || 30;
    const includeTechnical = options.includeTechnicalQueries !== false;
    const includeSiteOps = options.includeSiteOperators !== false;
    const includeNeg = options.includeNegativeKeywords !== false;
    const selectedTypes = options.selectedQueryTypes || [];

    const industry = collapseWhitespace(campaign.targetIndustry || '');
    const related = (campaign.relatedIndustries || []).map(collapseWhitespace).filter(Boolean);
    const products = (campaign.targetProducts || []).map(collapseWhitespace).filter(Boolean);
    const bizTypes = (campaign.businessTypes || []).map(collapseWhitespace).filter(Boolean);
    const includes = (campaign.includeKeywords || []).map(collapseWhitespace).filter(Boolean);
    const excludes = (campaign.excludeKeywords || []).map(collapseWhitespace).filter(Boolean);
    const locs = locationParts(campaign);
    const locBest = locs.city || locs.state || locs.country || '';
    const locCountry = locs.country || '';
    const locState = locs.state || '';
    const locCity = locs.city || '';
    const locJoined = joinLocation(locs);

    const sources = resolveGenerationSources(campaign.sources, options.selectedSources);

    const SAFE_NEGATIVE = new Set(['jobs', 'job', 'course', 'courses', 'training', 'diy', 'internship', 'vacancy']);
    const negSuffix = [];
    if (includeNeg && sources.includes('google')) {
        for (const ex of excludes) {
            const key = ex.toLowerCase();
            if (SAFE_NEGATIVE.has(key) || SAFE_NEGATIVE.has(key.replace(/s$/, ''))) {
                negSuffix.push(`-${key.replace(/\s+/g, '')}`);
            }
        }
    }
    const negStr = negSuffix.length ? ` ${negSuffix.slice(0, 3).join(' ')}` : '';

    const bucket = {
        items: [],
        exactDuplicatesSkipped: 0,
        nearDuplicatesSkipped: 0,
        rejectedAsLowQuality: 0,
    };
    const seenExact = new Set();
    const seenNear = new Set();

    const add = (partial) => {
        if (!typeAllowed(selectedTypes, partial.queryType)) return;
        pushCandidate(bucket, partial, seenExact, seenNear);
    };

    const metaBase = {
        targetIndustry: industry || undefined,
        country: locCountry || undefined,
        state: locState || undefined,
        city: locCity || undefined,
        excludeKeywords: excludes.length ? excludes : undefined,
    };

    if (industry && typeAllowed(selectedTypes, 'industry')) {
        add({
            queryText: withLoc(`${industry} companies`, locCountry || locBest),
            sourceHint: sources.includes('google') ? 'google' : sources[0],
            queryType: 'industry',
            priorityScore: score({ hasIndustry: true, hasGeo: !!(locCountry || locBest) }),
            generatedFrom: { ...metaBase },
            selectedCriteria: { targetIndustry: industry, country: locCountry || undefined },
        });
        if (locCity) {
            add({
                queryText: `${industry} companies ${locCity}`,
                sourceHint: sources.includes('google') ? 'google' : sources[0],
                queryType: 'geography',
                priorityScore: score({ hasIndustry: true, hasGeo: true }),
                generatedFrom: { ...metaBase },
                selectedCriteria: { targetIndustry: industry, city: locCity },
            });
        }
    }

    if (industry) {
        for (const biz of bizTypes.slice(0, 8)) {
            const plural = /integrator|consultant|manufacturer|oem|distributor|dealer/i.test(biz)
                ? (biz.toLowerCase().endsWith('s') ? biz : `${biz}s`)
                : biz;
            add({
                queryText: withLoc(`${industry} ${plural}`, locCountry || locBest) + (sources.includes('google') ? negStr : ''),
                sourceHint: sources.includes('google') ? 'google' : sources[0],
                queryType: 'business_type',
                priorityScore: score({ hasIndustry: true, hasBiz: true, hasGeo: !!(locCountry || locBest) }),
                generatedFrom: { ...metaBase, businessType: biz },
                selectedCriteria: { targetIndustry: industry, businessType: biz, country: locCountry || undefined },
            });
        }
    }

    for (const product of products.slice(0, 8)) {
        const topBiz = bizTypes.filter((b) => /manufacturer|oem|integrator|distributor|dealer/i.test(b)).slice(0, 4);
        const bizList = topBiz.length ? topBiz : bizTypes.slice(0, 2);
        for (const biz of bizList) {
            add({
                queryText: withLoc(`${product} ${biz}`, locCountry || locBest),
                sourceHint: sources.includes('google') ? 'google' : sources[0],
                queryType: 'product',
                priorityScore: score({ hasProduct: true, hasBiz: true, hasGeo: !!(locCountry || locBest) }),
                generatedFrom: { ...metaBase, targetProduct: product, businessType: biz },
                selectedCriteria: { targetProduct: product, businessType: biz, country: locCountry || undefined },
            });
        }
        if (locCountry || locBest) {
            add({
                queryText: `${product} suppliers ${locCountry || locBest}`,
                sourceHint: sources.includes('google') ? 'google' : sources[0],
                queryType: 'product',
                priorityScore: score({ hasProduct: true, hasGeo: true }),
                generatedFrom: { ...metaBase, targetProduct: product },
                selectedCriteria: { targetProduct: product, country: locCountry || locBest },
            });
        }
    }

    if (industry) {
        for (const product of products.slice(0, 5)) {
            add({
                queryText: withLoc(`${industry} ${product}`, locCountry || locBest),
                sourceHint: sources.includes('google') ? 'google' : sources[0],
                queryType: 'product',
                priorityScore: score({ hasIndustry: true, hasProduct: true, hasGeo: !!(locCountry || locBest) }),
                generatedFrom: { ...metaBase, targetProduct: product },
                selectedCriteria: { targetIndustry: industry, targetProduct: product },
            });
        }
    }

    for (const rel of related.slice(0, 4)) {
        const biz = bizTypes.find((b) => /integrator|manufacturer|consultant/i.test(b)) || 'companies';
        const bizWord = /companies/i.test(biz) ? biz : (biz.toLowerCase().endsWith('s') ? biz : `${biz}s`);
        add({
            queryText: withLoc(`${rel} ${bizWord}`, locCountry || locState || locBest),
            sourceHint: sources.includes('google') ? 'google' : sources[0],
            queryType: 'industry',
            priorityScore: score({ hasIndustry: true, hasBiz: true, hasGeo: !!(locCountry || locBest) }) - 5,
            generatedFrom: { ...metaBase, relatedIndustry: rel, businessType: biz },
            selectedCriteria: { relatedIndustry: rel, country: locCountry || undefined },
        });
    }

    if (includeTechnical) {
        const techTerms = [
            ...products.filter((p) => /dali|knx|tuya|gateway|sensor|driver|controller|iot/i.test(p)),
            ...includes.filter((k) => /dali|knx|tuya|iot|lighting|modbus|bacnet/i.test(k)),
        ].slice(0, 6);
        for (const term of techTerms) {
            const biz = bizTypes.find((b) => /integrator|manufacturer/i.test(b)) || 'system integrator';
            add({
                queryText: withLoc(`"${term}" ${biz}`, locCountry || locBest),
                sourceHint: sources.includes('google') ? 'google' : sources[0],
                queryType: 'technical',
                priorityScore: score({ technical: true, hasGeo: !!(locCountry || locBest), hasProduct: true }),
                generatedFrom: { ...metaBase, technicalTerm: term, businessType: biz },
                selectedCriteria: { technicalTerm: term },
            });
        }
        for (const kw of includes.slice(0, 3)) {
            if (industry && !techTerms.map((t) => t.toLowerCase()).includes(kw.toLowerCase())) {
                add({
                    queryText: withLoc(`${industry} ${kw}`, locCountry || locBest),
                    sourceHint: sources.includes('google') ? 'google' : sources[0],
                    queryType: 'technical',
                    priorityScore: 68,
                    generatedFrom: { ...metaBase, includeKeyword: kw },
                    selectedCriteria: { targetIndustry: industry, includeKeyword: kw },
                });
            }
        }
    }

    if (includeSiteOps) {
        if (sources.includes('indiamart') && industry) {
            add({
                queryText: `site:indiamart.com ${industry} manufacturer`,
                sourceHint: 'indiamart',
                queryType: 'site_operator',
                priorityScore: score({ sourceSpecific: true, hasIndustry: true }),
                generatedFrom: { ...metaBase, source: 'indiamart' },
                selectedCriteria: { targetIndustry: industry, source: 'indiamart' },
            });
            for (const product of products.slice(0, 3)) {
                add({
                    queryText: locBest
                        ? `site:indiamart.com ${product} supplier ${locBest}`
                        : `site:indiamart.com ${product} supplier`,
                    sourceHint: 'indiamart',
                    queryType: 'site_operator',
                    priorityScore: score({ sourceSpecific: true, hasProduct: true, hasGeo: !!locBest }),
                    generatedFrom: { ...metaBase, targetProduct: product, source: 'indiamart' },
                    selectedCriteria: { targetProduct: product, source: 'indiamart' },
                });
            }
        }

        if (sources.includes('facebook') && industry) {
            add({
                queryText: withLoc(`site:facebook.com ${industry} company`, locCountry || locBest),
                sourceHint: 'facebook',
                queryType: 'site_operator',
                priorityScore: score({ sourceSpecific: true, hasIndustry: true, hasGeo: !!(locCountry || locBest) }),
                generatedFrom: { ...metaBase, source: 'facebook' },
                selectedCriteria: { targetIndustry: industry, source: 'facebook' },
            });
            add({
                queryText: withLoc(`site:facebook.com/groups ${industry}`, locCountry || locBest),
                sourceHint: 'facebook',
                queryType: 'site_operator',
                priorityScore: score({ sourceSpecific: true, hasIndustry: true }) - 3,
                generatedFrom: { ...metaBase, source: 'facebook' },
                selectedCriteria: { targetIndustry: industry, source: 'facebook' },
            });
        }

        if (sources.includes('official_website') && industry) {
            add({
                queryText: withLoc(`"${industry}" "official website"`, locCountry || locBest),
                sourceHint: 'official_website',
                queryType: 'source_specific',
                priorityScore: score({ sourceSpecific: true, hasIndustry: true, hasGeo: !!(locCountry || locBest) }),
                generatedFrom: { ...metaBase, source: 'official_website' },
                selectedCriteria: { targetIndustry: industry, source: 'official_website' },
            });
            for (const product of products.slice(0, 2)) {
                add({
                    queryText: withLoc(`"${product}" "contact us"`, locCountry || locBest),
                    sourceHint: 'official_website',
                    queryType: 'source_specific',
                    priorityScore: score({ sourceSpecific: true, hasProduct: true }),
                    generatedFrom: { ...metaBase, targetProduct: product, source: 'official_website' },
                    selectedCriteria: { targetProduct: product, source: 'official_website' },
                });
            }
        }

        if (sources.includes('web') && industry) {
            add({
                queryText: withLoc(`"${industry}" "contact us"`, locCountry || locBest),
                sourceHint: 'web',
                queryType: 'source_specific',
                priorityScore: 70,
                generatedFrom: { ...metaBase, source: 'web' },
                selectedCriteria: { targetIndustry: industry, source: 'web' },
            });
        }

        if (sources.includes('google') && industry) {
            add({
                queryText: withLoc(`"${industry}" "contact us"`, locCountry || locBest) + negStr,
                sourceHint: 'google',
                queryType: 'source_specific',
                priorityScore: 73,
                generatedFrom: { ...metaBase, source: 'google' },
                selectedCriteria: { targetIndustry: industry, source: 'google' },
            });
        }
    }

    bucket.items.sort((a, b) => (b.priorityScore - a.priorityScore) || a.queryText.localeCompare(b.queryText));
    // Keep commercial variety: reserve slots for site/source queries so product cartesian cannot crowd them out.
    const preferredTypes = new Set(['site_operator', 'source_specific', 'technical', 'business_type', 'geography']);
    const reserved = [];
    const rest = [];
    for (const item of bucket.items) {
        if (preferredTypes.has(item.queryType) && reserved.filter((r) => r.queryType === item.queryType).length < 4) {
            reserved.push(item);
        } else {
            rest.push(item);
        }
    }
    const limited = [];
    const seen = new Set();
    for (const item of [...reserved, ...rest]) {
        if (limited.length >= limit) break;
        if (seen.has(item.queryNormalized)) continue;
        seen.add(item.queryNormalized);
        limited.push(item);
    }

    return {
        items: limited,
        stats: {
            requested: limit,
            generated: limited.length,
            exactDuplicatesSkipped: bucket.exactDuplicatesSkipped,
            nearDuplicatesSkipped: bucket.nearDuplicatesSkipped,
            rejectedAsLowQuality: bucket.rejectedAsLowQuality,
            locationUsed: locJoined || null,
            sourcesUsed: sources,
        },
    };
}

export function isNearDuplicateText(a, b) {
    return queryTokenSignature(a) === queryTokenSignature(b);
}
