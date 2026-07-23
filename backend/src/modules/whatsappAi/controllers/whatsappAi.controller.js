import mongoose from 'mongoose';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import { ApiError } from '../../../utils/ApiError.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import {
    getCompanyFeatureSettings,
    isFeatureEnabled,
} from '../../../services/companyFeatureSettings.service.js';
import {
    WHATSAPP_AI_PERMISSIONS,
    WHATSAPP_AI_FEATURE_PATH,
    WHATSAPP_AI_DEFAULT_SETTINGS,
} from '../constants/whatsappAi.constants.js';
import * as settingsService from '../services/settings.service.js';
import * as conversationService from '../services/conversation.service.js';
import * as knowledgeService from '../services/knowledge.service.js';
import * as documentService from '../services/document.service.js';
import * as leadDraftService from '../services/leadDraft.service.js';
import * as auditService from '../services/audit.service.js';
import * as dashboardService from '../services/dashboardSummary.service.js';
import * as inboundTestService from '../services/inboundTest.service.js';
import * as generateDraftTestService from '../services/generateDraftTest.service.js';
import * as draftReviewService from '../services/draftReview.service.js';

const companyId = (req) => {
    if (!req.companyId) throw new ApiError(400, 'Company context required');
    return req.companyId;
};

const userId = (req) => req.user?._id || req.user?.id || null;

const dbConnectivityStatus = () => {
    const state = mongoose.connection?.readyState;
    if (state === 1) return 'connected';
    if (state === 2) return 'connecting';
    if (state === 3) return 'disconnecting';
    return 'disconnected';
};

export const health = asyncHandler(async (req, res) => {
    let featureEnabled = false;
    let mode = WHATSAPP_AI_DEFAULT_SETTINGS.mode;
    if (req.companyId) {
        const featureSettings = req.featureSettings || await getCompanyFeatureSettings(req.companyId);
        featureEnabled = isFeatureEnabled(featureSettings, WHATSAPP_AI_FEATURE_PATH);
        try {
            const aiSettings = await settingsService.getSettings(req.companyId);
            mode = aiSettings?.mode || mode;
        } catch {
            // Settings read is best-effort for health only.
        }
    }
    res.send(new ApiResponse(200, {
        module: 'whatsapp_ai',
        registered: true,
        version: '1a',
        phase: '1a',
        status: 'ok',
        featurePath: WHATSAPP_AI_FEATURE_PATH,
        featureEnabled,
        mode,
        database: dbConnectivityStatus(),
        liveWhatsAppConnected: false,
        aiProviderConnected: false,
    }, 'WhatsApp AI foundation healthy'));
});

export const getSettings = asyncHandler(async (req, res) => {
    const data = await settingsService.getSettings(companyId(req));
    res.send(new ApiResponse(200, data));
});

export const updateSettings = asyncHandler(async (req, res) => {
    const data = await settingsService.updateSettings(companyId(req), req.body, userId(req));
    res.send(new ApiResponse(200, data, 'Settings updated'));
});

export const listConversations = asyncHandler(async (req, res) => {
    const access = conversationService.resolveConversationAccess(req.user, req.query);
    const data = await conversationService.listConversations(companyId(req), req.query, access);
    res.send(new ApiResponse(200, data));
});

export const getConversation = asyncHandler(async (req, res) => {
    const access = conversationService.resolveConversationAccess(req.user, req.query);
    const data = await conversationService.getConversation(companyId(req), req.params.id, userId(req), access);
    res.send(new ApiResponse(200, data));
});

export const listLeadDrafts = asyncHandler(async (req, res) => {
    const data = await leadDraftService.listLeadDrafts(companyId(req), req.query);
    res.send(new ApiResponse(200, data));
});

export const getLeadDraft = asyncHandler(async (req, res) => {
    const data = await leadDraftService.getLeadDraft(companyId(req), req.params.id, userId(req));
    res.send(new ApiResponse(200, data));
});

export const listKnowledge = asyncHandler(async (req, res) => {
    const data = await knowledgeService.listKnowledge(companyId(req), req.query);
    res.send(new ApiResponse(200, data));
});

export const createKnowledge = asyncHandler(async (req, res) => {
    const data = await knowledgeService.createKnowledge(companyId(req), req.body, userId(req));
    res.status(201).send(new ApiResponse(201, data, 'Knowledge created'));
});

export const updateKnowledge = asyncHandler(async (req, res) => {
    const data = await knowledgeService.updateKnowledge(companyId(req), req.params.id, req.body, userId(req));
    res.send(new ApiResponse(200, data, 'Knowledge updated'));
});

export const submitKnowledge = asyncHandler(async (req, res) => {
    const data = await knowledgeService.submitKnowledge(companyId(req), req.params.id, userId(req));
    res.send(new ApiResponse(200, data, 'Knowledge submitted'));
});

export const approveKnowledge = asyncHandler(async (req, res) => {
    const data = await knowledgeService.approveKnowledge(companyId(req), req.params.id, userId(req));
    res.send(new ApiResponse(200, data, 'Knowledge approved'));
});

export const rejectKnowledge = asyncHandler(async (req, res) => {
    const data = await knowledgeService.rejectKnowledge(
        companyId(req),
        req.params.id,
        userId(req),
        req.body?.reason || '',
    );
    res.send(new ApiResponse(200, data, 'Knowledge rejected'));
});

export const activateKnowledge = asyncHandler(async (req, res) => {
    const data = await knowledgeService.setKnowledgeActive(companyId(req), req.params.id, true, userId(req));
    res.send(new ApiResponse(200, data, 'Knowledge activated'));
});

export const deactivateKnowledge = asyncHandler(async (req, res) => {
    const data = await knowledgeService.setKnowledgeActive(companyId(req), req.params.id, false, userId(req));
    res.send(new ApiResponse(200, data, 'Knowledge deactivated'));
});

export const listDocuments = asyncHandler(async (req, res) => {
    const data = await documentService.listDocuments(companyId(req), req.query);
    res.send(new ApiResponse(200, data));
});

export const createDocument = asyncHandler(async (req, res) => {
    const data = await documentService.createDocument(companyId(req), req.body, userId(req));
    res.status(201).send(new ApiResponse(201, data, 'Document created'));
});

export const updateDocument = asyncHandler(async (req, res) => {
    const data = await documentService.updateDocument(companyId(req), req.params.id, req.body, userId(req));
    res.send(new ApiResponse(200, data, 'Document updated'));
});

export const listAuditLogs = asyncHandler(async (req, res) => {
    const data = await auditService.listActionLogs(companyId(req), req.query);
    res.send(new ApiResponse(200, data));
});

export const permissionsCheck = asyncHandler(async (req, res) => {
    await auditService.appendActionLog({
        companyId: companyId(req),
        actionType: 'permissions_checked',
        actorType: 'user',
        actorUserId: userId(req),
        actionSummary: 'Permissions check',
        success: true,
    });
    res.send(new ApiResponse(200, {
        permissions: WHATSAPP_AI_PERMISSIONS,
        featurePath: WHATSAPP_AI_FEATURE_PATH,
    }));
});

export const dashboardSummary = asyncHandler(async (req, res) => {
    const data = await dashboardService.getDashboardSummary(companyId(req));
    await auditService.appendActionLog({
        companyId: companyId(req),
        actionType: 'dashboard_viewed',
        actorType: 'user',
        actorUserId: userId(req),
        actionSummary: 'Dashboard summary viewed',
        success: true,
    });
    res.send(new ApiResponse(200, data));
});

export const testInbound = asyncHandler(async (req, res) => {
    // companyId only from authenticated company scope ? never from body.
    const data = await inboundTestService.processTestInbound(companyId(req), req.body, userId(req));
    res.send(new ApiResponse(200, data, data.duplicate ? 'Duplicate inbound test (idempotent)' : 'Inbound test stored'));
});

export const testGenerateDraft = asyncHandler(async (req, res) => {
    const data = await generateDraftTestService.generateTestDraft(companyId(req), req.body, userId(req));
    res.send(new ApiResponse(200, data, data.duplicate ? 'Duplicate test draft (idempotent)' : 'Test draft stored'));
});

export const getTestDraft = asyncHandler(async (req, res) => {
    const data = await generateDraftTestService.getTestDraft(companyId(req), req.params.id);
    res.send(new ApiResponse(200, data));
});


export const listReplyDrafts = asyncHandler(async (req, res) => {
    const data = await draftReviewService.listPendingDrafts(companyId(req), { ...req.query, actorUserId: userId(req) });
    res.send(new ApiResponse(200, data));
});

export const getReplyDraft = asyncHandler(async (req, res) => {
    const data = await draftReviewService.getDraftForReview(companyId(req), req.params.id, userId(req));
    res.send(new ApiResponse(200, data));
});

export const editReplyDraft = asyncHandler(async (req, res) => {
    const data = await draftReviewService.editDraft(companyId(req), req.params.id, req.body, userId(req));
    res.send(new ApiResponse(200, data, 'Draft edited'));
});

export const approveReplyDraft = asyncHandler(async (req, res) => {
    const data = await draftReviewService.approveDraft(companyId(req), req.params.id, userId(req));
    res.send(new ApiResponse(200, data, data.message || 'Draft approved (not sent)'));
});

export const rejectReplyDraft = asyncHandler(async (req, res) => {
    const data = await draftReviewService.rejectDraft(companyId(req), req.params.id, req.body, userId(req));
    res.send(new ApiResponse(200, data, 'Draft rejected'));
});

export const regenerateReplyDraft = asyncHandler(async (req, res) => {
    const data = await draftReviewService.requestRegeneration(companyId(req), req.params.id, userId(req));
    res.send(new ApiResponse(200, data, 'Regeneration requested'));
});

export const addReplyDraftNote = asyncHandler(async (req, res) => {
    const data = await draftReviewService.addReviewNote(companyId(req), req.params.id, req.body, userId(req));
    res.send(new ApiResponse(200, data, 'Review note added'));
});
