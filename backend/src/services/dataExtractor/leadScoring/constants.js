export const ENGINE_VERSION = 'lead-scoring-v1';
export const SETTINGS_VERSION = 'lead-scoring-settings-v1';

export const DEFAULT_DIMENSIONS = Object.freeze([
    { id: 'industry_fit', label: 'Industry Fit', weight: 25, maxScore: 25, active: true },
    { id: 'target_market_fit', label: 'Target-Market Fit', weight: 20, maxScore: 20, active: true },
    { id: 'product_opportunity', label: 'Product/Service Opportunity', weight: 20, maxScore: 20, active: true },
    { id: 'customer_type_fit', label: 'Customer-Type Fit', weight: 5, maxScore: 5, active: true },
    { id: 'contact_quality', label: 'Contact Quality', weight: 15, maxScore: 15, active: true },
    { id: 'decision_maker', label: 'Decision-Maker Availability', weight: 5, maxScore: 5, active: true },
    { id: 'data_completeness', label: 'Data Completeness', weight: 5, maxScore: 5, active: true },
    { id: 'source_reliability', label: 'Source Reliability', weight: 5, maxScore: 5, active: true },
    { id: 'multi_source', label: 'Multi-Source Confirmation', weight: 3, maxScore: 3, active: true },
    { id: 'geographic_fit', label: 'Geographic Fit', weight: 2, maxScore: 2, active: true },
    { id: 'search_intent', label: 'Search-Intent Match', weight: 2, maxScore: 2, active: true },
    { id: 'opportunity_priority', label: 'Opportunity Priority', weight: 3, maxScore: 3, active: true },
    { id: 'profile_confidence', label: 'Company Profile Confidence', weight: 3, maxScore: 3, active: true },
    { id: 'entity_confidence', label: 'Duplicate/Entity Confidence', weight: 2, maxScore: 2, active: true },
]);

/** Default priority thresholds (score descending). */
export const DEFAULT_PRIORITY_THRESHOLDS = Object.freeze([
    { priority: 'CRITICAL', minScore: 90 },
    { priority: 'HIGH', minScore: 75 },
    { priority: 'MEDIUM', minScore: 55 },
    { priority: 'LOW', minScore: 35 },
    { priority: 'NO_PRIORITY', minScore: 0 },
]);

export const DEFAULT_GRADE_THRESHOLDS = Object.freeze([
    { grade: 'A+', minScore: 92 },
    { grade: 'A', minScore: 80 },
    { grade: 'B', minScore: 65 },
    { grade: 'C', minScore: 50 },
    { grade: 'D', minScore: 30 },
    { grade: 'REJECT', minScore: 0 },
]);

export const DEFAULT_ACTIONS = Object.freeze([
    'Contact immediately',
    'Assign to salesperson',
    'Send brochure/catalog',
    'Request purchase contact',
    'Request technical requirement',
    'Create Lead Draft',
    'Manual research required',
    'Nurture later',
    'Low priority',
    'No action',
]);

export const DEFAULT_SCORING_SETTINGS = Object.freeze({
    enabled: true,
    scoringMode: 'rule_based',
    version: SETTINGS_VERSION,
    dimensions: DEFAULT_DIMENSIONS,
    priorityThresholds: DEFAULT_PRIORITY_THRESHOLDS,
    gradeThresholds: DEFAULT_GRADE_THRESHOLDS,
    minimumConfidence: 40,
    reviewBelowScore: 50,
    rejectBelowScore: 0,
    staleDataPenalty: 5,
    duplicatePenalty: 8,
    conflictPenalty: 6,
    noContactPenalty: 10,
    genericContactPenalty: 5,
    exclusionKeywordPenalty: 12,
    outdatedProfilePenalty: 6,
    missingDataPenaltyPerItem: 1,
    maxMissingDataPenalty: 8,
    manualApprovalBoost: 3,
    maxAiAdjustment: 5,
    autoScoreOnUpstreamChange: false,
    requireReviewBelowConfidence: 45,
});
