import { WhatsAppAIConversation } from '../models/index.js';
import { ApiError } from '../../../utils/ApiError.js';
import { appendActionLog } from './audit.service.js';

function parsePagination(query = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;
    return { page, limit, skip };
}

export async function listConversations(companyId, query = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { companyId, isDeleted: false };

    if (query.status) filter.status = query.status;
    if (query.humanTakeoverActive === 'true' || query.humanTakeoverActive === true) {
        filter.humanTakeoverActive = true;
    }
    if (query.assignedUserId) filter.assignedUserId = query.assignedUserId;
    if (query.q) {
        const q = String(query.q).trim();
        filter.$or = [
            { whatsappNumber: new RegExp(q, 'i') },
            { normalizedMobile: new RegExp(q, 'i') },
            { jid: new RegExp(q, 'i') },
        ];
    }

    const [results, total] = await Promise.all([
        WhatsAppAIConversation.find(filter).sort({ lastMessageAt: -1, updatedAt: -1 }).skip(skip).limit(limit).lean(),
        WhatsAppAIConversation.countDocuments(filter),
    ]);

    return {
        results,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
    };
}

export async function getConversation(companyId, id, userId = null) {
    const doc = await WhatsAppAIConversation.findOne({ _id: id, companyId, isDeleted: false }).lean();
    if (!doc) throw new ApiError(404, 'Conversation not found');

    if (userId) {
        await appendActionLog({
            companyId,
            conversationId: doc._id,
            actionType: 'conversation_viewed',
            actorType: 'user',
            actorUserId: userId,
            actionSummary: 'Conversation viewed',
            success: true,
        });
    }
    return doc;
}