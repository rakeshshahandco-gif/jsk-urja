export const ENGINE_VERSION = 'activation-readiness-v1';
export const SETTINGS_VERSION = '1.0.0';
export const MODULE = 'data_extractor.activation_readiness';

export const PERMS = {
    view: 'data_extractor.activation_readiness.view',
    create: 'data_extractor.activation_readiness.create',
    update: 'data_extractor.activation_readiness.update',
    manage: 'data_extractor.activation_readiness.manage',
    validate: 'data_extractor.activation_readiness.validate',
    review: 'data_extractor.activation_readiness.review',
    final_review: 'data_extractor.activation_readiness.final_review',
    release_lineage: 'data_extractor.activation_readiness.release_lineage',
    integrity_review: 'data_extractor.activation_readiness.integrity_review',
    defect_gate: 'data_extractor.activation_readiness.defect_gate',
    risk_gate: 'data_extractor.activation_readiness.risk_gate',
    approvals: 'data_extractor.activation_readiness.approvals',
    environment_review: 'data_extractor.activation_readiness.environment_review',
    maintenance_review: 'data_extractor.activation_readiness.maintenance_review',
    monitoring_review: 'data_extractor.activation_readiness.monitoring_review',
    incident_review: 'data_extractor.activation_readiness.incident_review',
    backup_review: 'data_extractor.activation_readiness.backup_review',
    restore_review: 'data_extractor.activation_readiness.restore_review',
    rollback_review: 'data_extractor.activation_readiness.rollback_review',
    dr_review: 'data_extractor.activation_readiness.dr_review',
    communication_review: 'data_extractor.activation_readiness.communication_review',
    customer_impact: 'data_extractor.activation_readiness.customer_impact',
    hypercare: 'data_extractor.activation_readiness.hypercare',
    smoke_test_plan: 'data_extractor.activation_readiness.smoke_test_plan',
    manual_checklist: 'data_extractor.activation_readiness.manual_checklist',
    handover: 'data_extractor.activation_readiness.handover',
    exceptions: 'data_extractor.activation_readiness.exceptions',
    recommendation: 'data_extractor.activation_readiness.recommendation',
    audit: 'data_extractor.activation_readiness.audit',
    export: 'data_extractor.activation_readiness.export',
    saved_views: 'data_extractor.activation_readiness.saved_views',
    settings: 'data_extractor.activation_readiness.settings',
};

export const PLATFORM_ADMIN_PERMS = ['platform.admin', 'saas.admin', 'platform.activation_readiness.manage', PERMS.manage];

export const FORBIDDEN_STATUSES = [
    'DEPLOYED', 'PRODUCTION_DEPLOYED', 'PRODUCTION_ACTIVATED', 'LIVE', 'GO_LIVE_COMPLETE',
    'DEPLOY_NOW', 'AUTO_DEPLOY', 'ACTIVATION_COMPLETE', 'ROLLBACK_EXECUTED',
    'BACKUP_EXECUTED', 'RESTORE_EXECUTED', 'MIGRATION_EXECUTED',
];

export const ALLOWED_TRANSITIONS = {
    DRAFT: ['VALIDATION_PENDING', 'REJECTED', 'ARCHIVED'],
    VALIDATION_PENDING: ['VALIDATION_IN_PROGRESS', 'HOLD', 'REJECTED', 'ARCHIVED'],
    VALIDATION_IN_PROGRESS: ['VALIDATION_FAILED', 'BLOCKED', 'REMEDIATION_REQUIRED', 'READY_FOR_FINAL_REVIEW', 'HOLD', 'ARCHIVED'],
    VALIDATION_FAILED: ['REMEDIATION_REQUIRED', 'VALIDATION_PENDING', 'REJECTED', 'ARCHIVED'],
    BLOCKED: ['REMEDIATION_REQUIRED', 'VALIDATION_PENDING', 'REJECTED', 'ARCHIVED'],
    REMEDIATION_REQUIRED: ['VALIDATION_PENDING', 'HOLD', 'REJECTED', 'ARCHIVED'],
    HOLD: ['VALIDATION_PENDING', 'REJECTED', 'ARCHIVED'],
    READY_FOR_FINAL_REVIEW: ['READY_FOR_MANUAL_PRODUCTION_DEPLOYMENT', 'REMEDIATION_REQUIRED', 'HOLD', 'REJECTED', 'ARCHIVED'],
    READY_FOR_MANUAL_PRODUCTION_DEPLOYMENT: ['ARCHIVED'],
    REJECTED: ['ARCHIVED', 'DRAFT'],
    ARCHIVED: [],
};

export const MANDATORY_GATES = [
    { key: 'RELEASE_INTEGRITY', label: 'Release integrity', critical: true },
    { key: 'PHASE_LINEAGE', label: 'Phase lineage', critical: true },
    { key: 'CERTIFICATION_VALIDITY', label: 'Certification validity', critical: true },
    { key: 'PILOT_UAT_RESULT', label: 'Pilot/UAT result', critical: true },
    { key: 'OPERATIONAL_READINESS', label: 'Operational readiness', critical: true },
    { key: 'CRITICAL_DEFECTS', label: 'Critical defects', critical: true },
    { key: 'CRITICAL_RISKS', label: 'Critical risks', critical: true },
    { key: 'ACCEPTED_RISK_EXPIRY', label: 'Accepted-risk expiry', critical: true },
    { key: 'REQUIRED_APPROVALS', label: 'Required approvals', critical: true },
    { key: 'ENVIRONMENT_METADATA', label: 'Environment metadata', critical: true },
    { key: 'MAINTENANCE_WINDOW', label: 'Maintenance window', critical: true },
    { key: 'MONITORING', label: 'Monitoring', critical: true },
    { key: 'INCIDENT_READINESS', label: 'Incident readiness', critical: true },
    { key: 'ESCALATION_READINESS', label: 'Escalation readiness', critical: true },
    { key: 'BACKUP_PLANNING', label: 'Backup planning', critical: true },
    { key: 'RESTORE_PLANNING', label: 'Restore planning', critical: true },
    { key: 'ROLLBACK_PLANNING', label: 'Rollback planning', critical: true },
    { key: 'DR_PLANNING', label: 'DR planning', critical: true },
    { key: 'BUSINESS_CONTINUITY', label: 'Business continuity', critical: true },
    { key: 'COMMUNICATION', label: 'Communication', critical: true },
    { key: 'CUSTOMER_IMPACT', label: 'Customer impact', critical: true },
    { key: 'HYPERCARE', label: 'Hypercare', critical: true },
    { key: 'SMOKE_TESTS', label: 'Smoke tests', critical: true },
    { key: 'MANUAL_CHECKLIST', label: 'Manual deployment checklist', critical: true },
    { key: 'DEPLOYMENT_HANDOVER', label: 'Deployment handover', critical: true },
];

export const DEFAULT_SMOKE_CHECKS = [
    'Frontend loads', 'Backend health', 'Login', 'Authentication', 'Permissions',
    'Company isolation', 'Tenant isolation', 'Industry isolation', 'Data Extractor navigation',
    'Search', 'Lead intelligence views', 'Export', 'Saved views', 'Audit',
    'Phase 23-27 pages', 'Error handling', 'Version display', 'Monitoring confirmation', 'No console-breaking error',
];

export const DEFAULT_MANUAL_CHECKLIST = [
    { key: 'CONFIRM_VERSION', label: 'Confirm approved release version', status: 'PENDING' },
    { key: 'CONFIRM_CHECKSUM', label: 'Confirm release checksum', status: 'PENDING' },
    { key: 'CONFIRM_BRANCH_MANUAL', label: 'Confirm branch and commit will be selected manually later', status: 'PENDING' },
    { key: 'CONFIRM_FRONTEND', label: 'Confirm frontend service', status: 'PENDING' },
    { key: 'CONFIRM_BACKEND', label: 'Confirm backend service', status: 'PENDING' },
    { key: 'CONFIRM_ENV_REVIEW', label: 'Confirm environment-variable review', status: 'PENDING' },
    { key: 'CONFIRM_DB_SELECTION', label: 'Confirm production database selection by authorized administrator', status: 'PENDING' },
    { key: 'CONFIRM_BACKUP_OUTSIDE', label: 'Confirm backup verification outside Cursor', status: 'PENDING' },
    { key: 'CONFIRM_WINDOW', label: 'Confirm maintenance window', status: 'PENDING' },
    { key: 'CONFIRM_COMM', label: 'Confirm communication readiness', status: 'PENDING' },
    { key: 'CONFIRM_ROLLBACK_TARGET', label: 'Confirm rollback target', status: 'PENDING' },
    { key: 'CONFIRM_MONITORING', label: 'Confirm monitoring readiness', status: 'PENDING' },
    { key: 'CONFIRM_HYPERCARE', label: 'Confirm support and hypercare team', status: 'PENDING' },
    { key: 'CONFIRM_MANUAL_AUTHORITY', label: 'Confirm manual deployment authority', status: 'PENDING' },
    { key: 'CONFIRM_SMOKE_OWNER', label: 'Confirm post-deployment smoke-test owner', status: 'PENDING' },
    { key: 'CONFIRM_INCIDENT_OWNER', label: 'Confirm incident owner', status: 'PENDING' },
    { key: 'CONFIRM_ROLLBACK_AUTHORITY', label: 'Confirm rollback decision authority', status: 'PENDING' },
    { key: 'CONFIRM_EVIDENCE', label: 'Confirm completion evidence requirement', status: 'PENDING' },
];

export const DEFAULT_SETTINGS = {
    version: SETTINGS_VERSION,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    requirePhase23Approval: true,
    requirePhase24Approval: true,
    requirePhase25Closure: true,
    requirePhase26Approval: true,
    requireReleaseChecksumMatch: true,
    requireNoOpenCriticalDefects: true,
    requireNoOpenCriticalRisks: true,
    requireAcceptedRiskExpiryReview: true,
    requireSegregationOfDuties: true,
    requireMaintenanceWindowReview: true,
    requireMonitoringReview: true,
    requireIncidentReview: true,
    requireBackupReview: true,
    requireRestoreReview: true,
    requireRollbackReview: true,
    requireDrReview: true,
    requireCommunicationReview: true,
    requireCustomerImpactReview: true,
    requireHypercareReview: true,
    requireSmokeTestPlan: true,
    requireManualChecklist: true,
    requireHandoverPackage: true,
    requiredReviewerCount: 1,
    maximumExportRows: 500,
    requireIndependentFinalReviewer: true,
    simulationOnly: true,
    manualDeploymentOnly: true,
    productionExecutionAllowed: false,
    deploymentEnabled: false,
};

export const CONTROL_LIBRARY = [
    { code: 'P27-SIM-001', title: 'Simulation-only defaults', severity: 'CRITICAL' },
    { code: 'P27-MAN-001', title: 'Manual deployment only', severity: 'CRITICAL' },
    { code: 'P27-DEP-001', title: 'No deploy endpoints', severity: 'CRITICAL' },
    { code: 'P27-ACT-001', title: 'No production activation', severity: 'CRITICAL' },
    { code: 'P27-GIT-001', title: 'No Git endpoints', severity: 'CRITICAL' },
    { code: 'P27-RND-001', title: 'No Render endpoints', severity: 'CRITICAL' },
    { code: 'P27-LIN-001', title: 'Release lineage required', severity: 'CRITICAL' },
    { code: 'P27-REC-001', title: 'Recommendation only', severity: 'CRITICAL' },
];

export const UNSAFE_NOTE_PATTERNS = [
    /deploy\s+now/i, /activate\s+production/i, /go\s+live/i, /auto\s*deploy/i,
    /push\s+to\s+render/i, /git\s+commit/i, /git\s+push/i, /rollback\s+now/i,
    /backup\s+now/i, /restore\s+now/i, /run\s+migration/i,
];

export const UNSAFE_PAYLOAD_PATTERNS = [
    /\beval\s*\(/i, /\$where\b/i, /child_process/i,
    /mongodb(\+srv)?:\/\/[^\s]+/i, /ghp_[a-zA-Z0-9]{20,}/i, /sk-[a-z0-9]{16,}/i,
];

export const LOCAL_ALLOWLIST = ['127.0.0.1', 'localhost', '::1', 'crm_test'];

export const RECOMMENDATION_WARNING = 'Manual deployment has not been performed. Separate human authorization and execution outside Cursor are required.';