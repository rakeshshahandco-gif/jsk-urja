/**
 * Phase 1E — Controlled outbound gateway defaults.
 * Live sending remains disabled.
 */

export const OUTBOUND_GATEWAY_VERSION = 'outbound_gateway_v1';

export const OUTBOUND_STATUSES = Object.freeze([
    'approved',
    'queued_test',
    'simulated',
    'send_blocked',
    'ready_for_live_activation',
    'failed_test',
]);

export const DEFAULT_OUTBOUND_CONFIG = Object.freeze({
    outboundEnabled: false,
    killSwitch: true,
    requireManualConfirmation: true,
    rateLimitPerMinute: 5,
    minIntervalMs: 3000,
    businessHoursOnly: false,
    duplicateWindowMs: 24 * 60 * 60 * 1000,
});

export function isOutboundEnvEnabled(env = process.env) {
    return String(env.WHATSAPP_AI_OUTBOUND_ENABLED || '').toLowerCase() === 'true';
}

export default DEFAULT_OUTBOUND_CONFIG;
