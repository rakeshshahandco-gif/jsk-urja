export const ENGINE_VERSION = 'sandbox-evaluation-v1';
export const SETTINGS_VERSION = '1.0.0';
export const MODULE = 'data_extractor.sandbox_evaluation';
export const MAX_RESULT_ROWS = 5000;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MIN_DATASET_SIZE = 3;

export const PERMS = {
    view: `${MODULE}.view`,
    create: `${MODULE}.create`,
    validate: `${MODULE}.validate`,
    run: `${MODULE}.run`,
    cancel: `${MODULE}.cancel`,
    view_results: `${MODULE}.view_results`,
    view_row_detail: `${MODULE}.view_row_detail`,
    compare: `${MODULE}.compare`,
    export: `${MODULE}.export`,
    saved_views: `${MODULE}.saved_views`,
    audit: `${MODULE}.audit`,
    settings: `${MODULE}.settings`,
    manage: `${MODULE}.manage`,
};

/** Families with safe deterministic in-memory adapters. */
export const SUPPORTED_FAMILIES = new Set([
    'LEAD_SCORE_DIMENSIONS', 'LEAD_SCORE_WEIGHTS', 'LEAD_SCORE_THRESHOLDS', 'LEAD_PRIORITY_BANDS',
    'INDUSTRY_CLASSIFICATION_RULES', 'CUSTOMER_TYPE_MAPPINGS', 'LEAD_RELEVANCE_RULES',
    'PRODUCT_RECOMMENDATION_MAPPINGS', 'PRODUCT_FIT_THRESHOLDS',
    'SIMILAR_COMPANY_THRESHOLDS', 'DUPLICATE_DETECTION_THRESHOLDS', 'ENTITY_RESOLUTION_THRESHOLDS',
    'CONTACT_ROLE_MAPPINGS', 'CONTACT_CONFIDENCE_THRESHOLDS',
    'KG_RELATIONSHIP_RULES', 'KG_CONFIDENCE_THRESHOLDS',
    'ASSISTANT_TEMPLATES', 'ASSISTANT_CLARIFICATION_TEMPLATES',
    'MARKETING_DRAFT_TEMPLATES', 'DATA_QUALITY_VALIDATION_RULES', 'SOURCE_PRIORITY_RULES',
]);

export const ALLOWED_TRANSITIONS = {
    DRAFT: ['VALIDATING', 'CANCELLED', 'ARCHIVED'],
    VALIDATING: ['READY', 'FAILED', 'CANCELLED'],
    READY: ['RUNNING', 'CANCELLED', 'ARCHIVED'],
    RUNNING: ['COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED', 'CANCELLED'],
    COMPLETED: ['ARCHIVED'],
    COMPLETED_WITH_WARNINGS: ['ARCHIVED'],
    FAILED: ['ARCHIVED', 'DRAFT'],
    CANCELLED: ['ARCHIVED'],
    ARCHIVED: [],
};

export const RECOMMENDATION_CODES = [
    'READY_FOR_FURTHER_REVIEW', 'NEEDS_CONFIGURATION_CHANGE', 'NEEDS_MORE_DATA',
    'NEEDS_MORE_GROUND_TRUTH', 'HIGH_REGRESSION_RISK', 'PERFORMANCE_RISK',
    'PRIVACY_RISK', 'SECURITY_RISK', 'NOT_RECOMMENDED', 'INCONCLUSIVE',
];

export const DEFAULT_SETTINGS = {
    version: SETTINGS_VERSION,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    minimumDatasetSize: DEFAULT_MIN_DATASET_SIZE,
    minimumVerifiedGroundTruthRows: 1,
    maximumResultRows: MAX_RESULT_ROWS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    requireRollbackTarget: true,
    requireCandidateReadyForSandbox: true,
    maximumRegressionPercentage: 40,
    minimumImprovementPercentage: 0,
    maximumFalsePositiveIncrease: 25,
    maximumFalseNegativeIncrease: 25,
    maximumPerformanceDegradationPct: 200,
    requirePrivacyPass: true,
    requireTenantIsolationPass: true,
    requireSecurityPass: true,
    markSandboxTestedOnComplete: true,
};

export const UNSAFE_PATTERNS = [
    /\beval\s*\(/i, /\bFunction\s*\(/i, /\$where\b/i, /\$expr\b/i,
    /\brequire\s*\(/i, /\bimport\s*\(/i, /child_process/i, /process\.env/i,
];
