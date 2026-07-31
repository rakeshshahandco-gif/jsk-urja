export const ENGINE_VERSION = 'configuration-manager-v1';
export const SETTINGS_VERSION = '1.0.0';
export const MODULE = 'data_extractor.configuration_manager';
export const MAX_PAYLOAD_BYTES = 200_000;
export const REQUIRED_SOURCE_PHASE = 20;

export const PERMS = {
    view: `${MODULE}.view`,
    view_payload: `${MODULE}.view_payload`,
    create_draft: `${MODULE}.create_draft`,
    edit_draft: `${MODULE}.edit_draft`,
    clone: `${MODULE}.clone`,
    validate: `${MODULE}.validate`,
    compare: `${MODULE}.compare`,
    dependencies: `${MODULE}.dependencies`,
    compatibility: `${MODULE}.compatibility`,
    review: `${MODULE}.review`,
    ready_for_sandbox: `${MODULE}.ready_for_sandbox`,
    export: `${MODULE}.export`,
    saved_views: `${MODULE}.saved_views`,
    audit: `${MODULE}.audit`,
    settings: `${MODULE}.settings`,
    manage: `${MODULE}.manage`,
};

export const EDITABLE_STATUSES = ['DRAFT'];
export const IMMUTABLE_STATUSES = [
    'IN_REVIEW', 'VALIDATED', 'READY_FOR_SANDBOX', 'SANDBOX_TESTED',
    'APPROVED_FOR_FUTURE_ACTIVATION', 'RETIRED', 'REJECTED', 'ARCHIVED',
];

export const ALLOWED_TRANSITIONS = {
    DRAFT: ['IN_REVIEW', 'REJECTED', 'ARCHIVED'],
    IN_REVIEW: ['VALIDATED', 'DRAFT', 'REJECTED', 'ARCHIVED'],
    VALIDATED: ['READY_FOR_SANDBOX', 'IN_REVIEW', 'REJECTED', 'ARCHIVED'],
    READY_FOR_SANDBOX: ['SANDBOX_TESTED', 'APPROVED_FOR_FUTURE_ACTIVATION', 'RETIRED', 'ARCHIVED'],
    SANDBOX_TESTED: ['APPROVED_FOR_FUTURE_ACTIVATION', 'RETIRED', 'ARCHIVED'],
    APPROVED_FOR_FUTURE_ACTIVATION: ['RETIRED', 'ARCHIVED'],
    RETIRED: ['ARCHIVED'],
    REJECTED: ['ARCHIVED'],
    ARCHIVED: [],
};

/** Phase 21 may not set SANDBOX_TESTED via normal APIs (Phase 22 only). */
export const PHASE21_BLOCKED_TRANSITIONS = new Set(['SANDBOX_TESTED']);

export const FAMILY_DEFAULTS = [
    { code: 'LEAD_SCORE_DIMENSIONS', name: 'Lead Score Dimensions', module: 'lead_scoring' },
    { code: 'LEAD_SCORE_WEIGHTS', name: 'Lead Score Weights', module: 'lead_scoring' },
    { code: 'LEAD_SCORE_THRESHOLDS', name: 'Lead Score Thresholds', module: 'lead_scoring' },
    { code: 'LEAD_PRIORITY_BANDS', name: 'Lead Priority Bands', module: 'lead_scoring' },
    { code: 'INDUSTRY_CLASSIFICATION_RULES', name: 'Industry Classification Rules', module: 'industry_classification' },
    { code: 'INDUSTRY_SYNONYMS', name: 'Industry Synonyms', module: 'industry_classification' },
    { code: 'CUSTOMER_TYPE_MAPPINGS', name: 'Customer Type Mappings', module: 'customer_type' },
    { code: 'LEAD_RELEVANCE_RULES', name: 'Lead Relevance Rules', module: 'lead_relevance' },
    { code: 'PRODUCT_RECOMMENDATION_MAPPINGS', name: 'Product Recommendation Mappings', module: 'product_recommendation' },
    { code: 'PRODUCT_FIT_THRESHOLDS', name: 'Product-Fit Thresholds', module: 'product_recommendation' },
    { code: 'SIMILAR_COMPANY_THRESHOLDS', name: 'Similar-Company Thresholds', module: 'similar_company' },
    { code: 'DUPLICATE_DETECTION_THRESHOLDS', name: 'Duplicate-Detection Thresholds', module: 'entity_resolution' },
    { code: 'ENTITY_RESOLUTION_THRESHOLDS', name: 'Entity-Resolution Thresholds', module: 'entity_resolution' },
    { code: 'CONTACT_ROLE_MAPPINGS', name: 'Contact-Role Mappings', module: 'contact_intelligence' },
    { code: 'CONTACT_CONFIDENCE_THRESHOLDS', name: 'Contact-Confidence Thresholds', module: 'contact_intelligence' },
    { code: 'SOURCE_PRIORITY_RULES', name: 'Source-Priority Rules', module: 'source_priority' },
    { code: 'KG_RELATIONSHIP_RULES', name: 'Knowledge Graph Relationship Rules', module: 'knowledge_graph' },
    { code: 'KG_CONFIDENCE_THRESHOLDS', name: 'Knowledge Graph Confidence Thresholds', module: 'knowledge_graph' },
    { code: 'ASSISTANT_TEMPLATES', name: 'AI Sales Assistant Templates', module: 'sales_assistant' },
    { code: 'ASSISTANT_CLARIFICATION_TEMPLATES', name: 'Assistant Clarification Templates', module: 'sales_assistant' },
    { code: 'MARKETING_DRAFT_TEMPLATES', name: 'Marketing Draft Templates', module: 'marketing_intelligence' },
    { code: 'DATA_QUALITY_VALIDATION_RULES', name: 'Data-Quality Validation Rules', module: 'data_quality' },
    { code: 'MANUAL_REVIEW_THRESHOLDS', name: 'Manual-Review Thresholds', module: 'manual_review' },
    { code: 'BATCH_QUALITY_THRESHOLDS', name: 'Batch Quality Thresholds', module: 'batch_quality' },
];

export const DEFAULT_FAMILY_DEPENDENCIES = {
    LEAD_SCORE_WEIGHTS: ['LEAD_SCORE_DIMENSIONS'],
    LEAD_SCORE_THRESHOLDS: ['LEAD_SCORE_WEIGHTS'],
    LEAD_PRIORITY_BANDS: ['LEAD_SCORE_THRESHOLDS'],
    PRODUCT_RECOMMENDATION_MAPPINGS: ['INDUSTRY_CLASSIFICATION_RULES'],
    PRODUCT_FIT_THRESHOLDS: ['PRODUCT_RECOMMENDATION_MAPPINGS'],
    ASSISTANT_TEMPLATES: ['PRODUCT_RECOMMENDATION_MAPPINGS'],
    MARKETING_DRAFT_TEMPLATES: ['PRODUCT_RECOMMENDATION_MAPPINGS'],
    KG_CONFIDENCE_THRESHOLDS: ['KG_RELATIONSHIP_RULES'],
};

export const UNSAFE_PAYLOAD_PATTERNS = [
    /\beval\s*\(/i,
    /\bFunction\s*\(/i,
    /\bnew\s+Function\b/i,
    /javascript\s*:/i,
    /<\s*script\b/i,
    /\brequire\s*\(/i,
    /\bimport\s*\(/i,
    /\bdynamic\s+import/i,
    /\$where\b/i,
    /\$function\b/i,
    /\$expr\b/i,
    /\$lookup\b/i,
    /\bSELECT\s+.+\s+FROM\b/i,
    /\bDROP\s+TABLE\b/i,
    /\bINSERT\s+INTO\b/i,
    /\bUPDATE\s+\w+\s+SET\b/i,
    /\bDELETE\s+FROM\b/i,
    /process\.env/i,
    /child_process/i,
    /fs\.readFile/i,
];

export const DEFAULT_SETTINGS = {
    version: SETTINGS_VERSION,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    allowManualDraftWithoutSpec: true,
    maxPayloadBytes: MAX_PAYLOAD_BYTES,
    requireChecksumMatchForSpec: true,
    rejectExecutableSpecifications: true,
    allowReadyForSandboxWithoutWarnings: false,
    missingProductMasterPolicy: 'REJECT',
    missingIndustryPolicy: 'WARN',
};
