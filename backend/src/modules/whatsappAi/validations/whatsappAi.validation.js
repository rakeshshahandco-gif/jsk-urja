import Joi from 'joi';
import {
    WHATSAPP_AI_MODES,
    WHATSAPP_AI_DOCUMENT_TYPES,
    WHATSAPP_AI_APPROVAL_STATUSES,
    WHATSAPP_AI_REPLY_DRAFT_STATUSES,
} from '../constants/whatsappAi.constants.js';

const objectId = Joi.string().hex().length(24);

const paginationQuery = {
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    q: Joi.string().allow('').optional(),
};

export const updateSettings = {
    body: Joi.object({
        enabled: Joi.boolean(),
        mode: Joi.string().valid(...WHATSAPP_AI_MODES),
        defaultLanguage: Joi.string().max(16),
        welcomeMessage: Joi.string().allow('').max(4000),
        workingHoursEnabled: Joi.boolean(),
        workingHours: Joi.object({
            timezone: Joi.string().allow(''),
            windows: Joi.array().items(Joi.object().unknown(true)),
        }).unknown(true),
        outsideWorkingHoursMessage: Joi.string().allow('').max(2000),
        botSessionUserId: objectId.allow(null),
        autoLeadDraftEnabled: Joi.boolean(),
        humanEscalationEnabled: Joi.boolean(),
        confidenceThresholdHigh: Joi.number().min(0).max(100),
        confidenceThresholdMedium: Joi.number().min(0).max(100),
        confidenceThresholdLow: Joi.number().min(0).max(100),
        maxMessagesPerMinute: Joi.number().integer().min(1).max(1000),
        maxMessagesPerConversation: Joi.number().integer().min(1).max(10000),
        approvedProductCategories: Joi.array().items(Joi.string()),
        featureVersion: Joi.string().max(32),
    }).unknown(false),
};

export const listConversations = {
    query: Joi.object({
        ...paginationQuery,
        status: Joi.string().optional(),
        humanTakeoverActive: Joi.alternatives().try(Joi.boolean(), Joi.string()),
        assignedUserId: objectId.optional(),
    }),
};

export const idParam = {
    params: Joi.object({ id: objectId.required() }),
};

export const listLeadDrafts = {
    query: Joi.object({
        ...paginationQuery,
        approvalStatus: Joi.string().valid(...WHATSAPP_AI_APPROVAL_STATUSES).optional(),
    }),
};

export const listKnowledge = {
    query: Joi.object({
        ...paginationQuery,
        approvalStatus: Joi.string().valid(...WHATSAPP_AI_APPROVAL_STATUSES).optional(),
        category: Joi.string().allow('').optional(),
        active: Joi.alternatives().try(Joi.boolean(), Joi.string()),
    }),
};

export const createKnowledge = {
    body: Joi.object({
        title: Joi.string().required().max(300),
        content: Joi.string().allow('').max(50000),
        category: Joi.string().allow('').max(120),
        subcategory: Joi.string().allow('').max(120),
        language: Joi.string().allow('').max(16),
        keywords: Joi.array().items(Joi.string()),
        applicableProductIds: Joi.array().items(objectId),
        // Accepted but ignored on create — new knowledge is always inactive draft.
        active: Joi.boolean(),
        effectiveFrom: Joi.date().allow(null),
        effectiveTo: Joi.date().allow(null),
        sourceDocumentReferences: Joi.array().items(objectId),
    }).unknown(false),
};

export const updateKnowledge = {
    params: Joi.object({ id: objectId.required() }),
    body: createKnowledge.body.fork(['title'], (s) => s.optional()),
};

export const rejectKnowledge = {
    params: Joi.object({ id: objectId.required() }),
    body: Joi.object({
        reason: Joi.string().allow('').max(2000),
    }).unknown(false),
};

export const listDocuments = {
    query: Joi.object({
        ...paginationQuery,
        approvalStatus: Joi.string().valid(...WHATSAPP_AI_APPROVAL_STATUSES).optional(),
        documentType: Joi.string().valid(...WHATSAPP_AI_DOCUMENT_TYPES).optional(),
        productId: objectId.optional(),
        active: Joi.alternatives().try(Joi.boolean(), Joi.string()),
    }),
};

export const createDocument = {
    body: Joi.object({
        title: Joi.string().required().max(300),
        productId: objectId.allow(null),
        knowledgeId: objectId.allow(null),
        documentType: Joi.string().valid(...WHATSAPP_AI_DOCUMENT_TYPES),
        fileName: Joi.string().allow('').max(500),
        fileUrl: Joi.string().allow('').max(2000),
        storageReference: Joi.string().allow('').max(2000),
        mimeType: Joi.string().allow('').max(120),
        fileSize: Joi.number().allow(null),
        checksum: Joi.string().allow('').max(128),
        language: Joi.string().allow('').max(16),
        approvalStatus: Joi.string().valid(...WHATSAPP_AI_APPROVAL_STATUSES),
        active: Joi.boolean(),
    }).unknown(false),
};

export const updateDocument = {
    params: Joi.object({ id: objectId.required() }),
    body: createDocument.body.fork(['title'], (s) => s.optional()),
};

export const listAuditLogs = {
    query: Joi.object({
        ...paginationQuery,
        actionType: Joi.string().optional(),
        conversationId: objectId.optional(),
    }),
};


export const testInbound = {
    body: Joi.object({
        externalMessageId: Joi.string().trim().required().max(200),
        mobile: Joi.string().trim().required().max(32),
        contactName: Joi.string().trim().allow('').max(200),
        messageType: Joi.string().valid('text').default('text'),
        text: Joi.string().trim().required().min(1).max(4000),
        receivedAt: Joi.date().iso().optional(),
    }).unknown(false),
};


export const testGenerateDraft = {
    body: Joi.object({
        messageId: objectId.required(),
    }).unknown(false),
};


export const listReplyDrafts = {
    query: Joi.object({
        ...paginationQuery,
        status: Joi.string().valid(...WHATSAPP_AI_REPLY_DRAFT_STATUSES, 'all').optional(),
        pendingOnly: Joi.alternatives().try(Joi.boolean(), Joi.string()).optional(),
    }),
};

export const editReplyDraft = {
    params: Joi.object({ id: objectId.required() }),
    body: Joi.object({
        draftText: Joi.string().required().max(2000),
    }).unknown(false),
};

export const rejectReplyDraft = {
    params: Joi.object({ id: objectId.required() }),
    body: Joi.object({
        reason: Joi.string().allow('').max(1000),
    }).unknown(false),
};

export const replyDraftNote = {
    params: Joi.object({ id: objectId.required() }),
    body: Joi.object({
        note: Joi.string().required().max(2000),
    }).unknown(false),
};

export const testDraftIdParam = {
    params: Joi.object({ id: objectId.required() }),
};

export default {
    updateSettings,
    listConversations,
    idParam,
    listLeadDrafts,
    listKnowledge,
    createKnowledge,
    updateKnowledge,
    rejectKnowledge,
    listDocuments,
    createDocument,
    updateDocument,
    listAuditLogs,
    testInbound,
    testGenerateDraft,
    testDraftIdParam,
    listReplyDrafts,
    editReplyDraft,
    rejectReplyDraft,
    replyDraftNote,
};