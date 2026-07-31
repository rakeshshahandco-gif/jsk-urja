export const ENGINE_VERSION = 'analytics-v1';
export const SETTINGS_VERSION = 'analytics-settings-v1';

export const DEFAULT_SCORE_BANDS = Object.freeze([
    { id: '0_34', label: '0–34', min: 0, max: 34 },
    { id: '35_54', label: '35–54', min: 35, max: 54 },
    { id: '55_74', label: '55–74', min: 55, max: 74 },
    { id: '75_89', label: '75–89', min: 75, max: 89 },
    { id: '90_100', label: '90–100', min: 90, max: 100 },
]);

export const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    version: SETTINGS_VERSION,
    defaultDateRange: 'last_30_days',
    defaultDashboard: 'executive',
    visibleWidgets: [
        'executive_summary', 'funnel', 'discovery', 'data_quality', 'lead_scoring',
        'industry', 'product', 'contact', 'market', 'crm_enrichment', 'sales_workflow',
        'batches', 'user_activity', 'pending_reviews', 'outdated',
    ],
    scoreBands: DEFAULT_SCORE_BANDS,
    staleBatchMinutes: 30,
    topNLimit: 25,
    refreshIntervalSeconds: 120,
    autoRefreshEnabled: false,
    exportRowLimit: 5000,
    allowCompanySavedViews: true,
    timezone: 'Asia/Kolkata',
});

export const KPI_DEFINITIONS = Object.freeze({
    discoveredCompanies: {
        id: 'discoveredCompanies',
        label: 'Discovered Companies',
        definition: 'ExtractedLead records in company scope within date range (record count).',
        sourceModel: 'ExtractedLead',
        metricType: 'record_count',
    },
    uniqueCompanies: {
        id: 'uniqueCompanies',
        label: 'Unique Companies',
        definition: 'ExtractedLead records excluding confirmed duplicates (unique entity approximation).',
        sourceModel: 'ExtractedLead',
        metricType: 'unique_company_count',
    },
    duplicateCount: {
        id: 'duplicateCount',
        label: 'Duplicates',
        definition: 'ExtractedLead with status=duplicate or duplicateStatus=confirmed_duplicate.',
        sourceModel: 'ExtractedLead',
        metricType: 'record_count',
    },
    relevantCompanies: {
        id: 'relevantCompanies',
        label: 'Relevant Companies',
        definition: 'AiLeadRelevance with approved/relevant statuses (not all scored records).',
        sourceModel: 'AiLeadRelevance',
        metricType: 'record_count',
    },
    approvedLeads: {
        id: 'approvedLeads',
        label: 'Approved Extracted Leads',
        definition: 'ExtractedLead status=approved within filters.',
        sourceModel: 'ExtractedLead',
        metricType: 'record_count',
    },
    highPriorityLeads: {
        id: 'highPriorityLeads',
        label: 'High-Priority Lead Scores',
        definition: 'AiLeadScore priority in HIGH/CRITICAL and not deleted.',
        sourceModel: 'AiLeadScore',
        metricType: 'record_count',
    },
    crmLeadsCreated: {
        id: 'crmLeadsCreated',
        label: 'CRM Leads Created',
        definition: 'Successful Phase 13 transactions that created a Lead (APPLIED create-lead path only).',
        sourceModel: 'AiCrmEnrichmentTransaction',
        metricType: 'transaction_count',
    },
    crmRecordsEnriched: {
        id: 'crmRecordsEnriched',
        label: 'CRM Records Enriched',
        definition: 'Phase 13 APPLIED/PARTIALLY_APPLIED enrichment transactions (non create-lead).',
        sourceModel: 'AiCrmEnrichmentTransaction',
        metricType: 'transaction_count',
    },
    assignmentsApplied: {
        id: 'assignmentsApplied',
        label: 'Assignments Applied',
        definition: 'Phase 14 APPLIED/PARTIALLY_APPLIED transactions that applied assignment.',
        sourceModel: 'AiSalesWorkflowTransaction',
        metricType: 'transaction_count',
    },
    tasksCreated: {
        id: 'tasksCreated',
        label: 'Tasks Created (Phase 14)',
        definition: 'Count of appliedTaskIds across successful Phase 14 transactions.',
        sourceModel: 'AiSalesWorkflowTransaction',
        metricType: 'transaction_count',
    },
    followUpsScheduled: {
        id: 'followUpsScheduled',
        label: 'Follow-ups Scheduled (Phase 14)',
        definition: 'Phase 14 transactions with followUpApplied set.',
        sourceModel: 'AiSalesWorkflowTransaction',
        metricType: 'transaction_count',
    },
});

export const MODULE_PERM = Object.freeze({
    executive: 'data_extractor.analytics.executive',
    discovery: 'data_extractor.analytics.discovery',
    lead_intelligence: 'data_extractor.analytics.lead_intelligence',
    product: 'data_extractor.analytics.product',
    contact: 'data_extractor.analytics.contact',
    market: 'data_extractor.analytics.market',
    crm_conversion: 'data_extractor.analytics.crm_conversion',
    sales_workflow: 'data_extractor.analytics.sales_workflow',
    batch_monitor: 'data_extractor.analytics.batch_monitor',
    user_activity: 'data_extractor.analytics.user_activity',
});
