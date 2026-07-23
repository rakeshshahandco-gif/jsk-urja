/**
 * Phase 1C.6 — Draft assembler (pending_review only; never sends).
 */

export const DRAFT_ASSEMBLER_VERSION = 'draft_assembler_v1';

/**
 * Assemble a reviewable draft record shape (in-memory).
 * Does not persist unless caller passes a persister.
 */
export function assemblePendingDraft(input = {}) {
    const now = new Date().toISOString();
    return {
        version: DRAFT_ASSEMBLER_VERSION,
        status: 'pending_review',
        draftText: String(input.draftText || ''),
        originalDraftText: String(input.originalDraftText || input.draftText || ''),
        companyId: input.companyId ?? null,
        conversationId: input.conversationId ?? null,
        sourceMessageId: input.sourceMessageId ?? null,
        customerMessage: String(input.customerMessage || ''),
        intent: input.intent || 'unknown',
        entities: input.entities || {},
        productIntelligence: input.productIntelligence || null,
        groundingSourceIds: input.groundingSourceIds || [],
        safety: input.safety || null,
        provider: input.provider || null,
        route: input.route || null,
        language: input.language || 'en',
        autoApproved: false,
        outboundSent: false,
        requiresHumanReview: true,
        createdAt: now,
        updatedAt: now,
        warnings: input.warnings || [],
    };
}

export function createDraftAssembler() {
    return {
        version: DRAFT_ASSEMBLER_VERSION,
        assemble: assemblePendingDraft,
    };
}

export default createDraftAssembler;
