export const ENGINE_VERSION = 'sales-assistant-v1';
export const SETTINGS_VERSION = '1.0.0';

export const MODULE = 'data_extractor.ai_sales_assistant';

export const PERMS = {
    view: `${MODULE}.view`,
    ask: `${MODULE}.ask`,
    executive: `${MODULE}.executive`,
    sales: `${MODULE}.sales`,
    market: `${MODULE}.market`,
    contact: `${MODULE}.contact`,
    product: `${MODULE}.product`,
    crm_conversion: `${MODULE}.crm_conversion`,
    sales_workflow: `${MODULE}.sales_workflow`,
    marketing: `${MODULE}.marketing`,
    data_quality: `${MODULE}.data_quality`,
    batch_monitor: `${MODULE}.batch_monitor`,
    company_research: `${MODULE}.company_research`,
    saved_prompts: `${MODULE}.saved_prompts`,
    manage_prompts: `${MODULE}.manage_prompts`,
    export: `${MODULE}.export`,
    history: `${MODULE}.history`,
    audit: `${MODULE}.audit`,
    manage: `${MODULE}.manage`,
};

/** Source permissions that Assistant permissions never replace. */
export const SOURCE_PERMS = {
    contactDetail: 'data_extractor.contact_intelligence.view',
    contactDetailStrict: 'data_extractor.contact_intelligence.detail',
    crmLeadView: 'crm.leads.view',
    salesWorkflowView: 'data_extractor.sales_workflow.view',
    marketingView: 'data_extractor.marketing_intelligence.view',
    analyticsView: 'data_extractor.analytics.view',
    leadScoringView: 'data_extractor.lead_scoring.view',
    productView: 'data_extractor.product_recommendation.view',
    similarView: 'data_extractor.similar_company.view',
    marketView: 'data_extractor.market_intelligence.view',
    crmEnrichmentView: 'data_extractor.crm_enrichment.view',
    companyIntelView: 'data_extractor.company_intelligence.view',
    leadIntelView: 'data_extractor.lead_intelligence.view',
};

export const INTENTS = [
    'SEARCH_COMPANIES',
    'FILTER_LEADS',
    'COMPANY_SUMMARY',
    'PRE_CALL_BRIEF',
    'LEAD_SCORE_EXPLANATION',
    'PRODUCT_RECOMMENDATION',
    'CONTACT_SEARCH',
    'CONTACT_AVAILABILITY',
    'DUPLICATE_EXPLANATION',
    'SIMILAR_COMPANY_SEARCH',
    'MARKET_ANALYSIS',
    'CRM_ENRICHMENT_STATUS',
    'SALES_WORKFLOW_STATUS',
    'TASK_FOLLOWUP_STATUS',
    'CAMPAIGN_DRAFT_STATUS',
    'ANALYTICS_SUMMARY',
    'DATA_QUALITY_QUERY',
    'OUTDATED_RECORDS',
    'MANUAL_REVIEW_QUEUE',
    'BATCH_STATUS',
    'EXPORT_REQUEST',
    'HELP',
    'UNSUPPORTED_ACTION',
    'AMBIGUOUS',
];

export const READ_ONLY_TOOLS = [
    'searchCompanies',
    'getCompanySummary',
    'getCompanyProfile',
    'searchLeadScores',
    'getLeadScoreExplanation',
    'getLeadRelevanceExplanation',
    'getIndustryClassification',
    'getCustomerTypeClassification',
    'getProductRecommendations',
    'getContactAvailability',
    'getApprovedContactDetails',
    'getSimilarCompanies',
    'getMarketIntelligence',
    'getDuplicateStatus',
    'getCrmEnrichmentStatus',
    'getSalesWorkflowStatus',
    'getTaskFollowupStatus',
    'getAnalyticsSummary',
    'getBatchStatus',
    'getCampaignDraftStatus',
    'getOutdatedRecords',
    'getManualReviewQueue',
    'getSourceProvenance',
    'exportPermittedResults',
];

export const WRITE_TOOL_NAMES = [
    'findModel', 'runQuery', 'executeMongo', 'invokeService', 'callEndpoint', 'runCode',
    'createLead', 'assignLead', 'createTask', 'sendEmail', 'sendWhatsApp', 'applyDraft',
    'approveDraft', 'rollback', 'merge', 'startCampaign', 'execute',
];

export const DEFAULT_SETTINGS = {
    version: SETTINGS_VERSION,
    defaultResultLimit: 20,
    maximumResultLimit: 100,
    maximumContactRows: 25,
    maximumExportRows: 500,
    maximumEvidenceItems: 30,
    maximumSessionMessages: 200,
    queryTimeoutMs: 30000,
    sessionRetentionDays: 90,
    aiTokenLimit: 2000,
    mode: 'HYBRID',
    aiAssistedEnabled: false,
    allowExport: true,
    aggregateOnlyDefault: false,
};

export const SUGGESTED_QUESTIONS = [
    'Show high-priority leads in Maharashtra',
    'Find companies without verified decision-makers',
    'Which leads need follow-up today?',
    'Show pending Sales Workflow Drafts',
    'Show approved CRM Enrichment Drafts',
    'Which Campaign Drafts are ready for handoff?',
    'Show outdated records requiring manual review',
    'Show failed or stale batch jobs',
];

export const ACTION_NAV = {
    CREATE_LEAD: { label: 'Open CRM Enrichment / Extracted Leads', targetModule: 'crm_enrichment', navigationRoute: '/data-extractor/ai-lead-intelligence/crm-enrichment' },
    ASSIGN: { label: 'Open Sales Workflow', targetModule: 'sales_workflow', navigationRoute: '/data-extractor/ai-lead-intelligence/sales-workflow' },
    TASK: { label: 'Open Sales Workflow', targetModule: 'sales_workflow', navigationRoute: '/data-extractor/ai-lead-intelligence/sales-workflow' },
    FOLLOWUP: { label: 'Open Sales Workflow', targetModule: 'sales_workflow', navigationRoute: '/data-extractor/ai-lead-intelligence/sales-workflow' },
    APPROVE_APPLY: { label: 'Open CRM Enrichment Drafts', targetModule: 'crm_enrichment', navigationRoute: '/data-extractor/ai-lead-intelligence/crm-enrichment' },
    CAMPAIGN: { label: 'Open Marketing Intelligence', targetModule: 'marketing', navigationRoute: '/data-extractor/ai-lead-intelligence/marketing-intelligence' },
    SEND: { label: 'Use Email / WhatsApp modules (outside Assistant)', targetModule: 'communications', navigationRoute: null },
    ROLLBACK: { label: 'Open Sales Workflow / CRM Enrichment rollback screens', targetModule: 'sales_workflow', navigationRoute: '/data-extractor/ai-lead-intelligence/sales-workflow' },
    MERGE: { label: 'Open Duplicate Review', targetModule: 'duplicate_review', navigationRoute: '/data-extractor/duplicate-review' },
};
