import { createHash } from 'node:crypto';
import { UNSAFE_COMMENT_PATTERNS } from './constants.js';

export function assertNoSecrets(obj) {
    const blob = JSON.stringify(obj || {});
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
    return String(err?.message || err || 'Unexpected error')
        .replace(/mongodb(\+srv)?:\/\/[^\s'"]+/gi, '[redacted-uri]')
        .replace(/sk-[a-z0-9]{16,}/gi, '[redacted-key]')
        .slice(0, 400);
}

export function sanitizeComment(raw, max = 2000) {
    const text = String(raw || '').replace(/\u0000/g, '').trim().slice(0, max);
    for (const re of UNSAFE_COMMENT_PATTERNS) {
        if (re.test(text)) {
            const err = new Error('Comment contains disallowed instructional/action content');
            err.statusCode = 400;
            throw err;
        }
    }
    return text;
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

export function snapshotHash(parts = {}) {
    const stable = JSON.stringify(parts, Object.keys(parts || {}).sort());
    return createHash('sha256').update(stable).digest('hex').slice(0, 48);
}

export function proposalChecksum(proposal) {
    return snapshotHash({
        id: String(proposal._id || proposal.id || ''),
        version: proposal.version,
        proposalType: proposal.proposalType,
        sourceModule: proposal.sourceModule,
        title: proposal.title,
        problemStatement: proposal.problemStatement,
        sampleSize: proposal.sampleSize,
        reviewerAgreement: proposal.reviewerAgreement,
        groundTruthCategory: proposal.groundTruthCategory,
        riskLevel: proposal.riskLevel,
        currentConfigurationReference: proposal.currentConfigurationReference,
        proposedConfiguration: proposal.proposedConfiguration,
        status: proposal.status,
        executable: proposal.executable,
        approvedForImplementation: proposal.approvedForImplementation,
        supportingFeedbackIds: (proposal.supportingFeedbackIds || []).map(String).sort(),
    });
}
