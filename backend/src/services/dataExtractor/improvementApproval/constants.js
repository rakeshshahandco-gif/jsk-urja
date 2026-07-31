export const ENGINE_VERSION = 'improvement-approval-v1';
export const SETTINGS_VERSION = '1.0.0';
export const MODULE = 'data_extractor.improvement_approval';

export const PERMS = {
    view: `${MODULE}.view`,
    submit: `${MODULE}.submit`,
    business_review: `${MODULE}.business_review`,
    technical_review: `${MODULE}.technical_review`,
    risk_review: `${MODULE}.risk_review`,
    privacy_review: `${MODULE}.privacy_review`,
    security_review: `${MODULE}.security_review`,
    request_evidence: `${MODULE}.request_evidence`,
    approve: `${MODULE}.approve`,
    reject: `${MODULE}.reject`,
    generate_spec: `${MODULE}.generate_spec`,
    export: `${MODULE}.export`,
    saved_views: `${MODULE}.saved_views`,
    audit: `${MODULE}.audit`,
    settings: `${MODULE}.settings`,
    manage: `${MODULE}.manage`,
};

export const REVIEW_TYPE_PERMS = {
    BUSINESS_REVIEW: PERMS.business_review,
    TECHNICAL_REVIEW: PERMS.technical_review,
    RISK_REVIEW: PERMS.risk_review,
    DATA_QUALITY_REVIEW: PERMS.technical_review,
    PRIVACY_REVIEW: PERMS.privacy_review,
    SECURITY_REVIEW: PERMS.security_review,
    COMPLIANCE_REVIEW: PERMS.risk_review,
    FINAL_REVIEW: PERMS.approve,
};

/** Map Phase 19 source modules to view permissions (read-only). */
export const SOURCE_VIEW_PERMS = {
    industry_classification: 'data_extractor.lead_intelligence.view',
    customer_type_classification: 'data_extractor.lead_intelligence.view',
    lead_relevance: 'data_extractor.lead_intelligence.view',
    product_recommendation: 'data_extractor.product_recommendation.view',
    contact_intelligence: 'data_extractor.contact_intelligence.view',
    company_intelligence: 'data_extractor.company_intelligence.view',
    lead_scoring: 'data_extractor.lead_scoring.view',
    similar_company: 'data_extractor.similar_company.view',
    crm_enrichment: 'data_extractor.crm_enrichment.view',
    sales_workflow: 'data_extractor.sales_workflow.view',
    analytics: 'data_extractor.analytics.view',
    marketing_audience: 'data_extractor.marketing_intelligence.view',
    marketing_message: 'data_extractor.marketing_intelligence.view',
    sales_assistant: 'data_extractor.ai_sales_assistant.view',
    knowledge_graph: 'data_extractor.knowledge_graph.relationships',
};

export const DEFAULT_POLICY = {
    version: SETTINGS_VERSION,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    minimumSampleSize: 5,
    minimumAgreementLabels: ['STRONG_AGREEMENT', 'MAJORITY_AGREEMENT', 'SPLIT_REVIEW'],
    blockOnUnresolvedConflict: true,
    blockOnOutdatedFeedback: true,
    requireGroundTruthBeyondUserOpinion: false,
    allowUserOpinionWithConsensus: true,
    creatorCannotFinalApprove: true,
    requireDistinctBusinessAndTechnicalReviewers: true,
    requireRiskReviewForHighOrCritical: true,
    requirePrivacyReviewForContactModules: true,
    requireSecurityReviewForCritical: true,
    minimumApprovalsForSpec: 2,
    requireTwoDistinctFinalApprovers: false,
    allowedProposalStatuses: ['DRAFT', 'RECOMMENDED', 'UNDER_REVIEW', 'NEEDS_MORE_EVIDENCE', 'APPROVED_FOR_FUTURE_IMPLEMENTATION'],
    commentMaximumLength: 2000,
    conditionsMaximumCount: 20,
};

export const ALLOWED_TRANSITIONS = {
    DRAFT: ['SUBMITTED_FOR_REVIEW', 'ARCHIVED'],
    SUBMITTED_FOR_REVIEW: ['UNDER_BUSINESS_REVIEW', 'NEEDS_MORE_EVIDENCE', 'REJECTED', 'ARCHIVED'],
    UNDER_BUSINESS_REVIEW: ['UNDER_TECHNICAL_REVIEW', 'NEEDS_MORE_EVIDENCE', 'REJECTED', 'RECOMMENDED'],
    UNDER_TECHNICAL_REVIEW: ['UNDER_RISK_REVIEW', 'NEEDS_MORE_EVIDENCE', 'REJECTED', 'RECOMMENDED', 'APPROVED_FOR_IMPLEMENTATION_SPEC'],
    UNDER_RISK_REVIEW: ['RECOMMENDED', 'NEEDS_MORE_EVIDENCE', 'REJECTED', 'APPROVED_FOR_IMPLEMENTATION_SPEC'],
    NEEDS_MORE_EVIDENCE: ['SUBMITTED_FOR_REVIEW', 'UNDER_BUSINESS_REVIEW', 'REJECTED', 'ARCHIVED'],
    RECOMMENDED: ['APPROVED_FOR_IMPLEMENTATION_SPEC', 'NEEDS_MORE_EVIDENCE', 'REJECTED', 'ARCHIVED'],
    REJECTED: ['ARCHIVED'],
    APPROVED_FOR_IMPLEMENTATION_SPEC: ['IMPLEMENTATION_SPEC_GENERATED', 'ARCHIVED'],
    IMPLEMENTATION_SPEC_GENERATED: ['ARCHIVED'],
    ARCHIVED: [],
};

export const UNSAFE_COMMENT_PATTERNS = [
    /ignore\s+(previous|prior)\s+(rules|instructions)/i,
    /activate\s+this\s+proposal/i,
    /apply\s+this\s+(change|threshold|rule)/i,
    /deploy\s+(now|immediately)/i,
    /change\s+the\s+score/i,
    /export\s+all\s+contacts/i,
    /reveal\s+(provider|api)\s*key/i,
    /run\s+code/i,
    /access\s+another\s+company/i,
    /send\s+whatsapp/i,
    /create\s+task/i,
    /executeMongo|runQuery|retrain|fine-?tune/i,
];

export const ELIGIBILITY_CODES = [
    'INSUFFICIENT_SAMPLE',
    'LOW_REVIEWER_AGREEMENT',
    'UNRESOLVED_CONFLICT',
    'OUTDATED_SOURCE',
    'MISSING_GROUND_TRUTH',
    'MISSING_TECHNICAL_REVIEW',
    'MISSING_RISK_REVIEW',
    'FOREIGN_COMPANY',
    'PROPOSAL_VERSION_CHANGED',
    'PERMISSION_DENIED',
    'PROPOSAL_EXECUTABLE_TRUE',
    'PROPOSAL_ALREADY_FLAGGED_IMPLEMENTED',
    'MISSING_SUPPORTING_FEEDBACK',
    'PROPOSAL_STATUS_NOT_ELIGIBLE',
    'CHECKSUM_MISMATCH',
];
