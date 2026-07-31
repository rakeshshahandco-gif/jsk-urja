export const ENGINE_VERSION = 'enterprise-operations-v1';
export const SETTINGS_VERSION = '1.0.0';
export const MODULE = 'data_extractor.operations';

export const PERMS = {
    view: 'data_extractor.operations.view',
    create: 'data_extractor.operations.create',
    update: 'data_extractor.operations.update',
    manage: 'data_extractor.operations.manage',
    review: 'data_extractor.operations.review',
    final_review: 'data_extractor.operations.final_review',
    release_board: 'data_extractor.operations.release_board',
    production_plan: 'data_extractor.operations.production_plan',
    environment_inventory: 'data_extractor.operations.environment_inventory',
    release_calendar: 'data_extractor.operations.release_calendar',
    maintenance_window: 'data_extractor.operations.maintenance_window',
    change_view: 'data_extractor.operations.change.view',
    change_manage: 'data_extractor.operations.change.manage',
    emergency_change: 'data_extractor.operations.emergency_change',
    checklist_view: 'data_extractor.operations.checklist.view',
    checklist_manage: 'data_extractor.operations.checklist.manage',
    monitoring_view: 'data_extractor.operations.monitoring.view',
    monitoring_manage: 'data_extractor.operations.monitoring.manage',
    incident_view: 'data_extractor.operations.incident.view',
    incident_manage: 'data_extractor.operations.incident.manage',
    problem_view: 'data_extractor.operations.problem.view',
    problem_manage: 'data_extractor.operations.problem.manage',
    risk_view: 'data_extractor.operations.risk.view',
    risk_manage: 'data_extractor.operations.risk.manage',
    accept_risk: 'data_extractor.operations.accept_risk',
    backup_plan: 'data_extractor.operations.backup_plan',
    restore_plan: 'data_extractor.operations.restore_plan',
    dr_plan: 'data_extractor.operations.dr_plan',
    rollback_plan: 'data_extractor.operations.rollback_plan',
    communication: 'data_extractor.operations.communication',
    release_notes: 'data_extractor.operations.release_notes',
    phase27_recommendation: 'data_extractor.operations.phase27_recommendation',
    audit: 'data_extractor.operations.audit',
    export: 'data_extractor.operations.export',
    saved_views: 'data_extractor.operations.saved_views',
    settings: 'data_extractor.operations.settings',
};

export const PLATFORM_ADMIN_PERMS = ['platform.admin', 'saas.admin', 'platform.operations.manage', PERMS.manage];

export const ALLOWED_ENVIRONMENTS = ['LOCAL', 'DEVELOPMENT', 'TESTING', 'STAGING', 'PRODUCTION_PLANNING_ONLY'];
export const FORBIDDEN_ENVIRONMENTS = ['PRODUCTION', 'LIVE', 'RENDER_PRODUCTION', 'CUSTOMER_PRODUCTION'];

export const FORBIDDEN_STATUSES = [
    'PRODUCTION_DEPLOYED', 'PRODUCTION_ACTIVATED', 'DEPLOY_NOW', 'EXECUTE_RELEASE',
    'ROLLBACK_EXECUTED', 'BACKUP_COMPLETED', 'RESTORE_COMPLETED', 'MIGRATION_COMPLETED',
    'LIVE', 'GO_LIVE_COMPLETE', 'EXECUTING', 'EXECUTED', 'DEPLOYED', 'ACTIVATED', 'ROLLED_BACK', 'RESTORED',
];

export const ALLOWED_TRANSITIONS = {
    DRAFT: ['PLANNING', 'PENDING_REVIEW', 'REJECTED', 'ARCHIVED'],
    PLANNING: ['PENDING_REVIEW', 'READY_FOR_OPERATIONAL_REVIEW', 'HOLD', 'REJECTED', 'ARCHIVED'],
    PENDING_REVIEW: ['CHANGES_REQUIRED', 'READY_FOR_OPERATIONAL_REVIEW', 'READY_FOR_RELEASE_BOARD_REVIEW', 'HOLD', 'REJECTED', 'ARCHIVED'],
    CHANGES_REQUIRED: ['PLANNING', 'PENDING_REVIEW', 'REJECTED', 'ARCHIVED'],
    HOLD: ['PENDING_REVIEW', 'PLANNING', 'REJECTED', 'ARCHIVED'],
    READY_FOR_OPERATIONAL_REVIEW: ['READY_FOR_RELEASE_BOARD_REVIEW', 'READY_FOR_MAINTENANCE_WINDOW_REVIEW', 'HOLD', 'REJECTED', 'ARCHIVED'],
    READY_FOR_RELEASE_BOARD_REVIEW: ['READY_FOR_MAINTENANCE_WINDOW_REVIEW', 'READY_FOR_PHASE_27_REVIEW', 'HOLD', 'REJECTED', 'ARCHIVED'],
    READY_FOR_MAINTENANCE_WINDOW_REVIEW: ['READY_FOR_PHASE_27_REVIEW', 'HOLD', 'REJECTED', 'ARCHIVED'],
    READY_FOR_PHASE_27_REVIEW: ['ARCHIVED'],
    REJECTED: ['ARCHIVED', 'DRAFT'],
    ARCHIVED: [],
};

export const DEFAULT_OPS_CHECKLIST = [
    { key: 'RELEASE_PACKAGE_INTEGRITY', label: 'Release package integrity', critical: true },
    { key: 'CERTIFICATION_VALID', label: 'Phase 24 certification valid', critical: true },
    { key: 'PILOT_CLOSURE', label: 'Phase 25 pilot closure', critical: true },
    { key: 'NO_CRITICAL_DEFECTS', label: 'No unresolved critical defects', critical: true },
    { key: 'NO_CRITICAL_RISKS', label: 'No unresolved critical risks', critical: true },
    { key: 'COMPANY_ISOLATION', label: 'Company isolation controls', critical: true },
    { key: 'TENANT_ISOLATION', label: 'Tenant isolation controls', critical: true },
    { key: 'INDUSTRY_ISOLATION', label: 'Industry isolation controls', critical: true },
    { key: 'ROLLBACK_PLAN', label: 'Rollback authorization plan', critical: true },
    { key: 'BACKUP_PLAN', label: 'Backup verification plan', critical: true },
    { key: 'RESTORE_PLAN', label: 'Restore verification plan', critical: true },
    { key: 'DR_PLAN', label: 'Disaster recovery plan', critical: true },
    { key: 'MONITORING_PLAN', label: 'Monitoring plan', critical: true },
    { key: 'INCIDENT_PLAN', label: 'Incident plan', critical: true },
    { key: 'COMMUNICATION_PLAN', label: 'Communication plan', critical: true },
    { key: 'MAINTENANCE_WINDOW', label: 'Maintenance window reviewed', critical: true },
    { key: 'HYPERCARE_PLAN', label: 'Hypercare plan', critical: true },
    { key: 'CUSTOMER_IMPACT', label: 'Customer impact assessed', critical: false },
];

export const DEFAULT_GOLIVE_CHECKLIST = [
    { key: 'VERSION_CONFIRMED', label: 'Final version confirmed', critical: true },
    { key: 'CHECKSUM_CONFIRMED', label: 'Release package checksum confirmed', critical: true },
    { key: 'P24_VALID', label: 'Phase 24 certification valid', critical: true },
    { key: 'P25_ACCEPTED', label: 'Phase 25 pilot accepted', critical: true },
    { key: 'CRITICAL_DEFECTS_ZERO', label: 'Open critical defects = 0', critical: true },
    { key: 'CRITICAL_RISKS_ZERO', label: 'Open critical risks = 0', critical: true },
    { key: 'APPROVALS_COMPLETE', label: 'Required approvals complete', critical: true },
    { key: 'BACKUP_REVIEWED', label: 'Backup verification plan reviewed', critical: true },
    { key: 'RESTORE_REVIEWED', label: 'Restore verification plan reviewed', critical: true },
    { key: 'ROLLBACK_REVIEWED', label: 'Rollback plan reviewed', critical: true },
    { key: 'MONITORING_REVIEWED', label: 'Monitoring plan reviewed', critical: true },
    { key: 'INCIDENT_TEAM', label: 'Incident team identified', critical: true },
    { key: 'COMM_APPROVED', label: 'Communication plan approved', critical: true },
    { key: 'WINDOW_APPROVED', label: 'Maintenance window approved', critical: true },
    { key: 'HYPERCARE_ASSIGNED', label: 'Hypercare team assigned', critical: true },
    { key: 'PHASE27_REQUIRED', label: 'Phase 27 authorization required', critical: true },
];

export const DEFAULT_SETTINGS = {
    version: SETTINGS_VERSION,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    requirePhase24Certification: true,
    requirePhase25Approval: true,
    requireReleaseBoardReview: true,
    requireSegregationOfDuties: true,
    requireOperationalChecklist: true,
    requireGoLiveChecklist: true,
    requireRollbackPlan: true,
    requireBackupVerificationPlan: true,
    requireRestoreVerificationPlan: true,
    requireDrPlan: true,
    requireMonitoringPlan: true,
    requireIncidentPlan: true,
    requireCommunicationPlan: true,
    requireMaintenanceWindow: true,
    requireCustomerImpactAssessment: true,
    requireHypercarePlan: true,
    acceptedRiskExpiryDaysMax: 90,
    exceptionExpiryDaysMax: 90,
    maximumExportRows: 500,
    requireIndependentFinalReviewer: true,
    simulationOnly: true,
    productionExecutionAllowed: false,
    deploymentEnabled: false,
};

export const CONTROL_LIBRARY = [
    { code: 'P26-SIM-001', title: 'Simulation-only defaults', severity: 'CRITICAL' },
    { code: 'P26-ENV-001', title: 'Unsafe environment rejection', severity: 'CRITICAL' },
    { code: 'P26-DEP-001', title: 'No deploy endpoints', severity: 'CRITICAL' },
    { code: 'P26-ACT-001', title: 'No production activation', severity: 'CRITICAL' },
    { code: 'P26-RBK-001', title: 'No rollback execution', severity: 'CRITICAL' },
    { code: 'P26-BKP-001', title: 'No backup execution', severity: 'CRITICAL' },
    { code: 'P26-RST-001', title: 'No restore execution', severity: 'CRITICAL' },
    { code: 'P26-MIG-001', title: 'No migration execution', severity: 'CRITICAL' },
    { code: 'P26-ISO-001', title: 'Company isolation', severity: 'CRITICAL' },
    { code: 'P26-P27-001', title: 'Phase 27 recommendation only', severity: 'CRITICAL' },
];

export const UNSAFE_NOTE_PATTERNS = [
    /deploy\s+now/i, /activate\s+production/i, /go\s+live/i, /execute\s+release/i,
    /rollback\s+now/i, /backup\s+now/i, /restore\s+now/i, /run\s+migration/i,
    /push\s+to\s+render/i, /git\s+commit/i, /git\s+push/i,
];

export const UNSAFE_PAYLOAD_PATTERNS = [
    /\beval\s*\(/i, /\$where\b/i, /child_process/i,
    /mongodb(\+srv)?:\/\/[^\s]+/i, /ghp_[a-zA-Z0-9]{20,}/i, /sk-[a-z0-9]{16,}/i,
];

export const LOCAL_ALLOWLIST = ['127.0.0.1', 'localhost', '::1', 'crm_test'];

export const ROLLBACK_TRIGGERS = [
    'CRITICAL_SECURITY_FAILURE', 'TENANT_ISOLATION_FAILURE', 'COMPANY_ISOLATION_FAILURE',
    'INDUSTRY_ISOLATION_FAILURE', 'DATA_CORRUPTION', 'AUTHENTICATION_OUTAGE',
    'SEVERE_PERFORMANCE_DEGRADATION', 'HIGH_ERROR_RATE', 'CRITICAL_WORKFLOW_FAILURE',
    'MONITORING_FAILURE', 'UNRECOVERABLE_CONFIGURATION_MISMATCH',
];