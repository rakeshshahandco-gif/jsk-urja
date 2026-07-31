import { createHash } from 'node:crypto';
import {
    UNSAFE_NOTE_PATTERNS, UNSAFE_PAYLOAD_PATTERNS, LOCAL_ALLOWLIST,
    FORBIDDEN_STATUSES, FORBIDDEN_ENVIRONMENTS, ALLOWED_ENVIRONMENTS,
} from './constants.js';

export function assertNoSecrets(obj) {
    const blob = JSON.stringify(obj || {});
    if (/\b(password|cookie|authorization|sessiontoken|openai_api_key|api[_-]?key|render[_-]?api|github[_-]?token|private[_-]?key)\b|bearer\s+[a-z0-9._-]{8,}|sk-[a-z0-9]{16,}|ghp_[a-zA-Z0-9]{20,}|rnd_[a-z0-9]{10,}|mongodb(\+srv)?:\/\/[^\s'"]+|data:image\/[a-z0-9+.-]+;base64,/i.test(blob)) {
        const err = new Error('Refusing to store or return secret/session/credential values');
        err.statusCode = 400;
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
    return String(err?.message || err || 'Unexpected error')
        .replace(/mongodb(\+srv)?:\/\/[^\s'"]+/gi, '[redacted-uri]')
        .replace(/sk-[a-z0-9]{16,}|ghp_[a-zA-Z0-9]{20,}|rnd_[a-z0-9]{10,}/gi, '[redacted-key]')
        .slice(0, 400);
}

export function rejectUnsafeFilters(obj) {
    if (obj == null || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith('$') || ['__proto__', 'constructor', 'prototype'].includes(k)) {
            const err = new Error(`Unsafe filter key rejected: ${k}`);
            err.statusCode = 400;
            throw err;
        }
        if (typeof v === 'object') rejectUnsafeFilters(v);
    }
}

export function assertSafeText(text, label = 'text') {
    const s = String(text || '');
    for (const re of UNSAFE_NOTE_PATTERNS) {
        if (re.test(s)) {
            const err = new Error(`${label} contains disallowed instructional/deployment content`);
            err.statusCode = 400;
            throw err;
        }
    }
    for (const re of UNSAFE_PAYLOAD_PATTERNS) {
        if (re.test(s)) {
            const err = new Error(`${label} contains unsafe/secret content`);
            err.statusCode = 400;
            throw err;
        }
    }
    return s.slice(0, 10000);
}

export function assertPayloadSafe(payload) {
    assertNoSecrets(payload);
    rejectUnsafeFilters(payload);
    const blob = JSON.stringify(payload || {});
    for (const re of UNSAFE_PAYLOAD_PATTERNS) {
        if (re.test(blob)) {
            const err = new Error('Unsafe operations payload rejected');
            err.statusCode = 400;
            throw err;
        }
    }
}

export function snapshotHash(parts = {}) {
    const stable = JSON.stringify(parts, Object.keys(parts || {}).sort());
    return createHash('sha256').update(stable).digest('hex').slice(0, 48);
}

export function notDeleted() {
    return { isDeleted: { $ne: true } };
}

export function forceSimulationOnly(doc) {
    return {
        ...doc,
        simulationOnly: true,
        productionExecutionAllowed: false,
        deploymentExecuted: false,
        productionActivated: false,
        rollbackExecuted: false,
        backupExecuted: false,
        restoreExecuted: false,
        migrationExecuted: false,
        executable: false,
        phase27Authorized: false,
        phase27Started: false,
    };
}

export function assertSafeEnvironment(env) {
    const e = String(env || 'PRODUCTION_PLANNING_ONLY').toUpperCase();
    if (FORBIDDEN_ENVIRONMENTS.includes(e) || (e === 'PRODUCTION') || /LIVE|RENDER_PRODUCTION/i.test(e)) {
        const err = new Error(`Unsafe environment rejected: ${e}`);
        err.statusCode = 400;
        throw err;
    }
    if (!ALLOWED_ENVIRONMENTS.includes(e)) {
        const err = new Error(`Environment not allowed for Phase 26: ${e}`);
        err.statusCode = 400;
        throw err;
    }
    return e;
}

export function assertSafeStatus(status) {
    if (FORBIDDEN_STATUSES.includes(String(status || ''))) {
        const err = new Error('Forbidden production/deployment status rejected');
        err.statusCode = 400;
        throw err;
    }
    return status;
}

export function assertLocalTarget(target) {
    const t = String(target || '').trim().toLowerCase();
    if (!t) return 'localhost';
    if (/production|prod\.|render\.com|atlas|mongodb\.net/i.test(t)) {
        const err = new Error('Production/external targets are rejected for Phase 26');
        err.statusCode = 400;
        throw err;
    }
    const host = t.replace(/^https?:\/\//, '').split(/[/:]/)[0];
    if (!LOCAL_ALLOWLIST.includes(host)) {
        const err = new Error(`Target host not in localhost allowlist: ${host}`);
        err.statusCode = 400;
        throw err;
    }
    return host;
}

export function sanitizeExportFormula(value) {
    const s = String(value ?? '');
    if (/^[=+\-@]/.test(s)) return `'${s}`;
    return s;
}

export function stripUnsafeWriteFields(body = {}) {
    const clone = { ...body };
    delete clone.companyId;
    delete clone.tenantId;
    delete clone.simulationOnly;
    delete clone.productionExecutionAllowed;
    delete clone.deploymentExecuted;
    delete clone.productionActivated;
    delete clone.rollbackExecuted;
    delete clone.backupExecuted;
    delete clone.restoreExecuted;
    delete clone.migrationExecuted;
    delete clone.executable;
    delete clone.phase27Authorized;
    delete clone.phase27Started;
    delete clone.deploymentEnabled;
    delete clone.scheduledExecution;
    return clone;
}