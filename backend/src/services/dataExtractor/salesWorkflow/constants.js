export const ENGINE_VERSION = 'sales-workflow-v1';
export const SETTINGS_VERSION = 'sales-workflow-settings-v1';

export const CRM_LEAD_ASSIGN_PERM = 'crm.leads.assign';
export const CRM_LEAD_EDIT_PERM = 'crm.leads.edit';
export const CRM_LEAD_CREATE_TASK_PERM = 'crm.leads.create_task';
export const TASK_CREATE_PERM = 'tasks.task_list.add';

export const DEFAULT_DIMENSIONS = Object.freeze([
    { id: 'territory_fit', label: 'Territory Fit', maxScore: 25, active: true },
    { id: 'industry_fit', label: 'Industry Fit', maxScore: 20, active: true },
    { id: 'product_fit', label: 'Product Fit', maxScore: 20, active: true },
    { id: 'customer_type_fit', label: 'Customer Type Fit', maxScore: 10, active: true },
    { id: 'existing_ownership', label: 'Existing Ownership', maxScore: 10, active: true },
    { id: 'workload', label: 'Workload', maxScore: 15, active: true },
]);

export const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    assignmentMode: 'HYBRID',
    version: SETTINGS_VERSION,
    dimensions: DEFAULT_DIMENSIONS,
    territoryRules: [],
    industryRules: [],
    productRules: [],
    customerTypeRules: [],
    existingOwnerPriority: true,
    workloadCalculation: 'open_leads_and_tasks',
    roundRobinEnabled: false,
    roundRobinCursor: 0,
    defaultTeam: '',
    priorityFollowupDays: { CRITICAL: 0, HIGH: 1, MEDIUM: 3, LOW: 7, NO_PRIORITY: 14 },
    workingDayRules: { skipWeekends: true },
    holidayHandling: 'skip_if_configured',
    duplicateTaskWindowDays: 3,
    requireReviewForReassignment: true,
    autoPrepareOnLeadConversion: false,
    allowBatchPrepare: true,
    allowBatchApply: false,
    maximumBatchApply: 25,
});

export const FOLLOWUP_ACTIONS = Object.freeze([
    'Call primary contact',
    'Request purchase contact',
    'Request technical contact',
    'Send company introduction',
    'Send product catalog',
    'Send product brochure',
    'Send datasheet',
    'Request technical requirements',
    'Request quotation opportunity',
    'Schedule product demonstration',
    'Schedule meeting',
    'Manual research',
    'Nurture later',
    'No immediate action',
]);
