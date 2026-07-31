export const ENGINE_VERSION = 'learning-intelligence-v1';
export const SETTINGS_VERSION = '1.0.0';
export const MODULE = 'data_extractor.ai_learning';

export const PERMS = {
    view: `${MODULE}.view`,
    submit_feedback: `${MODULE}.submit_feedback`,
    review_feedback: `${MODULE}.review_feedback`,
    resolve_conflict: `${MODULE}.resolve_conflict`,
    analytics: `${MODULE}.analytics`,
    review_queue: `${MODULE}.review_queue`,
    generate_proposal: `${MODULE}.generate_proposal`,
    review_proposal: `${MODULE}.review_proposal`,
    export: `${MODULE}.export`,
    dataset: `${MODULE}.dataset`,
    saved_views: `${MODULE}.saved_views`,
    audit: `${MODULE}.audit`,
    settings: `${MODULE}.settings`,
    manage: `${MODULE}.manage`,
};

/** Source view permissions required to submit feedback on a module. */
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
    duplicate_suggestion: 'data_extractor.extractor.view',
    manual_review: 'data_extractor.lead_scoring.view',
    batch_quality: 'data_extractor.analytics.batch_monitor',
    data_quality: 'data_extractor.analytics.discovery',
    source_provenance: 'data_extractor.extractor.view',
};

export const DEFAULT_SETTINGS = {
    version: SETTINGS_VERSION,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    feedbackEnabledModules: Object.keys(SOURCE_VIEW_PERMS),
    requireCommentForReject: true,
    allowCorrectionValue: true,
    minimumReviewers: 2,
    conflictThreshold: 0.4,
    proposalMinimumSample: 5,
    proposalMinimumAgreement: 0.6,
    lowSampleThreshold: 5,
    moderateSampleThreshold: 20,
    reviewerWeightingMode: 'EQUAL',
    allowOutcomeSignals: true,
    allowDatasetPreparation: true,
    maximumDatasetRows: 2000,
    maximumExportRows: 5000,
    commentMaximumLength: 1000,
    evidenceMaximumCount: 20,
    feedbackRevisionAllowed: true,
    feedbackRevisionWindowDays: 30,
    retentionDays: 365,
    anonymizeReviewerInAnalytics: true,
    showReviewerIdentityToManagers: true,
};

export const UNSAFE_COMMENT_PATTERNS = [
    /ignore\s+(previous|prior)\s+(rules|instructions)/i,
    /activate\s+this\s+proposal/i,
    /change\s+the\s+score/i,
    /export\s+all\s+contacts/i,
    /reveal\s+(provider|api)\s*key/i,
    /run\s+code/i,
    /access\s+another\s+company/i,
    /send\s+whatsapp/i,
    /create\s+task/i,
    /executeMongo|runQuery|retrain|fine-?tune/i,
];
