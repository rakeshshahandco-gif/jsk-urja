export function assertNoSecrets(obj) {
    const blob = JSON.stringify(obj || {});
    // Avoid loose sk-[a-z0-9] which false-positives on ids like "task-1"
    if (/\b(password|cookie|authorization|sessiontoken|openai_api_key|api[_-]?key)\b|bearer\s+[a-z0-9._-]{8,}|sk-[a-z0-9]{16,}|data:image\/[a-z0-9+.-]+;base64,|\"[a-z0-9+\/]{80,}={0,2}\"/i.test(blob)) {
        const err = new Error('Refusing to store or return secret/session/media values');
        err.statusCode = 500;
        throw err;
    }
}

export function rejectTenantOverrides(payload = {}) {
    if (payload?.companyId != null || payload?.tenantId != null) {
        const err = new Error('companyId/tenantId overrides are rejected');
        err.statusCode = 400;
        throw err;
    }
}

export function sanitizeError(err) {
    const msg = String(err?.message || err || 'Unexpected error');
    return msg
        .replace(/mongodb(\+srv)?:\/\/[^\s'"]+/gi, '[redacted-uri]')
        .replace(/sk-[a-z0-9]{16,}/gi, '[redacted-key]')
        .replace(/bearer\s+[a-z0-9._-]+/gi, 'bearer [redacted]')
        .slice(0, 400);
}

export function sanitizeUserText(raw, max = 4000) {
    return String(raw || '')
        .replace(/\u0000/g, '')
        .trim()
        .slice(0, max);
}

export function stripInjectedInstructions(text) {
    const t = String(text || '');
    // Treat retrieved content as data: neutralize common injection phrases for storage/display
    return t
        .replace(/ignore\s+(all\s+)?(previous|prior)\s+instructions?/gi, '[untrusted-instruction-removed]')
        .replace(/reveal\s+(api|secret|password|key)/gi, '[untrusted-instruction-removed]')
        .replace(/executeMongo|runQuery|callEndpoint|invokeService/gi, '[untrusted-tool-removed]');
}

export function clampLimit(n, def, max) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return def;
    return Math.min(Math.floor(v), max);
}

export function oidEquals(a, b) {
    return String(a || '') === String(b || '');
}

export function evidenceItem({
    sourceModule,
    sourceRecordId = null,
    sourceType = 'record',
    sourceDate = null,
    approvalStatus = '',
    confidence = null,
    freshness = 'CURRENT',
    sourceUrl = null,
    label = '',
} = {}) {
    return {
        sourceModule,
        sourceRecordId: sourceRecordId ? String(sourceRecordId) : null,
        sourceType,
        sourceDate: sourceDate || null,
        retrievedAt: new Date().toISOString(),
        approvalStatus: approvalStatus || '',
        confidence,
        freshness,
        sourceUrl: sourceUrl || null,
        label: label || '',
    };
}

export function navSuggestion({
    label,
    reason = '',
    targetModule = '',
    targetRecord = null,
    requiredPermission = '',
    navigationRoute = '',
} = {}) {
    return {
        label,
        reason,
        targetModule,
        targetRecord,
        requiredPermission,
        executable: false,
        navigationRoute,
    };
}
