export const ENGINE_VERSION = 'pilot-rollout-v1';
export const SETTINGS_VERSION = '1.0.0';
export const MODULE = 'data_extractor.pilot';

export const PERMS = {
    view: 'data_extractor.pilot.view',
    create: 'data_extractor.pilot.create',
    update: 'data_extractor.pilot.update',
    manage: 'data_extractor.pilot.manage',
    review: 'data_extractor.pilot.review',
    final_review: 'data_extractor.pilot.final_review',
    company_selection: 'data_extractor.pilot.company_selection',
    industry_selection: 'data_extractor.pilot.industry_selection',
    cohort_manage: 'data_extractor.pilot.cohort_manage',
    module_plan: 'data_extractor.pilot.module_plan',
    feature_flag_plan: 'data_extractor.pilot.feature_flag_plan',
    uat_view: 'data_extractor.pilot.uat.view',
    uat_manage: 'data_extractor.pilot.uat.manage',
    uat_execute: 'data_extractor.pilot.uat.execute',
    uat_review: 'data_extractor.pilot.uat.review',
    defect_view: 'data_extractor.pilot.defect.view',
    defect_manage: 'data_extractor.pilot.defect.manage',
    risk_view: 'data_extractor.pilot.risk.view',
    risk_manage: 'data_extractor.pilot.risk.manage',
    accept_risk: 'data_extractor.pilot.accept_risk',
    feedback_view: 'data_extractor.pilot.feedback.view',
    feedback_manage: 'data_extractor.pilot.feedback.manage',
    evidence_view: 'data_extractor.pilot.evidence.view',
    evidence_manage: 'data_extractor.pilot.evidence.manage',
    pause_review: 'data_extractor.pilot.pause_review',
    suspension_review: 'data_extractor.pilot.suspension_review',
    rollback_plan: 'data_extractor.pilot.rollback_plan',
    settings: 'data_extractor.pilot.settings',
    audit: 'data_extractor.pilot.audit',
    export: 'data_extractor.pilot.export',
    saved_views: 'data_extractor.pilot.saved_views',
};

export const PLATFORM_ADMIN_PERMS = [
    'platform.admin', 'saas.admin', 'platform.pilot.manage', PERMS.manage,
];

export const ALLOWED_ENVIRONMENTS = ['LOCAL', 'DEVELOPMENT', 'TESTING', 'STAGING_SIMULATION'];
export const FORBIDDEN_ENVIRONMENTS = ['PRODUCTION', 'LIVE', 'RENDER_PRODUCTION', 'CUSTOMER_PRODUCTION'];

export const FORBIDDEN_STATUSES = [
    'PRODUCTION_ACTIVATED', 'DEPLOY_NOW', 'AUTO_DEPLOY', 'PRODUCTION_READY',
    'AUTOMATIC_APPROVAL', 'LIVE_ROLLOUT_COMPLETE', 'ROLLBACK_EXECUTED',
    'PRODUCTION_RESTORED', 'LIVE_ROLLBACK_COMPLETE',
];

export const FORBIDDEN_FLAG_STATES = ['GLOBAL_PRODUCTION_ON', 'AUTO_ENABLE', 'PRODUCTION_ENABLE'];

export const ALLOWED_FLAG_STATES = [
    'OFF', 'INTERNAL_ONLY', 'SELECTED_COHORT', 'SELECTED_COMPANY',
    'SELECTED_INDUSTRY', 'PILOT_PERCENTAGE', 'HOLD', 'REJECT',
];

export const MODULE_PLAN_ACTIONS = [
    'PROPOSE_ENABLE', 'PROPOSE_DISABLE', 'KEEP_CURRENT', 'DEFER', 'REJECT', 'NEEDS_REVIEW',
];

export const ALLOWED_TRANSITIONS = {
    DRAFT: ['PLANNING', 'PENDING_REVIEW', 'REJECTED', 'ARCHIVED'],
    PLANNING: ['PENDING_REVIEW', 'READY_FOR_STAGING_SIMULATION', 'REJECTED', 'ARCHIVED'],
    PENDING_REVIEW: ['READY_FOR_STAGING_SIMULATION', 'PLANNING', 'REJECTED', 'ARCHIVED'],
    READY_FOR_STAGING_SIMULATION: ['STAGING_SIMULATION_IN_PROGRESS', 'REJECTED', 'ARCHIVED'],
    STAGING_SIMULATION_IN_PROGRESS: ['STAGING_SIMULATION_COMPLETED', 'PILOT_SIMULATION_PAUSED', 'ARCHIVED'],
    STAGING_SIMULATION_COMPLETED: ['READY_FOR_PILOT_REVIEW', 'READY_FOR_STAGING_SIMULATION', 'ARCHIVED'],
    READY_FOR_PILOT_REVIEW: ['PILOT_APPROVED_FOR_LOCAL_SIMULATION', 'REJECTED', 'ARCHIVED'],
    PILOT_APPROVED_FOR_LOCAL_SIMULATION: ['PILOT_SIMULATION_IN_PROGRESS', 'ARCHIVED'],
    PILOT_SIMULATION_IN_PROGRESS: ['UAT_IN_PROGRESS', 'PILOT_SIMULATION_PAUSED', 'PILOT_SIMULATION_SUSPENDED', 'PILOT_SIMULATION_COMPLETED', 'ARCHIVED'],
    PILOT_SIMULATION_PAUSED: ['PILOT_SIMULATION_IN_PROGRESS', 'PILOT_SIMULATION_SUSPENDED', 'ARCHIVED'],
    PILOT_SIMULATION_SUSPENDED: ['PILOT_CLOSURE_RECOMMENDED', 'ARCHIVED'],
    PILOT_SIMULATION_COMPLETED: ['UAT_IN_PROGRESS', 'PILOT_CLOSURE_RECOMMENDED', 'ARCHIVED'],
    UAT_IN_PROGRESS: ['UAT_BLOCKED', 'UAT_COMPLETED', 'PILOT_SIMULATION_PAUSED', 'ARCHIVED'],
    UAT_BLOCKED: ['UAT_IN_PROGRESS', 'PILOT_SIMULATION_SUSPENDED', 'ARCHIVED'],
    UAT_COMPLETED: ['PILOT_EXTENSION_RECOMMENDED', 'PILOT_CLOSURE_RECOMMENDED', 'READY_FOR_PHASE_26_REVIEW', 'ARCHIVED'],
    PILOT_EXTENSION_RECOMMENDED: ['PILOT_SIMULATION_IN_PROGRESS', 'UAT_IN_PROGRESS', 'PILOT_CLOSURE_RECOMMENDED', 'ARCHIVED'],
    PILOT_CLOSURE_RECOMMENDED: ['READY_FOR_PHASE_26_REVIEW', 'REJECTED', 'ARCHIVED'],
    READY_FOR_PHASE_26_REVIEW: ['ARCHIVED'],
    REJECTED: ['ARCHIVED', 'DRAFT'],
    ARCHIVED: [],
};

export const INDUSTRIES = ['JSK_URJA', 'HANDLOOM', 'PROFESSIONAL', 'HEALTHCARE', 'JSK_URJA_ELECTRONICS', 'HANDLOOM_TEXTILE', 'PROFESSIONAL_CRM', 'HEALTHCARE_CRM'];

export const DEFAULT_SUCCESS_CRITERIA = [
    { key: 'CRITICAL_UAT_EXECUTED', label: '100% critical UAT cases executed', required: true },
    { key: 'NO_OPEN_CRITICAL_DEFECTS', label: 'No open critical defects', required: true },
    { key: 'TENANT_ISOLATION_PASS', label: 'No failed tenant-isolation tests', required: true },
    { key: 'COMPANY_ISOLATION_PASS', label: 'No failed company-isolation tests', required: true },
    { key: 'INDUSTRY_ISOLATION_PASS', label: 'No failed industry-isolation tests', required: true },
    { key: 'EVIDENCE_COMPLETE', label: 'Required evidence attached', required: true },
    { key: 'ROLLBACK_REVIEWED', label: 'Rollback plan reviewed', required: true },
    { key: 'APPROVALS_COMPLETE', label: 'Required approvals completed', required: true },
];

export const DEFAULT_FAILURE_CRITERIA = [
    { key: 'CRITICAL_SECURITY_FAILURE', label: 'Critical security failure' },
    { key: 'COMPANY_DATA_LEAKAGE', label: 'Company-data leakage' },
    { key: 'TENANT_DATA_LEAKAGE', label: 'Tenant-data leakage' },
    { key: 'INDUSTRY_DATA_LEAKAGE', label: 'Industry-data leakage' },
    { key: 'OPEN_CRITICAL_DEFECT', label: 'Critical defect open' },
    { key: 'FAILED_ROLLBACK_SIMULATION', label: 'Failed rollback simulation' },
    { key: 'MISSING_MANDATORY_EVIDENCE', label: 'Missing mandatory evidence' },
    { key: 'FAILED_PHASE24_CONTROL', label: 'Failed Phase 24 control' },
];

export const DEFAULT_SETTINGS = {
    version: SETTINGS_VERSION,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    defaultUatPassThreshold: 90,
    criticalTestCompletionRequired: true,
    evidenceRequirement: true,
    acceptedRiskExpiryDaysMax: 90,
    pilotMaximumDurationDays: 90,
    pilotExtensionLimitDays: 30,
    pilotCompanyMaximumCount: 10,
    pilotUserMaximumCount: 50,
    maximumExportRows: 500,
    requireSegregationOfDuties: true,
    requireRollbackPlan: true,
    requirePhase24Validity: true,
    requireCompanyIsolationPass: true,
    requireIndustryIsolationPass: true,
    requirePermissionTestPass: true,
    blockOnCriticalDefect: true,
    blockOnFailedIsolation: true,
    simulationOnly: true,
    productionExecutionAllowed: false,
    deploymentEnabled: false,
};

export const UNSAFE_NOTE_PATTERNS = [
    /deploy\s+now/i, /activate\s+production/i, /push\s+to\s+render/i,
    /execute\s+rollback/i, /run\s+migration/i, /enable\s+globally/i,
    /ignore\s+isolation/i, /reveal\s+secrets?/i, /access\s+another\s+company/i,
];

export const UNSAFE_PAYLOAD_PATTERNS = [
    /\beval\s*\(/i, /\$where\b/i, /child_process/i,
    /mongodb(\+srv)?:\/\/[^\s]+/i, /ghp_[a-zA-Z0-9]{20,}/i, /sk-[a-z0-9]{16,}/i,
];

export const LOCAL_ALLOWLIST = ['127.0.0.1', 'localhost', '::1', 'crm_test'];

export const CONTROL_LIBRARY = [
    { code: 'P25-SIM-001', title: 'Simulation-only defaults', severity: 'CRITICAL' },
    { code: 'P25-ENV-001', title: 'Unsafe environment rejection', severity: 'CRITICAL' },
    { code: 'P25-ISO-001', title: 'Company isolation', severity: 'CRITICAL' },
    { code: 'P25-ISO-002', title: 'Industry isolation', severity: 'CRITICAL' },
    { code: 'P25-DEP-001', title: 'No deploy endpoints', severity: 'CRITICAL' },
    { code: 'P25-ACT-001', title: 'No production activation', severity: 'CRITICAL' },
    { code: 'P25-RBK-001', title: 'No rollback execution', severity: 'CRITICAL' },
    { code: 'P25-UAT-001', title: 'Critical UAT completion', severity: 'HIGH' },
    { code: 'P25-DEF-001', title: 'Critical defects block closure', severity: 'CRITICAL' },
];
