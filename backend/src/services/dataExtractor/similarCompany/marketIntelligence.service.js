import { ENGINE_VERSION } from './constants.js';

function uniq(list = []) {
    return [...new Set((list || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

/**
 * Cluster companies by industry/city/customer type etc. Company-scoped input only.
 */
export function buildClusters(companies = [], { groupBy = 'industry_city' } = {}) {
    const map = new Map();
    for (const c of companies || []) {
        const industry = c.classification?.parentIndustry || c.parentIndustry || 'Unknown industry';
        const city = c.record?.city || c.city || 'Unknown city';
        const customerType = c.classification?.customerType || c.customerType || 'Unknown type';
        const product = c.recommendation?.primaryRecommendation?.productName || 'Unknown product';
        let key;
        let title;
        if (groupBy === 'industry') {
            key = industry.toLowerCase();
            title = industry;
        } else if (groupBy === 'customer_type') {
            key = customerType.toLowerCase();
            title = customerType;
        } else if (groupBy === 'product') {
            key = product.toLowerCase();
            title = product;
        } else {
            key = `${industry}::${city}`.toLowerCase();
            title = `${industry} in ${city}`;
        }
        if (!map.has(key)) {
            map.set(key, {
                key,
                title,
                companies: [],
                industry,
                city,
                customerType,
            });
        }
        map.get(key).companies.push(c);
    }

    return [...map.values()].map((cluster) => {
        const total = cluster.companies.length;
        const relevant = cluster.companies.filter((c) => c.relevance?.status === 'RELEVANT').length;
        const highScore = cluster.companies.filter((c) => Number(c.score?.finalScore) >= 75).length;
        const approved = cluster.companies.filter((c) => c.manuallyApproved || c.profile?.manuallyApproved).length;
        const existingCrm = cluster.companies.filter((c) => ['CUSTOMER', 'LEAD', 'SUPPLIER'].includes(c.existingCrmStatus)).length;
        const excluded = cluster.companies.filter((c) => c.relevance?.status === 'IRRELEVANT').length;
        const withContact = cluster.companies.filter((c) => c.contact?.primaryContact || c.contact?.genericFallbackContact).length;
        const scores = cluster.companies.map((c) => Number(c.score?.finalScore)).filter((n) => Number.isFinite(n));
        const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
        const products = uniq(cluster.companies.map((c) => c.recommendation?.primaryRecommendation?.productName).filter(Boolean)).slice(0, 8);
        const sources = uniq(cluster.companies.map((c) => c.record?.sourcePlatform || c.record?.sourceType).filter(Boolean)).slice(0, 8);
        return {
            intelType: 'CLUSTER',
            recordKey: `cluster:${cluster.key}`,
            title: cluster.title,
            summary: `${total} companies in cluster "${cluster.title}" (company-scoped discovered universe).`,
            status: total ? 'GENERATED' : 'LOW_CONFIDENCE',
            confidence: total >= 3 ? 75 : 50,
            priority: highScore >= 2 ? 'HIGH' : 'MEDIUM',
            metrics: {
                totalCompaniesDiscovered: total,
                uniqueCompanies: total,
                relevantCompanies: relevant,
                highScoreCompanies: highScore,
                approvedLeads: approved,
                existingCrmCompanies: existingCrm,
                pendingReview: Math.max(0, total - approved - excluded),
                excludedIrrelevant: excluded,
                averageLeadScore: avg,
                contactAvailabilityCount: withContact,
                topProductOpportunities: products,
                topDiscoverySources: sources,
            },
            filters: { industry: cluster.industry, city: cluster.city, customerType: cluster.customerType },
            evidence: [{ type: 'cluster_size', value: total }],
            engineUsed: 'rule_based',
            modelVersion: ENGINE_VERSION,
            noAutoPaidProvider: true,
        };
    });
}

/**
 * Coverage against known discovered universe only — never total market share.
 */
export function buildMarketCoverage({
    discovered = [],
    existingCrmCount = 0,
    approvedLeadCount = 0,
    customersCount = 0,
    prospectsCount = 0,
    configuredTargetCount = null,
} = {}) {
    const discoveredCount = discovered.length;
    if (!discoveredCount && !existingCrmCount) {
        return {
            intelType: 'COVERAGE',
            recordKey: 'coverage:overall',
            title: 'Market coverage (known discovered universe)',
            summary: 'Insufficient data to compute coverage against a known discovered universe.',
            status: 'LOW_CONFIDENCE',
            coverageStatus: 'INSUFFICIENT_DATA',
            confidence: 20,
            metrics: {
                discoveredCompanies: 0,
                existingCrmRecords: existingCrmCount,
                approvedLeads: approvedLeadCount,
                customers: customersCount,
                prospects: prospectsCount,
                coverageAgainstKnownDiscoveredPercent: null,
                note: 'Do not interpret as total market share.',
            },
            evidence: [],
            engineUsed: 'rule_based',
            modelVersion: ENGINE_VERSION,
            noAutoPaidProvider: true,
        };
    }

    const knownUniverse = Math.max(discoveredCount, existingCrmCount);
    const covered = existingCrmCount + approvedLeadCount;
    const pct = knownUniverse ? Math.round((covered / knownUniverse) * 1000) / 10 : null;

    let coverageStatus = 'KNOWN_COVERAGE';
    if (configuredTargetCount == null) {
        // No verified denominator for total market
        coverageStatus = discoveredCount ? 'KNOWN_COVERAGE' : 'UNKNOWN_MARKET_SIZE';
    } else if (!Number.isFinite(Number(configuredTargetCount)) || Number(configuredTargetCount) <= 0) {
        coverageStatus = 'UNKNOWN_MARKET_SIZE';
    } else {
        coverageStatus = 'PARTIAL_COVERAGE';
    }

    return {
        intelType: 'COVERAGE',
        recordKey: 'coverage:overall',
        title: 'Market coverage (known discovered universe)',
        summary: `Known companies discovered: ${discoveredCount}. Existing CRM records: ${existingCrmCount}. Approved leads: ${approvedLeadCount}. Coverage against known discovered universe: ${pct ?? 'n/a'}%. This is not total market share.`,
        status: 'GENERATED',
        coverageStatus,
        confidence: discoveredCount ? 70 : 40,
        priority: 'MEDIUM',
        metrics: {
            discoveredCompanies: discoveredCount,
            existingCrmRecords: existingCrmCount,
            approvedLeads: approvedLeadCount,
            customers: customersCount,
            prospects: prospectsCount,
            coverageAgainstKnownDiscoveredPercent: pct,
            configuredTargetCount: configuredTargetCount == null ? null : Number(configuredTargetCount),
            note: 'Coverage is against the known discovered universe only. Do not call this total market share.',
        },
        evidence: [
            { type: 'discovered_count', value: discoveredCount },
            { type: 'existing_crm_count', value: existingCrmCount },
            { type: 'approved_leads', value: approvedLeadCount },
        ],
        engineUsed: 'rule_based',
        modelVersion: ENGINE_VERSION,
        noAutoPaidProvider: true,
    };
}

/**
 * White-space gaps from actual configured targets / observed data. Never invents market totals.
 */
export function buildWhiteSpaceGaps({
    companies = [],
    targetIndustries = [],
    targetCities = [],
    targetCustomerTypes = [],
    targetProducts = [],
} = {}) {
    const gaps = [];
    const now = new Date().toISOString();

    for (const industry of targetIndustries || []) {
        const count = companies.filter((c) => String(c.classification?.parentIndustry || '').toLowerCase() === String(industry).toLowerCase()).length;
        if (count < 3) {
            gaps.push({
                intelType: 'WHITE_SPACE',
                recordKey: `whitespace:industry:${String(industry).toLowerCase()}`,
                title: `Sparse coverage: ${industry}`,
                gapType: 'TARGET_INDUSTRY_SPARSE',
                summary: `Configured target industry "${industry}" has only ${count} discovered companies in current company-scoped data.`,
                metrics: { existingCount: count, configuredTarget: industry, expectedMarketTotal: null },
                confidence: 65,
                priority: count === 0 ? 'HIGH' : 'MEDIUM',
                recommendations: [{
                    action: 'Run discovery search',
                    keyword: `${industry} manufacturers`,
                    reason: 'Configured target industry is under-covered in discovered universe',
                    requirePaidConfirmation: true,
                }],
                evidence: [{ type: 'industry_count', industry, count }],
                sourceDataPeriod: now,
                engineUsed: 'rule_based',
                modelVersion: ENGINE_VERSION,
                noAutoPaidProvider: true,
                status: 'GENERATED',
            });
        }
    }

    for (const city of targetCities || []) {
        const approved = companies.filter((c) => String(c.record?.city || '').toLowerCase() === String(city).toLowerCase() && (c.manuallyApproved || c.profile?.manuallyApproved)).length;
        const total = companies.filter((c) => String(c.record?.city || '').toLowerCase() === String(city).toLowerCase()).length;
        if (approved === 0) {
            gaps.push({
                intelType: 'WHITE_SPACE',
                recordKey: `whitespace:city:${String(city).toLowerCase()}`,
                title: `No approved leads in ${city}`,
                gapType: 'CITY_NO_APPROVED_LEADS',
                summary: `Target city "${city}" has ${total} discovered companies and 0 approved leads in current data.`,
                metrics: { existingCount: approved, discoveredInCity: total, configuredTarget: city, expectedMarketTotal: null },
                confidence: 70,
                priority: 'HIGH',
                recommendations: [{
                    action: 'Review discovered companies or run city search',
                    keyword: `manufacturers in ${city}`,
                    location: city,
                    reason: 'Configured/observed city has no approved leads',
                    requirePaidConfirmation: true,
                }],
                evidence: [{ type: 'city_approved_count', city, approved, total }],
                sourceDataPeriod: now,
                engineUsed: 'rule_based',
                modelVersion: ENGINE_VERSION,
                noAutoPaidProvider: true,
                status: 'GENERATED',
            });
        }
    }

    for (const product of targetProducts || []) {
        const count = companies.filter((c) => String(c.recommendation?.primaryRecommendation?.productName || '').toLowerCase() === String(product).toLowerCase()).length;
        if (count < 2) {
            gaps.push({
                intelType: 'WHITE_SPACE',
                recordKey: `whitespace:product:${String(product).toLowerCase()}`,
                title: `Low prospect coverage for ${product}`,
                gapType: 'PRODUCT_OPPORTUNITY_LOW_COVERAGE',
                summary: `Product opportunity "${product}" maps to ${count} prospects in current discovered data.`,
                metrics: { existingCount: count, configuredTarget: product, expectedMarketTotal: null },
                confidence: 60,
                priority: 'MEDIUM',
                recommendations: [{
                    action: 'Expand discovery for product opportunity',
                    keyword: product,
                    reason: 'Configured product opportunity has low prospect coverage',
                    requirePaidConfirmation: true,
                }],
                evidence: [{ type: 'product_count', product, count }],
                sourceDataPeriod: now,
                engineUsed: 'rule_based',
                modelVersion: ENGINE_VERSION,
                noAutoPaidProvider: true,
                status: 'GENERATED',
            });
        }
    }

    for (const ct of targetCustomerTypes || []) {
        const count = companies.filter((c) => String(c.classification?.customerType || '').toLowerCase() === String(ct).toLowerCase()).length;
        if (count === 0) {
            gaps.push({
                intelType: 'WHITE_SPACE',
                recordKey: `whitespace:customertype:${String(ct).toLowerCase()}`,
                title: `No prospects for customer type ${ct}`,
                gapType: 'CUSTOMER_TYPE_EMPTY',
                summary: `Configured customer type "${ct}" has no active prospects in discovered data.`,
                metrics: { existingCount: 0, configuredTarget: ct, expectedMarketTotal: null },
                confidence: 70,
                priority: 'HIGH',
                recommendations: [{
                    action: 'Search by customer type',
                    keyword: `${ct} companies`,
                    reason: 'Configured customer type has zero discovered prospects',
                    requirePaidConfirmation: true,
                }],
                evidence: [{ type: 'customer_type_count', customerType: ct, count: 0 }],
                sourceDataPeriod: now,
                engineUsed: 'rule_based',
                modelVersion: ENGINE_VERSION,
                noAutoPaidProvider: true,
                status: 'GENERATED',
            });
        }
    }

    // High-value cluster with low contact availability
    const highNoContact = companies.filter((c) => Number(c.score?.finalScore) >= 75 && !c.contact?.primaryContact && !c.contact?.genericFallbackContact);
    if (highNoContact.length) {
        gaps.push({
            intelType: 'WHITE_SPACE',
            recordKey: 'whitespace:highscore_nocontact',
            title: 'High-score companies without public contacts',
            gapType: 'HIGH_VALUE_LOW_CONTACT',
            summary: `${highNoContact.length} high-score companies lack public contact channels.`,
            metrics: { existingCount: highNoContact.length, expectedMarketTotal: null },
            confidence: 75,
            priority: 'HIGH',
            recommendations: [{
                action: 'Run contact intelligence / manual research',
                reason: 'Strong fit but no decision-maker/public contact',
                requirePaidConfirmation: false,
            }],
            evidence: highNoContact.slice(0, 5).map((c) => ({ companyName: c.record?.companyName || c.companyName, finalScore: c.score?.finalScore })),
            sourceDataPeriod: now,
            engineUsed: 'rule_based',
            modelVersion: ENGINE_VERSION,
            noAutoPaidProvider: true,
            status: 'GENERATED',
        });
    }

    return gaps;
}

/**
 * Expansion suggestions — never auto-execute paid providers.
 */
export function buildExpansionSuggestions({
    whiteSpaces = [],
    clusters = [],
    successfulKeywords = [],
    targetMarket = {},
} = {}) {
    const suggestions = [];

    for (const gap of whiteSpaces || []) {
        for (const rec of gap.recommendations || []) {
            suggestions.push({
                intelType: 'EXPANSION_SUGGESTION',
                recordKey: `expand:${gap.recordKey}:${String(rec.keyword || rec.action || '').toLowerCase()}`,
                title: rec.keyword || rec.action || 'Discovery suggestion',
                summary: rec.reason || gap.summary,
                status: 'GENERATED',
                confidence: gap.confidence || 60,
                priority: gap.priority || 'MEDIUM',
                recommendations: [{
                    searchKeyword: rec.keyword || '',
                    location: rec.location || targetMarket.defaultLocation || '',
                    industry: gap.filters?.industry || gap.metrics?.configuredTarget || '',
                    customerType: '',
                    productOpportunity: '',
                    reason: rec.reason || gap.summary,
                    estimatedRelevance: gap.confidence || 60,
                    suggestedProvider: 'brave',
                    providerLimitations: 'Public web results only; paid providers require explicit confirmation and are not auto-run.',
                    manualApprovalRequired: true,
                    requirePaidConfirmation: rec.requirePaidConfirmation !== false,
                    autoExecute: false,
                }],
                evidence: gap.evidence || [],
                engineUsed: 'rule_based',
                modelVersion: ENGINE_VERSION,
                noAutoPaidProvider: true,
            });
        }
    }

    for (const cluster of (clusters || []).slice(0, 10)) {
        if ((cluster.metrics?.totalCompaniesDiscovered || 0) >= 1) {
            suggestions.push({
                intelType: 'EXPANSION_SUGGESTION',
                recordKey: `expand:cluster:${cluster.recordKey}`,
                title: `Expand around ${cluster.title}`,
                summary: `Cluster "${cluster.title}" exists in discovered data; additional nearby/peer searches may help.`,
                status: 'GENERATED',
                confidence: 55,
                priority: 'MEDIUM',
                recommendations: [{
                    searchKeyword: cluster.title,
                    location: cluster.filters?.city || '',
                    industry: cluster.filters?.industry || '',
                    customerType: cluster.filters?.customerType || '',
                    productOpportunity: (cluster.metrics?.topProductOpportunities || [])[0] || '',
                    reason: 'Existing cluster suggests adjacent discovery potential',
                    estimatedRelevance: 55,
                    suggestedProvider: 'brave',
                    providerLimitations: 'Do not auto-run SerpAPI/Places without confirmation.',
                    manualApprovalRequired: true,
                    requirePaidConfirmation: true,
                    autoExecute: false,
                }],
                evidence: [{ type: 'cluster', title: cluster.title, total: cluster.metrics?.totalCompaniesDiscovered }],
                engineUsed: 'rule_based',
                modelVersion: ENGINE_VERSION,
                noAutoPaidProvider: true,
            });
        }
    }

    for (const kw of successfulKeywords || []) {
        suggestions.push({
            intelType: 'EXPANSION_SUGGESTION',
            recordKey: `expand:keyword:${String(kw).toLowerCase()}`,
            title: `Reuse successful keyword: ${kw}`,
            summary: 'Based on previously successful search terms in this company scope.',
            status: 'GENERATED',
            confidence: 50,
            priority: 'LOW',
            recommendations: [{
                searchKeyword: kw,
                location: targetMarket.defaultLocation || '',
                industry: '',
                customerType: '',
                productOpportunity: '',
                reason: 'Existing successful search term',
                estimatedRelevance: 50,
                suggestedProvider: 'brave',
                providerLimitations: 'Paid provider calls require confirmation.',
                manualApprovalRequired: true,
                requirePaidConfirmation: true,
                autoExecute: false,
            }],
            evidence: [{ type: 'successful_keyword', value: kw }],
            engineUsed: 'rule_based',
            modelVersion: ENGINE_VERSION,
            noAutoPaidProvider: true,
        });
    }

    return suggestions;
}
