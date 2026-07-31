export const ENGINE_VERSION = 'release-manager-v1';
export const SETTINGS_VERSION = '1.0.0';
export const MODULE = 'data_extractor.release_manager';

export const PERMS = {
    view: `${MODULE}.view`,
    create: `${MODULE}.create`,
    edit_draft: `${MODULE}.edit_draft`,
    validate: `${MODULE}.validate`,
    simulate: `${MODULE}.simulate`,
    review: `${MODULE}.review`,
    qa_review: `${MODULE}.qa_review`,
    security_review: `${MODULE}.security_review`,
    database_review: `${MODULE}.database_review`,
    business_review: `${MODULE}.business_review`,
    industry_review: `${MODULE}.industry_review`,
    release_review: `${MODULE}.release_review`,
    approve_staging_plan: `${MODULE}.approve_staging_plan`,
    approve_pilot_plan: `${MODULE}.approve_pilot_plan`,
    approve_production_plan: `${MODULE}.approve_production_plan`,
    feature_flags: `${MODULE}.feature_flags`,
    backup_plan: `${MODULE}.backup_plan`,
    rollback_plan: `${MODULE}.rollback_plan`,
    migration_plan: `${MODULE}.migration_plan`,
    export: `${MODULE}.export`,
    saved_views: `${MODULE}.saved_views`,
    audit: `${MODULE}.audit`,
    settings: `${MODULE}.settings`,
    manage: `${MODULE}.manage`,
};

export const PLATFORM_ADMIN_PERMS = [
    'platform.admin',
    'saas.admin',
    'platform.release_manager.manage',
    PERMS.manage,
];

export const REVIEW_TYPE_PERMS = {
    DEVELOPMENT_REVIEW: PERMS.review,
    TECHNICAL_REVIEW: PERMS.review,
    QA_REVIEW: PERMS.qa_review,
    SECURITY_REVIEW: PERMS.security_review,
    DATABASE_REVIEW: PERMS.database_review,
    BUSINESS_REVIEW: PERMS.business_review,
    INDUSTRY_REVIEW: PERMS.industry_review,
    RELEASE_MANAGER_REVIEW: PERMS.release_review,
    FINAL_PRODUCTION_PLAN_REVIEW: PERMS.approve_production_plan,
};

export const ALLOWED_TRANSITIONS = {
    DRAFT: ['VALIDATING', 'ARCHIVED'],
    VALIDATING: ['READY_FOR_REVIEW', 'VALIDATION_FAILED', 'DRAFT'],
    VALIDATION_FAILED: ['DRAFT', 'VALIDATING', 'ARCHIVED'],
    READY_FOR_REVIEW: ['UNDER_TECHNICAL_REVIEW', 'NEEDS_CHANGES', 'ARCHIVED'],
    UNDER_TECHNICAL_REVIEW: ['UNDER_BUSINESS_REVIEW', 'UNDER_SECURITY_REVIEW', 'NEEDS_CHANGES', 'APPROVED_FOR_STAGING_PLAN'],
    UNDER_BUSINESS_REVIEW: ['UNDER_SECURITY_REVIEW', 'UNDER_RELEASE_REVIEW', 'NEEDS_CHANGES', 'APPROVED_FOR_STAGING_PLAN'],
    UNDER_SECURITY_REVIEW: ['UNDER_RELEASE_REVIEW', 'NEEDS_CHANGES', 'APPROVED_FOR_STAGING_PLAN'],
    UNDER_RELEASE_REVIEW: ['APPROVED_FOR_STAGING_PLAN', 'NEEDS_CHANGES', 'ARCHIVED'],
    NEEDS_CHANGES: ['DRAFT', 'READY_FOR_REVIEW', 'ARCHIVED'],
    APPROVED_FOR_STAGING_PLAN: ['STAGING_VALIDATION_RECORDED', 'ARCHIVED'],
    STAGING_VALIDATION_RECORDED: ['APPROVED_FOR_PILOT_PLAN', 'NEEDS_CHANGES', 'ARCHIVED'],
    APPROVED_FOR_PILOT_PLAN: ['PILOT_VALIDATION_RECORDED', 'ARCHIVED'],
    PILOT_VALIDATION_RECORDED: ['APPROVED_FOR_FUTURE_PRODUCTION_PLAN', 'NEEDS_CHANGES', 'ARCHIVED'],
    APPROVED_FOR_FUTURE_PRODUCTION_PLAN: ['RELEASE_PACKAGE_FINALIZED', 'ARCHIVED'],
    RELEASE_PACKAGE_FINALIZED: ['ARCHIVED'],
    ARCHIVED: [],
};

export const UNSAFE_NOTE_PATTERNS = [
    /ignore\s+(previous|prior)\s+(rules|approvals?)/i,
    /deploy\s+now/i,
    /run\s+shell/i,
    /reveal\s+secret/i,
    /push\s+to\s+github/i,
    /call\s+render\s+api/i,
    /restart\s+backend/i,
    /switch\s+production/i,
    /update\s+mongodb/i,
    /disable\s+security/i,
    /access\s+another\s+company/i,
    /executeMongo|runQuery|mongodump|git\s+push|npm\s+run\s+deploy/i,
];

export const UNSAFE_PAYLOAD_PATTERNS = [
    /\beval\s*\(/i, /\bFunction\s*\(/i, /\$where\b/i, /\$expr\b/i,
    /\brequire\s*\(/i, /\bimport\s*\(/i, /child_process/i, /process\.env/i,
    /rnd_[a-z0-9]{10,}/i, /ghp_[a-zA-Z0-9]{20,}/i, /mongodb(\+srv)?:\/\/[^\s]+/i,
];

export const DEFAULT_SETTINGS = {
    version: SETTINGS_VERSION,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    protectedEnvironments: ['PRODUCTION'],
    requireStagingBeforePilot: true,
    requirePilotBeforeProductionPlan: true,
    requireSandboxEvaluation: true,
    requireImplementationSpecification: true,
    requireConfigurationVersion: true,
    requireBackupPlan: true,
    requireRollbackPlan: true,
    requireMigrationPlanWhenSchemaChanges: true,
    requireSecurityReview: true,
    requireDatabaseReview: false,
    requireIndustryReview: false,
    requireSeparateFinalApprover: true,
    minimumApprovalsForStagingPlan: 1,
    minimumApprovalsForPilotPlan: 1,
    minimumApprovalsForProductionPlan: 2,
    requireHealthCheckPlan: true,
    requireSmokeTestPlan: true,
    requireMonitoringPlan: true,
    allowCrossCompanyReleasePlanning: false,
    maximumCompaniesPerReleasePlan: 20,
    maximumModulesPerRelease: 50,
    releaseNumberPattern: '^REL-[A-Z0-9-]+$',
    retentionDays: 365,
    exportRowLimit: 500,
};

export const INDUSTRIES = ['JSK_URJA_ELECTRONICS', 'HANDLOOM_TEXTILE', 'PROFESSIONAL_CRM', 'HEALTHCARE_CRM'];
