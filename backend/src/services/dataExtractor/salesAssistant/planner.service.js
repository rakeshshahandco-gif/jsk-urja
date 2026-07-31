import { READ_ONLY_TOOLS } from './constants.js';
import { clampLimit } from './normalize.util.js';

const INTENT_TOOLS = {
    SEARCH_COMPANIES: ['searchCompanies'],
    FILTER_LEADS: ['searchLeadScores', 'searchCompanies'],
    COMPANY_SUMMARY: ['getCompanySummary', 'getCompanyProfile', 'getLeadScoreExplanation', 'getProductRecommendations', 'getContactAvailability'],
    PRE_CALL_BRIEF: ['getCompanySummary', 'getApprovedContactDetails', 'getProductRecommendations', 'getTaskFollowupStatus', 'getContactAvailability'],
    LEAD_SCORE_EXPLANATION: ['getLeadScoreExplanation'],
    PRODUCT_RECOMMENDATION: ['getProductRecommendations'],
    CONTACT_SEARCH: ['getApprovedContactDetails', 'getContactAvailability'],
    CONTACT_AVAILABILITY: ['getContactAvailability'],
    DUPLICATE_EXPLANATION: ['getDuplicateStatus'],
    SIMILAR_COMPANY_SEARCH: ['getSimilarCompanies'],
    MARKET_ANALYSIS: ['getMarketIntelligence', 'getAnalyticsSummary'],
    CRM_ENRICHMENT_STATUS: ['getCrmEnrichmentStatus'],
    SALES_WORKFLOW_STATUS: ['getSalesWorkflowStatus'],
    TASK_FOLLOWUP_STATUS: ['getTaskFollowupStatus'],
    CAMPAIGN_DRAFT_STATUS: ['getCampaignDraftStatus'],
    ANALYTICS_SUMMARY: ['getAnalyticsSummary'],
    DATA_QUALITY_QUERY: ['getOutdatedRecords', 'getManualReviewQueue', 'getContactAvailability'],
    OUTDATED_RECORDS: ['getOutdatedRecords'],
    MANUAL_REVIEW_QUEUE: ['getManualReviewQueue'],
    BATCH_STATUS: ['getBatchStatus'],
    EXPORT_REQUEST: ['exportPermittedResults'],
    HELP: [],
    UNSUPPORTED_ACTION: [],
    AMBIGUOUS: [],
};

const INTENT_PERMS = {
    SEARCH_COMPANIES: ['ask', 'company_research'],
    FILTER_LEADS: ['ask', 'sales'],
    COMPANY_SUMMARY: ['ask', 'company_research'],
    PRE_CALL_BRIEF: ['ask', 'sales', 'contact'],
    LEAD_SCORE_EXPLANATION: ['ask', 'sales'],
    PRODUCT_RECOMMENDATION: ['ask', 'product'],
    CONTACT_SEARCH: ['ask', 'contact'],
    CONTACT_AVAILABILITY: ['ask', 'contact'],
    DUPLICATE_EXPLANATION: ['ask', 'data_quality'],
    SIMILAR_COMPANY_SEARCH: ['ask', 'market'],
    MARKET_ANALYSIS: ['ask', 'market', 'executive'],
    CRM_ENRICHMENT_STATUS: ['ask', 'crm_conversion'],
    SALES_WORKFLOW_STATUS: ['ask', 'sales_workflow'],
    TASK_FOLLOWUP_STATUS: ['ask', 'sales_workflow'],
    CAMPAIGN_DRAFT_STATUS: ['ask', 'marketing'],
    ANALYTICS_SUMMARY: ['ask', 'executive'],
    DATA_QUALITY_QUERY: ['ask', 'data_quality'],
    OUTDATED_RECORDS: ['ask', 'data_quality'],
    MANUAL_REVIEW_QUEUE: ['ask', 'data_quality'],
    BATCH_STATUS: ['ask', 'batch_monitor'],
    EXPORT_REQUEST: ['export'],
    HELP: ['view'],
    UNSUPPORTED_ACTION: ['view'],
    AMBIGUOUS: ['ask'],
};

export function buildQueryPlan(classification, settings, sessionContext = {}) {
    const intent = classification.intent;
    const tools = (INTENT_TOOLS[intent] || []).filter((t) => READ_ONLY_TOOLS.includes(t));
    const limit = clampLimit(
        classification.extractedFilters?.limit,
        settings.defaultResultLimit,
        settings.maximumResultLimit,
    );

    return {
        intent,
        entities: classification.extractedEntities || {},
        filters: {
            ...(sessionContext.filters || {}),
            ...(classification.extractedFilters || {}),
        },
        dateRange: classification.extractedFilters?.dateRange || null,
        financialYear: classification.extractedFilters?.financialYear || '',
        sort: classification.extractedFilters?.sort || { finalScore: -1 },
        limit,
        tools,
        requiredPermissions: INTENT_PERMS[intent] || ['ask'],
        aggregateOnly: false,
        expectedOutput: classification.clarificationRequired ? 'clarification' : 'grounded_answer',
        clarification: classification.clarificationRequired
            ? 'Please clarify which companies, location, score band, or module you mean.'
            : '',
        safetyFlags: {
            classification: classification.safetyClassification,
            blocked: intent === 'UNSUPPORTED_ACTION',
            actionType: classification.actionType || null,
        },
        // companyId MUST NOT appear — scope comes only from req.companyId
    };
}
