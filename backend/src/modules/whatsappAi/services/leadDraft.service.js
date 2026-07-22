import { WhatsAppAILeadDraft } from '../models/index.js';
import { ApiError } from '../../../utils/ApiError.js';
import { appendActionLog } from './audit.service.js';

function parsePagination(query = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    return { page, limit, skip: (page - 1) * limit };
}

/** Phase 1A: read-only list/get — no create/promote. */
export async function listLeadDrafts(companyId, query = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { companyId, isDeleted: false };
    if (query.approvalStatus) filter.approvalStatus = query.approvalStatus;
    if (query.q) {
        const q = String(query.q).trim();
        filter.$or = [
            { customerName: new RegExp(q, 'i') },
            { companyName: new RegExp(q, 'i') },
            { normalizedMobile: new RegExp(q, 'i') },
        ];
    }

    const [results, total] = await Promise.all([
        WhatsAppAILeadDraft.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        WhatsAppAILeadDraft.countDocuments(filter),
    ]);
    return { results, page, limit, total, totalPages: Math.ceil(total / limit) || 0 };
}

export async function getLeadDraft(companyId, id, userId = null) {
    const doc = await WhatsAppAILeadDraft.findOne({ _id: id, companyId, isDeleted: false }).lean();
    if (!doc) throw new ApiError(404, 'Lead draft not found');
    if (userId) {
        await appendActionLog({
            companyId,
            conversationId: doc.conversationId,
            actionType: 'lead_draft_viewed',
            actorType: 'user',
            actorUserId: userId,
            actionSummary: 'Lead draft viewed',
            success: true,
        });
    }
    return doc;
}