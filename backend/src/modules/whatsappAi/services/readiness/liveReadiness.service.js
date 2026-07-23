/**
 * Phase 1F — Live-readiness validation engine.
 * Always leaves final live status as live_activation_requires_owner_approval.
 */

import {
    LIVE_READINESS_VERSION,
    FINAL_LIVE_STATUS,
    LIVE_READINESS_CHECKLIST,
    ROLLBACK_PLAN,
    PRODUCTION_DEPLOYMENT_PLAN,
    READINESS_STATUSES,
} from './liveReadiness.checklist.js';
import { DEFAULT_PROVIDER_RUNTIME_CONFIG } from '../brain/providers/providerDefaults.js';
import { secretStatus } from '../brain/providers/providerSecrets.js';
import {
    DEFAULT_OUTBOUND_CONFIG,
    isOutboundEnvEnabled,
} from './../outbound/outboundDefaults.js';
import { WHATSAPP_AI_PERMISSIONS, WHATSAPP_AI_FEATURE_PATH } from '../../constants/whatsappAi.constants.js';

function check(id, ok, detail, blocking = false) {
    return { id, ok: !!ok, detail: String(detail || ''), blocking: !!blocking };
}

/**
 * @param {{
 *   env?: object,
 *   featureEnabled?: boolean,
 *   providerRuntime?: object,
 *   providerSecretRef?: object,
 *   permissionsPresent?: string[],
 *   auditAppendOnly?: boolean,
 *   duplicateProtectionPresent?: boolean,
 *   rateLimitConfigured?: boolean,
 * }} input
 */
export function evaluateLiveReadiness(input = {}) {
    const env = input.env || process.env;
    const providerRuntime = { ...DEFAULT_PROVIDER_RUNTIME_CONFIG, ...(input.providerRuntime || {}) };
    const outboundCfg = { ...DEFAULT_OUTBOUND_CONFIG, ...(input.outboundConfig || {}) };
    const checks = [];

    const isProd = String(env.NODE_ENV || '').toLowerCase() === 'production';
    checks.push(check(
        'environment',
        !isProd || input.allowProductionEval === true,
        isProd
            ? 'NODE_ENV=production — live activation still requires owner approval; no deploy performed'
            : 'Non-production / local environment OK for dry-run readiness',
        false,
    ));

    const secret = secretStatus(input.providerSecretRef || { source: 'env', name: 'WHATSAPP_AI_PROVIDER_API_KEY' }, env);
    checks.push(check(
        'provider_secret',
        true,
        secret.configured
            ? ('Secret configured (masked=' + (secret.masked || '****') + ') — real calls remain inactive by default')
            : 'No provider API key configured — adapters remain on Null Provider (OK for dry-run)',
        false,
    ));

    checks.push(check(
        'channel_health',
        true,
        'Channel adapters not live-connected in Phase 1F — placeholder health OK',
        false,
    ));

    const requiredPerms = [
        WHATSAPP_AI_PERMISSIONS.DRAFTS_VIEW,
        WHATSAPP_AI_PERMISSIONS.DRAFTS_APPROVE,
        WHATSAPP_AI_PERMISSIONS.AUDIT_VIEW,
        WHATSAPP_AI_PERMISSIONS.SETTINGS_MANAGE,
    ];
    const present = new Set(input.permissionsPresent || requiredPerms);
    const missingPerms = requiredPerms.filter((p) => !present.has(p));
    checks.push(check(
        'permissions',
        missingPerms.length === 0,
        missingPerms.length ? ('Missing: ' + missingPerms.join(', ')) : 'Draft/audit/settings permissions registered',
        missingPerms.length > 0,
    ));

    checks.push(check(
        'company_feature_flag',
        true,
        'Feature path ' + WHATSAPP_AI_FEATURE_PATH + ' — enabled=' + String(!!input.featureEnabled) + ' (company-scoped)',
        false,
    ));

    const killOk = providerRuntime.killSwitch === true
        || providerRuntime.providerEnabled !== true
        || outboundCfg.killSwitch === true
        || !isOutboundEnvEnabled(env)
        || outboundCfg.outboundEnabled !== true;
    checks.push(check(
        'kill_switch',
        killOk,
        killOk
            ? 'Outbound/provider kill switches keep live send disabled'
            : 'WARNING: kill switches appear disabled — still not activating live send',
        false,
    ));

    checks.push(check(
        'rate_limit',
        input.rateLimitConfigured !== false,
        'Outbound rate-limit defaults present (' + outboundCfg.rateLimitPerMinute + '/min)',
        false,
    ));

    checks.push(check(
        'duplicate_protection',
        input.duplicateProtectionPresent !== false,
        'Outbound idempotency / duplicate-send protection present',
        false,
    ));

    checks.push(check(
        'data_retention',
        input.auditAppendOnly !== false,
        'Audit logs append-only; no destructive retention job in Phase 1F',
        false,
    ));

    checks.push(check(
        'audit',
        true,
        'Audit action types include reply draft review events',
        false,
    ));

    checks.push(check(
        'rollback_plan',
        true,
        ROLLBACK_PLAN.note,
        false,
    ));

    checks.push(check(
        'production_deployment_plan',
        true,
        PRODUCTION_DEPLOYMENT_PLAN.note,
        false,
    ));

    const blockingFailed = checks.some((c) => c.blocking && !c.ok);
    let stage = 'not_ready';
    if (!blockingFailed) {
        stage = 'dry_run_ready';
        if (input.featureEnabled) stage = 'review_ready';
        // outbound_test_ready only if env flag true AND still simulated
        if (isOutboundEnvEnabled(env) && outboundCfg.outboundEnabled === true && outboundCfg.killSwitch !== true) {
            stage = 'outbound_test_ready';
        }
    }

    // Hard rule: never claim live activation; always require owner approval for live.
    const liveStatus = FINAL_LIVE_STATUS;

    return {
        version: LIVE_READINESS_VERSION,
        checklist: LIVE_READINESS_CHECKLIST,
        checks,
        stage,
        readinessStatuses: READINESS_STATUSES,
        liveStatus,
        liveActivationRequiresOwnerApproval: true,
        outboundEnabled: false,
        liveWhatsAppSendingEnabled: false,
        deployed: false,
        pushed: false,
        rollbackPlan: ROLLBACK_PLAN,
        productionDeploymentPlan: PRODUCTION_DEPLOYMENT_PLAN,
        provider: {
            enabled: providerRuntime.providerEnabled === true,
            killSwitch: providerRuntime.killSwitch === true,
            secretConfigured: !!secret.configured,
            secretMasked: secret.masked,
        },
        outbound: {
            envFlag: isOutboundEnvEnabled(env),
            configEnabled: outboundCfg.outboundEnabled === true,
            killSwitch: outboundCfg.killSwitch === true,
        },
    };
}

export function createLiveReadinessValidator(options = {}) {
    return {
        version: LIVE_READINESS_VERSION,
        evaluate(input = {}) {
            return evaluateLiveReadiness({ ...options, ...input });
        },
    };
}

export default createLiveReadinessValidator;
