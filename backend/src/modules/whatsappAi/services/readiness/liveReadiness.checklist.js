/**
 * Phase 1F — Live-readiness checklist (documentation + validation keys).
 * Does not activate live sending.
 */

export const LIVE_READINESS_VERSION = 'live_readiness_v1';

export const READINESS_STATUSES = Object.freeze([
    'not_ready',
    'dry_run_ready',
    'review_ready',
    'outbound_test_ready',
    'live_activation_requires_owner_approval',
]);

/** Final live status must remain this until owner approval. */
export const FINAL_LIVE_STATUS = 'live_activation_requires_owner_approval';

export const LIVE_READINESS_CHECKLIST = Object.freeze([
    { id: 'environment', label: 'Environment validation (NODE_ENV, localhost vs prod)' },
    { id: 'provider_secret', label: 'Provider secret validation (masked; backend-only)' },
    { id: 'channel_health', label: 'Channel health validation (no live session required yet)' },
    { id: 'permissions', label: 'Permission validation (drafts / audit / settings)' },
    { id: 'company_feature_flag', label: 'Company feature-flag validation (whatsappAiEnabled)' },
    { id: 'kill_switch', label: 'Kill-switch validation (outbound + provider)' },
    { id: 'rate_limit', label: 'Rate-limit validation' },
    { id: 'duplicate_protection', label: 'Duplicate protection validation' },
    { id: 'data_retention', label: 'Data-retention validation (audit append-only)' },
    { id: 'audit', label: 'Audit validation' },
    { id: 'rollback_plan', label: 'Rollback plan documented' },
    { id: 'production_deployment_plan', label: 'Production deployment plan documented (not executed)' },
]);

export const ROLLBACK_PLAN = Object.freeze({
    steps: [
        'Set WHATSAPP_AI_OUTBOUND_ENABLED=false',
        'Keep provider killSwitch=true / providerEnabled=false',
        'Disable company feature communication.whatsappAiEnabled if needed',
        'Do not delete audit logs or reply drafts',
        'Revert deploy via previous release artifact (owner-approved only)',
    ],
    note: 'Rollback is planned only — Phase 1F does not deploy or push.',
});

export const PRODUCTION_DEPLOYMENT_PLAN = Object.freeze({
    steps: [
        'Owner approves live activation in writing',
        'Confirm provider secrets in secure backend env (never frontend)',
        'Confirm outbound channel adapter and session health',
        'Enable outbound only after staged outbound_test_ready verification',
        'Monitor rate limits, duplicate protection, and audit trail',
    ],
    note: 'Not executed in Phase 1F. Requires explicit owner approval.',
});

export default LIVE_READINESS_CHECKLIST;
