import { WhatsAppAIActionLog } from '../models/index.js';

/**
 * Append-only audit service — NO update/delete exports.
 */
export async function appendActionLog({
    companyId,
    conversationId = null,
    messageId = null,
    actionType,
    actorType = 'user',
    actorUserId = null,
    actionSummary = '',
    structuredMetadata = {},
    beforeState = null,
    afterState = null,
    success = true,
    errorCode = '',
    errorSummary = '',
}) {
    const doc = await WhatsAppAIActionLog.create({
        companyId,
        conversationId,
        messageId,
        actionType,
        actorType,
        actorUserId,
        actionSummary,
        structuredMetadata,
        beforeState,
        afterState,
        success,
        errorCode,
        errorSummary,
        timestamp: new Date(),
    });
    return doc.toObject();
}

export async function listActionLogs(companyId, query = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const skip = (page - 1) * limit;
    const filter = { companyId };
    if (query.actionType) filter.actionType = query.actionType;
    if (query.conversationId) filter.conversationId = query.conversationId;

    const [results, total] = await Promise.all([
        WhatsAppAIActionLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
        WhatsAppAIActionLog.countDocuments(filter),
    ]);
    return { results, page, limit, total, totalPages: Math.ceil(total / limit) || 0 };
}