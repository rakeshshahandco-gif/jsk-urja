/**
 * Phase 1C.4 — Secret handling helpers (backend-only).
 * Never return full keys to frontend; never log raw keys.
 */

const FORBIDDEN_KEY_NAMES = Object.freeze([
    'apiKey', 'apiKeys', 'openaiApiKey', 'anthropicApiKey', 'geminiApiKey',
    'claudeApiKey', 'aiApiKey', 'providerApiKey', 'llmApiKey', 'secret',
    'authorization', 'bearerToken',
]);

const KEY_VALUE_RE = /(?:sk-[a-zA-Z0-9_-]{8,}|AIza[0-9A-Za-z_-]{10,}|sk-ant-[a-zA-Z0-9_-]{8,})/;

export function maskSecret(value) {
    const s = String(value || '');
    if (!s) return { present: false, masked: null, last4: null };
    const last4 = s.length >= 4 ? s.slice(-4) : '****';
    return { present: true, masked: '****…' + last4, last4 };
}

export function assertNoApiKeysInPayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    const stack = [payload];
    while (stack.length) {
        const cur = stack.pop();
        if (!cur || typeof cur !== 'object') continue;
        for (const [k, v] of Object.entries(cur)) {
            const kl = k.toLowerCase();
            if (FORBIDDEN_KEY_NAMES.some((f) => kl === f.toLowerCase() || kl.includes('apikey') || kl.includes('secret'))) {
                const err = new Error('API keys/secrets are not allowed in settings payloads. Use backend env / encrypted secret reference.');
                err.code = 'WHATSAPP_AI_SECRET_IN_PAYLOAD';
                throw err;
            }
            if (typeof v === 'string' && KEY_VALUE_RE.test(v)) {
                const err = new Error('Secret-like value rejected in settings payload.');
                err.code = 'WHATSAPP_AI_SECRET_IN_PAYLOAD';
                throw err;
            }
            if (v && typeof v === 'object') stack.push(v);
        }
    }
}

export function resolveSecretRef(ref, env = process.env) {
    if (!ref || typeof ref !== 'object') return null;
    if (ref.source === 'env' && ref.name) {
        const raw = env[String(ref.name)];
        return raw ? String(raw) : null;
    }
    if (ref.source === 'encrypted' && ref.ciphertext) {
        // Phase 1C.4: encrypted refs supported structurally; decryption deferred.
        return null;
    }
    return null;
}

export function secretStatus(ref, env = process.env) {
    const raw = resolveSecretRef(ref, env);
    const masked = maskSecret(raw);
    return {
        configured: !!raw,
        source: ref?.source || null,
        name: ref?.source === 'env' ? (ref.name || null) : null,
        masked: masked.masked,
        // never include raw
    };
}

export { FORBIDDEN_KEY_NAMES };
export default { maskSecret, assertNoApiKeysInPayload, resolveSecretRef, secretStatus };
