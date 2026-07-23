/**
 * Phase 1C.2 — Read-only approved knowledge / document repository adapter.
 * companyId must come from trusted Brain Orchestrator context only.
 */

import { WhatsAppAIKnowledge, WhatsAppAIDocumentReference } from '../../../models/index.js';
import { KNOWLEDGE_RETRIEVAL_LIMITS, KNOWLEDGE_EXCLUDE_TOKENS, CONTENT_EXCLUDE_PATTERNS } from './retrievalLimits.js';

/** In-memory empty model for unit tests that inject Conversation/Message only. */
export function createEmptyReadModel() {
    return {
        find() {
            const api = {
                sort() { return api; },
                limit() { return api; },
                lean() { return Promise.resolve([]); },
                then(resolve, reject) { return Promise.resolve([]).then(resolve, reject); },
            };
            return api;
        },
    };
}

function nowMs() {
    return Date.now();
}

function withinEffectiveWindow(doc, now = nowMs()) {
    if (doc.effectiveFrom && new Date(doc.effectiveFrom).getTime() > now) return false;
    if (doc.effectiveTo && new Date(doc.effectiveTo).getTime() < now) return false;
    return true;
}

function tokenBlob(doc) {
    const parts = [
        doc.category,
        doc.subcategory,
        ...(Array.isArray(doc.keywords) ? doc.keywords : []),
        doc.title,
    ];
    return parts.filter(Boolean).join(' ').toLowerCase();
}

export function isCustomerSafeKnowledge(doc) {
    if (!doc) return false;
    if (doc.isDeleted) return false;
    if (doc.approvalStatus !== 'approved') return false;
    if (!doc.active) return false;
    if (!withinEffectiveWindow(doc)) return false;

    const blob = tokenBlob(doc);
    for (const tok of KNOWLEDGE_EXCLUDE_TOKENS) {
        if (blob.includes(String(tok).toLowerCase())) return false;
    }
    const content = String(doc.content || '');
    for (const re of CONTENT_EXCLUDE_PATTERNS) {
        if (re.test(content) || re.test(String(doc.title || ''))) return false;
    }
    return true;
}

export function isCustomerSafeDocument(doc) {
    if (!doc) return false;
    if (doc.isDeleted) return false;
    if (doc.approvalStatus !== 'approved') return false;
    if (!doc.active) return false;
    const blob = [doc.title, doc.documentType, doc.fileName].filter(Boolean).join(' ').toLowerCase();
    for (const tok of KNOWLEDGE_EXCLUDE_TOKENS) {
        if (blob.includes(String(tok).toLowerCase())) return false;
    }
    return true;
}

/**
 * @param {object} [options]
 * @param {object} [options.deps] injectable models for tests
 */
export function createApprovedKnowledgeRepository(options = {}) {
    const Knowledge = options.deps?.Knowledge || WhatsAppAIKnowledge;
    const DocumentRef = options.deps?.DocumentRef || WhatsAppAIDocumentReference;
    const limits = { ...KNOWLEDGE_RETRIEVAL_LIMITS, ...(options.limits || {}) };

    return {
        /**
         * @param {string} companyId trusted orchestrator company id
         */
        async listApprovedActiveKnowledge(companyId) {
            if (!companyId) return [];
            const filter = {
                companyId,
                isDeleted: false,
                approvalStatus: 'approved',
                active: true,
            };
            let q = Knowledge.find(filter).sort({ updatedAt: -1 }).limit(limits.maxInspectKnowledge);
            if (q && typeof q.lean === 'function') q = q.lean();
            const rows = await q;
            return (Array.isArray(rows) ? rows : []).filter(isCustomerSafeKnowledge);
        },

        async listApprovedActiveDocuments(companyId) {
            if (!companyId) return [];
            const filter = {
                companyId,
                isDeleted: false,
                approvalStatus: 'approved',
                active: true,
            };
            let q = DocumentRef.find(filter).sort({ updatedAt: -1 }).limit(limits.maxInspectDocuments);
            if (q && typeof q.lean === 'function') q = q.lean();
            const rows = await q;
            return (Array.isArray(rows) ? rows : []).filter(isCustomerSafeDocument);
        },
    };
}

export default createApprovedKnowledgeRepository;
