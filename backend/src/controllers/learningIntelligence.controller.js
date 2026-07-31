import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sanitizeError } from '../services/dataExtractor/learningIntelligence/normalize.util.js';
import * as feedbackService from '../services/dataExtractor/learningIntelligence/feedback.service.js';
import * as analyticsService from '../services/dataExtractor/learningIntelligence/analytics.service.js';
import * as proposalService from '../services/dataExtractor/learningIntelligence/proposal.service.js';
import * as datasetService from '../services/dataExtractor/learningIntelligence/dataset.service.js';
import * as savedViewsService from '../services/dataExtractor/learningIntelligence/savedViews.service.js';
import { getSettingsForUser, saveLearningSettings } from '../services/dataExtractor/learningIntelligence/settings.service.js';

function rejectTenantOverrides(req) {
    if (req.body?.companyId != null || req.body?.tenantId != null
        || req.query?.companyId != null || req.query?.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

function uid(req) {
    return req.user?.id || req.user?._id;
}

function wrap(fn) {
    return asyncHandler(async (req, res) => {
        rejectTenantOverrides(req);
        try {
            const data = await fn(req);
            const status = req.method === 'POST' && !req.params.id ? 201 : 200;
            res.status(status === 201 && req.path.includes('/feedback') && req.method === 'POST' && !req.params.id ? 201 : 200)
                .send(new ApiResponse(200, data, 'Learning Intelligence OK'));
        } catch (err) {
            throw new ApiError(err.statusCode || 500, sanitizeError(err));
        }
    });
}

export const listFeedbackHandler = wrap(async (req) => feedbackService.listFeedback(req.companyId, req.query, req.user));
export const submitFeedbackHandler = wrap(async (req) => feedbackService.submitFeedback(req.companyId, uid(req), req.body || {}, req.user));
export const getFeedbackHandler = wrap(async (req) => feedbackService.getFeedback(req.companyId, req.params.id, req.user));
export const reviseFeedbackHandler = wrap(async (req) => feedbackService.reviseFeedback(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const validateFeedbackHandler = wrap(async (req) => feedbackService.validateFeedback(req.companyId, uid(req), req.params.id, req.user));
export const reviewFeedbackHandler = wrap(async (req) => feedbackService.reviewFeedback(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const archiveFeedbackHandler = wrap(async (req) => feedbackService.archiveFeedback(req.companyId, uid(req), req.params.id, req.user));
export const feedbackHistoryHandler = wrap(async (req) => feedbackService.getFeedbackHistory(req.companyId, req.params.id, req.user));

export const reviewQueueHandler = wrap(async (req) => feedbackService.listReviewQueue(req.companyId, req.query, req.user));
export const conflictsHandler = wrap(async (req) => feedbackService.listConflicts(req.companyId, req.user));
export const resolveConflictHandler = wrap(async (req) => feedbackService.resolveConflict(req.companyId, uid(req), req.params.id, req.body || {}, req.user));

export const analyticsHandler = wrap(async (req) => analyticsService.getAnalytics(req.companyId, req.query, req.user));
export const moduleAnalyticsHandler = wrap(async (req) => analyticsService.getModuleAnalytics(req.companyId, req.user));
export const reviewerAnalyticsHandler = wrap(async (req) => analyticsService.getReviewerAnalytics(req.companyId, req.user));
export const trendsHandler = wrap(async (req) => analyticsService.getTrends(req.companyId, req.query, req.user));

export const listProposalsHandler = wrap(async (req) => proposalService.listProposals(req.companyId, req.query, req.user));
export const generateProposalsHandler = wrap(async (req) => proposalService.generateProposals(req.companyId, uid(req), req.body || {}, req.user));
export const getProposalHandler = wrap(async (req) => proposalService.getProposal(req.companyId, req.params.id, req.user));
export const updateProposalHandler = wrap(async (req) => proposalService.updateProposal(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const reviewProposalHandler = wrap(async (req) => proposalService.reviewProposal(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const archiveProposalHandler = wrap(async (req) => proposalService.archiveProposal(req.companyId, uid(req), req.params.id, req.user));

export const listDatasetsHandler = wrap(async (req) => datasetService.listDatasets(req.companyId, req.user));
export const prepareDatasetHandler = wrap(async (req) => datasetService.prepareDataset(req.companyId, uid(req), req.body || {}, req.user));
export const getDatasetHandler = wrap(async (req) => datasetService.getDataset(req.companyId, req.params.id, req.user));
export const exportDatasetHandler = wrap(async (req) => datasetService.exportDataset(req.companyId, req.params.id, req.user));
export const archiveDatasetHandler = wrap(async (req) => datasetService.archiveDataset(req.companyId, uid(req), req.params.id, req.user));

export const listViewsHandler = wrap(async (req) => savedViewsService.listSavedViews(req.companyId, uid(req), req.user));
export const createViewHandler = wrap(async (req) => savedViewsService.createSavedView(req.companyId, uid(req), req.body || {}, req.user));
export const updateViewHandler = wrap(async (req) => savedViewsService.updateSavedView(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const deleteViewHandler = wrap(async (req) => savedViewsService.deleteSavedView(req.companyId, uid(req), req.params.id, req.user));

export const getSettingsHandler = wrap(async (req) => getSettingsForUser(req.companyId, req.user));
export const saveSettingsHandler = wrap(async (req) => saveLearningSettings(req.companyId, uid(req), req.body || {}, req.user));

export const auditHandler = wrap(async (req) => savedViewsService.listAudit(req.companyId, req.query, req.user));
export const exportHandler = wrap(async (req) => savedViewsService.exportFeedback(req.companyId, req.query, req.user));
