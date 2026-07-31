export const ENGINE_VERSION = 'product-recommendation-v1';

export const DEFAULT_WEIGHTS = Object.freeze({
    industryMatch: 22,
    subIndustryMatch: 18,
    customerTypeMatch: 14,
    productKeywordMatch: 16,
    websiteKeywordMatch: 10,
    businessDescriptionMatch: 10,
    companyProductMatch: 14,
    applicationMatch: 10,
    opportunityMapMatch: 12,
    targetMarketBoost: 8,
    locationBoost: 6,
    classificationConfidenceBoost: 8,
    relevanceScoreBoost: 10,
    negativeKeywordPenalty: 20,
    exclusionPenalty: 28,
    multiSourceAgreement: 10,
});

export const SALES_STRATEGIES = Object.freeze([
    'High Priority',
    'Medium Priority',
    'Low Priority',
    'Long-term Opportunity',
    'Existing Customer Upsell',
    'Distributor Opportunity',
    'OEM Opportunity',
    'Export Opportunity',
    'System Integrator',
    'Consultant',
    'Dealer',
    'Manufacturer',
    'Service Provider',
]);
