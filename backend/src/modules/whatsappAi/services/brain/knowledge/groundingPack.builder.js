/**
 * Phase 1C.2 — Grounding Pack builder (in-memory only).
 */

import {
    GROUNDING_PACK_VERSION,
    KNOWLEDGE_RETRIEVAL_LIMITS,
    KNOWLEDGE_CATEGORY_BUCKETS,
} from './retrievalLimits.js';

function truncateSnippet(text, maxLen) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    if (s.length <= maxLen) return s;
    return s.slice(0, Math.max(0, maxLen - 1)).trimEnd() + '…';
}

function bucketForCategory(category) {
    const key = String(category || '').toLowerCase().trim();
    return KNOWLEDGE_CATEGORY_BUCKETS[key] || 'productFacts';
}

/**
 * @param {object} input
 */
export function buildGroundingPack(input = {}) {
    const limits = { ...KNOWLEDGE_RETRIEVAL_LIMITS, ...(input.limits || {}) };
    const query = input.query || {};
    const scored = Array.isArray(input.scoredCandidates) ? [...input.scoredCandidates] : [];

    // Deterministic order: score desc, then sourceType, then sourceId
    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ta = String(a.sourceType);
        const tb = String(b.sourceType);
        if (ta !== tb) return ta < tb ? -1 : 1;
        return String(a.sourceId) < String(b.sourceId) ? -1 : 1;
    });

    const seen = new Set();
    const sources = [];
    let totalChars = 0;
    let docRefCount = 0;

    for (const c of scored) {
        if (c.score <= 0) continue;
        const key = `${c.sourceType}:${c.sourceId}`;
        if (seen.has(key)) continue;
        if (sources.length >= limits.maxSelectedSources) break;
        if (c.sourceType === 'document_reference' && docRefCount >= limits.maxDocumentReferences) {
            continue;
        }

        let snippet = truncateSnippet(c.contentSnippet || c.title || '', limits.maxSnippetLength);
        if (!snippet && c.title) snippet = truncateSnippet(c.title, limits.maxSnippetLength);

        const nextTotal = totalChars + snippet.length;
        if (sources.length > 0 && nextTotal > limits.maxTotalGroundingChars) {
            const room = limits.maxTotalGroundingChars - totalChars;
            if (room < 40) break;
            snippet = truncateSnippet(snippet, room);
        }
        if (totalChars >= limits.maxTotalGroundingChars) break;

        seen.add(key);
        const source = {
            sourceType: c.sourceType,
            sourceId: String(c.sourceId),
            title: String(c.title || '').slice(0, 300),
            category: c.category || '',
            language: c.language || 'en',
            productFamily: c.productFamily || null,
            contentSnippet: snippet,
            relevanceScore: c.score,
            matchedReasons: [...(c.matchedReasons || [])],
            approved: true,
            active: true,
        };
        sources.push(source);
        totalChars += snippet.length;
        if (c.sourceType === 'document_reference') docRefCount += 1;
    }

    const productFacts = [];
    const specifications = [];
    const faqAnswers = [];
    const companyFacts = [];
    const commercialPolicies = [];
    const documentReferences = [];

    for (const s of sources) {
        if (s.sourceType === 'document_reference') {
            documentReferences.push(s);
            continue;
        }
        const bucket = bucketForCategory(s.category);
        if (bucket === 'specifications') specifications.push(s);
        else if (bucket === 'faqAnswers') faqAnswers.push(s);
        else if (bucket === 'companyFacts') companyFacts.push(s);
        else if (bucket === 'commercialPolicies') commercialPolicies.push(s);
        else productFacts.push(s);
    }

    const emptyGrounding = sources.length === 0;
    const warnings = [];
    if (emptyGrounding) warnings.push('approved_knowledge_not_found');
    if (input.priceEnquiryNoPrice) warnings.push('no_approved_price_fact');

    const confidence = emptyGrounding
        ? 0
        : Number(Math.min(0.99, sources[0].relevanceScore / 100).toFixed(3));

    return {
        version: GROUNDING_PACK_VERSION,
        companyId: input.companyId != null ? String(input.companyId) : null,
        conversationId: input.conversationId != null ? String(input.conversationId) : null,
        messageId: input.messageId != null ? String(input.messageId) : null,
        query,
        sources,
        productFacts,
        specifications,
        faqAnswers,
        companyFacts,
        commercialPolicies,
        documentReferences,
        confidence,
        warnings,
        emptyGrounding,
        requiresHumanReview: emptyGrounding || warnings.includes('no_approved_price_fact'),
    };
}

export { truncateSnippet };
