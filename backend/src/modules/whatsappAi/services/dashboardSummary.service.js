import {
    WhatsAppAIConversation,
    WhatsAppAILeadDraft,
    WhatsAppAIHumanTakeover,
    WhatsAppAIDocumentReference,
    WhatsAppAIKnowledge,
} from '../models/index.js';

/** Phase 1A dashboard summary — zeros when collections are empty. */
export async function getDashboardSummary(companyId) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
        conversationsToday,
        activeAiConversations,
        waitingForHuman,
        leadDrafts,
        humanTakeovers,
        documentsShared,
        unansweredQuestions,
    ] = await Promise.all([
        WhatsAppAIConversation.countDocuments({
            companyId, isDeleted: false, createdAt: { $gte: startOfDay },
        }),
        WhatsAppAIConversation.countDocuments({
            companyId, isDeleted: false, humanTakeoverActive: false,
            status: { $nin: ['resolved', 'failed', 'escalated'] },
        }),
        WhatsAppAIConversation.countDocuments({
            companyId, isDeleted: false, humanTakeoverActive: true,
        }),
        WhatsAppAILeadDraft.countDocuments({ companyId, isDeleted: false }),
        WhatsAppAIHumanTakeover.countDocuments({ companyId, isDeleted: false, active: true }),
        WhatsAppAIDocumentReference.countDocuments({
            companyId, isDeleted: false, approvalStatus: 'approved',
        }),
        WhatsAppAIKnowledge.countDocuments({
            companyId, isDeleted: false, approvalStatus: 'pending',
        }),
    ]);

    return {
        conversationsToday,
        activeAiConversations,
        waitingForHuman,
        leadDrafts,
        humanTakeovers,
        aiSuccessRate: 0,
        averageResponseTimeSeconds: 0,
        mostAskedProduct: null,
        documentsShared,
        unansweredQuestions,
        featureVersion: '1a',
        liveProcessingEnabled: false,
    };
}