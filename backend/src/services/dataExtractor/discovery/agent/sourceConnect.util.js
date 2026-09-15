export const EXTRACTION_SOURCES = Object.freeze(['facebook', 'instagram']);
export const SOURCE_STATUSES = Object.freeze(['disconnected', 'connecting', 'connected', 'expired']);

const FORBIDDEN_KEYS = new Set([
    'cookie', 'cookies', 'password', 'passwd', 'token', 'accessToken',
    'session', 'sessionid', 'storageState', 'storage', 'secret',
]);

export function normalizeExtractionSource(source) {
    const raw = String(source || '').trim().toLowerCase();
    if (raw === 'fb') return 'facebook';
    if (raw === 'ig') return 'instagram';
    return EXTRACTION_SOURCES.includes(raw) ? raw : '';
}

export function sanitizeSourceStatusPatch(input = {}) {
    if (!input || typeof input !== 'object') return {};
    for (const key of Object.keys(input)) {
        if (FORBIDDEN_KEYS.has(key) || /cookie|password|token|session/i.test(key)) {
            throw new Error('Source status must not include secrets');
        }
    }
    const status = SOURCE_STATUSES.includes(input.status) ? input.status : '';
    const out = {};
    if (status) out.status = status;
    if (input.lastVerifiedAt) out.lastVerifiedAt = String(input.lastVerifiedAt).slice(0, 40);
    if (input.connectedAt) out.connectedAt = String(input.connectedAt).slice(0, 40);
    if (input.lastSeen) out.lastSeen = String(input.lastSeen).slice(0, 40);
    if (input.note) out.note = String(input.note).slice(0, 200);
    return out;
}

export function emptySourceMap() {
    return {
        facebook: { status: 'disconnected' },
        instagram: { status: 'disconnected' },
    };
}

export function mergeSourceMap(prev = {}, source, patch = {}) {
    const src = normalizeExtractionSource(source);
    if (!src) return { ...emptySourceMap(), ...(prev && typeof prev === 'object' ? prev : {}) };
    const current = prev && typeof prev === 'object' ? { ...prev } : {};
    const safe = sanitizeSourceStatusPatch(patch);
    const prevRow = current[src] && typeof current[src] === 'object' ? current[src] : {};
    const next = {
        status: 'disconnected',
        ...prevRow,
        ...safe,
    };
    if (safe.status === 'connected' && safe.note == null) next.note = '';
    if (safe.status === 'expired' && safe.note == null) {
        next.note = next.note || 'Facebook session expired';
    }
    current[src] = next;
    return current;
}
