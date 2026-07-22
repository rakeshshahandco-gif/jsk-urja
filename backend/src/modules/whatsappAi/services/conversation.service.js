import { WhatsAppAIConversation } from '../models/index.js';
import { ApiError } from '../../../utils/ApiError.js';
import { appendActionLog } from './audit.service.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { WHATSAPP_AI_PERMISSIONS } from '../constants/whatsappAi.constants.js';

function parsePagination(query = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;
    return { page, limit, skip };
}

/**
 * Resolve conversation list/get scope from authenticated user.
 * Does not trust client-supplied assignedUserId for assigned-only users.
 */
export function resolveConversationAccess(user, query = {}) {
    const viewAll = checkUserPermission(user, WHATSAPP_AI_PERMISSIONS.CONVERSATIONS_VIEW_ALL);
    const viewAssigned = checkUserPermission(user, WHATSAPP_AI_PERMISSIONS.CONVERSATIONS_VIEW_ASSIGNED);
    if (!viewAll && !viewAssigned) {
        throw new ApiError(403, 'Permission denied: whatsapp_ai.conversations.view_all or view_assigned required');
    }
    const userId = user?._id || user?.id || null;
    if (viewAll) {
        return {
            scope: 'all',
            userId,
            // view_all may optionally filter; assigned-only never chooses this branch
            assignedUserIdFilter: query.assignedUserId || null,
        };
    }
    if (!userId) {
        throw new ApiError(403, 'Permission denied: assigned conversations require an authenticated user');
    }
    return {
        scope: 'assigned',
        userId,
        // Ignore client assignedUserId — always force self.
        assignedUserIdFilter: String(userId),
    };
}

export async function listConversations(companyId, query = {}, access = null) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { companyId, isDeleted: false };

    if (query.status) filter.status = query.status;
    if (query.humanTakeoverActive === 'true' || query.humanTakeoverActive === true) {
        filter.humanTakeoverActive = true;
    }

    if (access?.scope === 'assigned') {
        filter.assignedUserId = access.userId;
    } else if (access?.assignedUserIdFilter) {
        filter.assignedUserId = access.assignedUserIdFilter;
    }

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

/** Pure check used by getConversation (and unit tests). */
export function isConversationVisibleToAccess(doc, access) {
    if (!access || access.scope !== 'assigned') return true;
    const assignee = doc?.assignedUserId ? String(doc.assignedUserId) : '';
    return !!assignee && assignee === String(access.userId);
}

export async function getConversation(companyId, id, userId = null, access = null) {
    const doc = await WhatsAppAIConversation.findOne({ _id: id, companyId, isDeleted: false }).lean();
    if (!doc) throw new ApiError(404, 'Conversation not found');

    if (!isConversationVisibleToAccess(doc, access)) {
        // Do not leak existence of another user's conversation.
        throw new ApiError(404, 'Conversation not found');
    }

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
