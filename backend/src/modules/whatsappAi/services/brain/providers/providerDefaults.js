/**
 * Phase 1C.4 — Default provider configuration (inactive by default).
 * No schema writes; config is runtime / settings overlay only.
 */

export const PROVIDER_FRAMEWORK_VERSION = 'provider_framework_v1';

export const PROVIDER_IDS = Object.freeze({
    NULL: 'null',
    OPENAI: 'openai',
    GEMINI: 'gemini',
    CLAUDE: 'claude',
    LOCAL: 'local',
});

/** Safe defaults — real network calls remain disabled. */
export const DEFAULT_PROVIDER_RUNTIME_CONFIG = Object.freeze({
    providerEnabled: false,
    provider: null,
    mode: 'dry_run',
    outboundAllowed: false,
    killSwitch: true,
    model: null,
    temperature: 0.2,
    maxTokens: 800,
    timeoutMs: 15000,
    retry: Object.freeze({ maxAttempts: 1, backoffMs: 250 }),
    companyProviderMap: Object.freeze({}),
});

export function resolveCompanyProviderConfig(companyId, overlay = {}) {
    const base = { ...DEFAULT_PROVIDER_RUNTIME_CONFIG, ...(overlay || {}) };
    const map = overlay.companyProviderMap || base.companyProviderMap || {};
    const cid = companyId == null ? '' : String(companyId);
    const companyOverlay = (cid && map[cid]) ? map[cid] : {};
    return Object.freeze({
        ...base,
        ...companyOverlay,
        companyId: cid || null,
        retry: { ...DEFAULT_PROVIDER_RUNTIME_CONFIG.retry, ...(base.retry || {}), ...(companyOverlay.retry || {}) },
    });
}

export default DEFAULT_PROVIDER_RUNTIME_CONFIG;
