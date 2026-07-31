export const ENGINE_VERSION = 'readiness-certification-v1';
export const SETTINGS_VERSION = '1.0.0';
export const MODULE = 'data_extractor.readiness_certification';

export const PERMS = {
    view: 'data_extractor.readiness_certification.view',
    create: 'data_extractor.readiness_certification.create',
    define_scope: 'data_extractor.readiness_certification.define_scope',
    collect_evidence: 'data_extractor.readiness_certification.collect_evidence',
    run_local_checks: 'data_extractor.readiness_certification.run_local_checks',
    security_review: 'data_extractor.readiness_certification.security_review',
    permission_review: 'data_extractor.readiness_certification.permission_review',
    tenant_review: 'data_extractor.readiness_certification.tenant_review',
    industry_review: 'data_extractor.readiness_certification.industry_review',
    database_review: 'data_extractor.readiness_certification.database_review',
    performance_review: 'data_extractor.readiness_certification.performance_review',
    qa_review: 'data_extractor.readiness_certification.qa_review',
    continuity_review: 'data_extractor.readiness_certification.continuity_review',
    create_finding: 'data_extractor.readiness_certification.create_finding',
    review_finding: 'data_extractor.readiness_certification.review_finding',
    create_remediation: 'data_extractor.readiness_certification.create_remediation',
    retest: 'data_extractor.readiness_certification.retest',
    accept_risk: 'data_extractor.readiness_certification.accept_risk',
    final_review: 'data_extractor.readiness_certification.final_review',
    export: 'data_extractor.readiness_certification.export',
    saved_views: 'data_extractor.readiness_certification.saved_views',
    audit: 'data_extractor.readiness_certification.audit',
    settings: 'data_extractor.readiness_certification.settings',
    manage: 'data_extractor.readiness_certification.manage',
};

export const PLATFORM_ADMIN_PERMS = [
    'platform.admin', 'saas.admin', 'platform.readiness_certification.manage', PERMS.manage,
];

export const REVIEW_TYPE_PERMS = {
    TECHNICAL_REVIEW: PERMS.qa_review,
    SECURITY_REVIEW: PERMS.security_review,
    DATABASE_REVIEW: PERMS.database_review,
    PERMISSION_REVIEW: PERMS.permission_review,
    TENANT_ISOLATION_REVIEW: PERMS.tenant_review,
    INDUSTRY_REVIEW: PERMS.industry_review,
    PERFORMANCE_REVIEW: PERMS.performance_review,
    QA_REVIEW: PERMS.qa_review,
    BUSINESS_CONTINUITY_REVIEW: PERMS.continuity_review,
    RELEASE_REVIEW: PERMS.final_review,
    FINAL_READINESS_REVIEW: PERMS.final_review,
};

export const ASSESSMENT_DOMAINS = [
    'RELEASE_PACKAGE', 'APPLICATION_ARCHITECTURE', 'BACKEND', 'FRONTEND', 'DATABASE',
    'API_SECURITY', 'AUTHENTICATION', 'AUTHORIZATION', 'PERMISSIONS', 'TENANT_ISOLATION',
    'INDUSTRY_ISOLATION', 'DATA_INTEGRITY', 'DATA_PRIVACY', 'SECRET_MANAGEMENT',
    'INPUT_VALIDATION', 'OUTPUT_SANITIZATION', 'PROMPT_INJECTION_PROTECTION',
    'FILE_AND_EXPORT_SECURITY', 'LOGGING', 'ERROR_HANDLING', 'PERFORMANCE', 'LOAD_CAPACITY',
    'BACKGROUND_JOBS', 'CACHE_ISOLATION', 'INDEXES', 'BACKUP_PLAN', 'RESTORE_PLAN',
    'ROLLBACK_PLAN', 'MIGRATION_PLAN', 'DISASTER_RECOVERY', 'BUSINESS_CONTINUITY',
    'MONITORING', 'HEALTH_CHECKS', 'TEST_COVERAGE', 'DEPENDENCIES', 'VULNERABILITY_MANAGEMENT',
    'ACCESSIBILITY', 'RESPONSIVE_UI', 'BROWSER_COMPATIBILITY', 'KNOWN_LIMITATIONS',
];

export const ALLOWED_TRANSITIONS = {
    DRAFT: ['SCOPE_DEFINED', 'ARCHIVED'],
    SCOPE_DEFINED: ['EVIDENCE_COLLECTION', 'AUTOMATED_LOCAL_CHECKS', 'ARCHIVED'],
    EVIDENCE_COLLECTION: ['AUTOMATED_LOCAL_CHECKS', 'MANUAL_REVIEW', 'ARCHIVED'],
    AUTOMATED_LOCAL_CHECKS: ['MANUAL_REVIEW', 'FINDINGS_REVIEW', 'REMEDIATION_REQUIRED', 'ARCHIVED'],
    MANUAL_REVIEW: ['FINDINGS_REVIEW', 'FINAL_REVIEW', 'REMEDIATION_REQUIRED', 'ARCHIVED'],
    FINDINGS_REVIEW: ['REMEDIATION_REQUIRED', 'FINAL_REVIEW', 'ARCHIVED'],
    REMEDIATION_REQUIRED: ['REMEDIATION_REVIEW', 'ARCHIVED'],
    REMEDIATION_REVIEW: ['FINDINGS_REVIEW', 'FINAL_REVIEW', 'REMEDIATION_REQUIRED', 'ARCHIVED'],
    FINAL_REVIEW: ['READY_FOR_STAGING_REVIEW', 'READY_FOR_CONTROLLED_PILOT_REVIEW', 'REJECTED', 'REMEDIATION_REQUIRED', 'ARCHIVED'],
    READY_FOR_STAGING_REVIEW: ['READY_FOR_CONTROLLED_PILOT_REVIEW', 'EXPIRED', 'ARCHIVED'],
    READY_FOR_CONTROLLED_PILOT_REVIEW: ['EXPIRED', 'ARCHIVED'],
    REJECTED: ['ARCHIVED', 'DRAFT'],
    EXPIRED: ['ARCHIVED'],
    ARCHIVED: [],
};

export const FORBIDDEN_OUTCOMES = [
    'PRODUCTION_READY', 'DEPLOY_NOW', 'AUTOMATICALLY_APPROVED',
    'READY_FOR_AUTOMATIC_DEPLOYMENT', 'PRODUCTION_ACTIVATED',
];

export const INDUSTRIES = ['JSK_URJA_ELECTRONICS', 'HANDLOOM_TEXTILE', 'PROFESSIONAL_CRM', 'HEALTHCARE_CRM'];

export const DEFAULT_CONTROLS = [
    {
        controlCode: 'SEC-TENANT-001', domain: 'TENANT_ISOLATION', title: 'Trusted company context',
        severityIfFailed: 'CRITICAL', testMethod: 'local_tenant_check',
        objective: 'Every company-scoped query must use trusted company context',
    },
    {
        controlCode: 'SEC-AUTH-001', domain: 'AUTHENTICATION', title: 'Protected endpoints require auth',
        severityIfFailed: 'CRITICAL', testMethod: 'route_auth_check',
        objective: 'Protected endpoints require authentication',
    },
    {
        controlCode: 'SEC-PERM-001', domain: 'PERMISSIONS', title: 'Backend permission enforcement',
        severityIfFailed: 'CRITICAL', testMethod: 'permission_matrix',
        objective: 'Frontend visibility must not replace backend permission enforcement',
    },
    {
        controlCode: 'SEC-SECRET-001', domain: 'SECRET_MANAGEMENT', title: 'Secrets not stored/exported',
        severityIfFailed: 'CRITICAL', testMethod: 'secret_scan',
        objective: 'Secrets must not be stored or exported',
    },
    {
        controlCode: 'DATA-INTEGRITY-001', domain: 'DATA_INTEGRITY', title: 'Checks do not mutate source',
        severityIfFailed: 'CRITICAL', testMethod: 'integrity_snapshot',
        objective: 'Readiness checks must not modify source records',
    },
    {
        controlCode: 'DEPLOY-001', domain: 'RELEASE_PACKAGE', title: 'No deployment execution endpoint',
        severityIfFailed: 'CRITICAL', testMethod: 'forbidden_endpoint_scan',
        objective: 'No deployment execution endpoint exists in Phase 23/24',
    },
    {
        controlCode: 'ROLLBACK-001', domain: 'ROLLBACK_PLAN', title: 'Rollback plan required',
        severityIfFailed: 'CRITICAL', testMethod: 'release_plan_check',
        objective: 'Every future-production release plan has a rollback plan',
    },
    {
        controlCode: 'BACKUP-001', domain: 'BACKUP_PLAN', title: 'Backup plan required',
        severityIfFailed: 'CRITICAL', testMethod: 'release_plan_check',
        objective: 'Every future-production release plan has a backup requirement',
    },
    {
        controlCode: 'TEST-REGRESSION-001', domain: 'TEST_COVERAGE', title: 'Protected regressions recorded',
        severityIfFailed: 'HIGH', testMethod: 'regression_evidence',
        objective: 'Protected regression suites pass',
    },
    {
        controlCode: 'PERF-API-001', domain: 'PERFORMANCE', title: 'Local response-time thresholds',
        severityIfFailed: 'MEDIUM', testMethod: 'local_benchmark',
        objective: 'Critical read endpoints meet local thresholds',
    },
    {
        controlCode: 'SEC-INJECT-001', domain: 'INPUT_VALIDATION', title: 'Mongo operators rejected',
        severityIfFailed: 'CRITICAL', testMethod: 'injection_guard',
        objective: 'Raw MongoDB operators rejected',
    },
    {
        controlCode: 'IND-ISO-001', domain: 'INDUSTRY_ISOLATION', title: 'Industry plans remain isolated',
        severityIfFailed: 'HIGH', testMethod: 'industry_isolation',
        objective: 'Industry releases remain isolated',
    },
];

export const UNSAFE_NOTE_PATTERNS = [
    /ignore\s+(these\s+)?controls/i,
    /mark\s+production\s+ready/i,
    /deploy\s+now/i,
    /reveal\s+secrets?/i,
    /access\s+another\s+company/i,
    /run\s+this\s+command/i,
    /push\s+to\s+github/i,
    /call\s+render/i,
    /restart\s+server/i,
    /modify\s+mongodb/i,
    /disable\s+audit/i,
    /accept\s+all\s+findings/i,
    /close\s+critical\s+finding/i,
];

export const UNSAFE_PAYLOAD_PATTERNS = [
    /\beval\s*\(/i,
    /\bFunction\s*\(/i,
    /\$where\b/i,
    /\$expr\b/i,
    /\brequire\s*\(/i,
    /\bimport\s*\(/i,
    /child_process/i,
    /rnd_[a-z0-9]{10,}/i,
    /ghp_[a-zA-Z0-9]{20,}/i,
    /mongodb(\+srv)?:\/\/[^\s]+/i,
];

export const DEFAULT_SETTINGS = {
    version: SETTINGS_VERSION,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    mandatoryDomains: [
        'RELEASE_PACKAGE', 'TENANT_ISOLATION', 'PERMISSIONS', 'SECRET_MANAGEMENT',
        'DATA_INTEGRITY', 'BACKUP_PLAN', 'ROLLBACK_PLAN',
    ],
    minimumEvidenceCoverage: 1,
    requireSecurityReview: true,
    requirePermissionReview: true,
    requireTenantIsolationReview: true,
    requireIndustryReview: true,
    requireDatabaseReview: false,
    requirePerformanceReview: true,
    requireQaReview: true,
    requireContinuityReview: false,
    requireIndependentFinalReviewer: true,
    blockOnCriticalFinding: true,
    blockOnHighTenantFinding: true,
    blockOnFailedRegression: true,
    blockOnFailedBuild: true,
    blockOnFailedHealth: true,
    blockOnSecretFinding: true,
    blockOnMissingRollbackPlan: true,
    blockOnMissingBackupPlan: true,
    blockOnMissingRestorePlan: false,
    blockOnMissingMonitoringPlan: true,
    maximumOpenMediumFindings: 25,
    minimumTestCoverageIndicator: 0,
    localLoadTestEnabled: true,
    maximumLocalConcurrency: 3,
    maximumLocalRequests: 20,
    maximumLocalDurationSeconds: 10,
    maximumBenchmarkRows: 50,
    maximumEvidenceFiles: 50,
    maximumExportRows: 500,
    findingRetentionDays: 365,
    certificationExpiryDays: 90,
    acceptedRiskMaximumDays: 90,
    secretScanEnabled: true,
    dependencyReviewEnabled: true,
};

export const LOCAL_ALLOWLIST = ['127.0.0.1', 'localhost', '::1'];
