import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import { checkUserPermission } from '../../utils/permissionUtils.js';
import { ApiError } from '../../utils/ApiError.js';
import { extractorUpload } from '../../middlewares/extractorUpload.middleware.js';
import * as extractorController from '../../controllers/extractor.controller.js';
import * as discoveryController from '../../controllers/discovery.controller.js';
import * as discoveryAgentController from '../../controllers/discoveryAgent.controller.js';
import { protectDiscoveryAgent } from '../../middlewares/discoveryAgentAuth.middleware.js';
import * as discoveryMergeReviewController from '../../controllers/discoveryMergeReview.controller.js';
import * as industryClassificationController from '../../controllers/industryClassification.controller.js';
import * as leadRelevanceController from '../../controllers/leadRelevance.controller.js';
import * as productRecommendationController from '../../controllers/productRecommendation.controller.js';
import * as contactIntelligenceController from '../../controllers/contactIntelligence.controller.js';
import * as companyIntelligenceController from '../../controllers/companyIntelligence.controller.js';
import * as leadScoringController from '../../controllers/leadScoring.controller.js';
import * as similarCompanyController from '../../controllers/similarCompany.controller.js';
import * as crmEnrichmentController from '../../controllers/crmEnrichment.controller.js';
import * as salesWorkflowController from '../../controllers/salesWorkflow.controller.js';
import * as analyticsController from '../../controllers/dataExtractorAnalytics.controller.js';
import * as marketingIntelligenceController from '../../controllers/marketingIntelligence.controller.js';
import * as salesAssistantController from '../../controllers/salesAssistant.controller.js';
import * as knowledgeGraphController from '../../controllers/knowledgeGraph.controller.js';
import * as learningIntelligenceController from '../../controllers/learningIntelligence.controller.js';
import * as improvementApprovalController from '../../controllers/improvementApproval.controller.js';
import * as configurationManagerController from '../../controllers/configurationManager.controller.js';
import * as sandboxEvaluationController from '../../controllers/sandboxEvaluation.controller.js';
import * as releaseManagerController from '../../controllers/releaseManager.controller.js';
import * as readinessCertificationController from '../../controllers/readinessCertification.controller.js';
import * as pilotRolloutController from '../../controllers/pilotRollout.controller.js';
import * as enterpriseOperationsController from '../../controllers/enterpriseOperations.controller.js';
import * as activationReadinessController from '../../controllers/activationReadiness.controller.js';
import * as searchCampaignController from '../../controllers/searchCampaign.controller.js';
import * as searchQueryController from '../../controllers/searchQuery.controller.js';
import * as rawCaptureController from '../../controllers/rawCapture.controller.js';
import * as rawCaptureImportController from '../../controllers/rawCaptureImport.controller.js';
import * as assistedCaptureController from '../../controllers/assistedCapture.controller.js';
import * as simpleLeadSearchController from '../../controllers/simpleLeadSearch.controller.js';
import * as rawCaptureEnrichmentController from '../../controllers/rawCaptureEnrichment.controller.js';
import * as rawCaptureQualificationController from '../../controllers/rawCaptureQualification.controller.js';
import * as rawCaptureGenuinenessController from '../../controllers/rawCaptureGenuineness.controller.js';
import { multerSingleFile } from '../../controllers/rawCaptureImport.controller.js';
import { assertImportCampaignAccessMiddleware } from '../../services/dataExtractor/searchCampaign/rawCaptureImport/permissions.util.js';

const publicRouter = express.Router();
publicRouter.all('/webhooks/justdial/:token', extractorController.justdialWebhook);

const router = express.Router();

router.use(protect);

// ---- Phase 1 Search Campaign Master (Checkpoint 1) ----
router.post('/search-campaigns', checkPermission('data_extractor.search_campaign.manage'), searchCampaignController.createCampaign);
router.get('/search-campaigns', checkPermission('data_extractor.search_campaign.view'), searchCampaignController.listCampaigns);
router.get('/search-campaigns/:campaignId', checkPermission('data_extractor.search_campaign.view'), searchCampaignController.getCampaign);
router.patch('/search-campaigns/:campaignId', checkPermission('data_extractor.search_campaign.manage'), searchCampaignController.updateCampaign);
router.patch('/search-campaigns/:campaignId/status', checkPermission('data_extractor.search_campaign.manage'), searchCampaignController.changeCampaignStatus);
router.post('/search-campaigns/:campaignId/archive', checkPermission('data_extractor.search_campaign.manage'), searchCampaignController.archiveCampaign);

// ---- Phase 1 Search Query (Checkpoint 2) — additive under SearchCampaign ----
router.post('/search-campaigns/:campaignId/queries/generate', checkPermission('data_extractor.search_query.generate'), searchQueryController.generateQueries);
router.post('/search-campaigns/:campaignId/queries/regenerate', checkPermission('data_extractor.search_query.generate'), searchQueryController.regenerateQueries);
router.post('/search-campaigns/:campaignId/queries/bulk-approve', checkPermission('data_extractor.search_query.review'), searchQueryController.bulkApproveQueries);
router.post('/search-campaigns/:campaignId/queries/bulk-reject', checkPermission('data_extractor.search_query.review'), searchQueryController.bulkRejectQueries);
router.post('/search-campaigns/:campaignId/queries', checkPermission('data_extractor.search_query.manage'), searchQueryController.createQuery);
router.get('/search-campaigns/:campaignId/queries', checkPermission('data_extractor.search_query.view'), searchQueryController.listQueries);
router.get('/search-campaigns/:campaignId/queries/:queryId', checkPermission('data_extractor.search_query.view'), searchQueryController.getQuery);
router.patch('/search-campaigns/:campaignId/queries/:queryId', checkPermission('data_extractor.search_query.manage'), searchQueryController.updateQuery);
router.post('/search-campaigns/:campaignId/queries/:queryId/approve', checkPermission('data_extractor.search_query.review'), searchQueryController.approveQuery);
router.post('/search-campaigns/:campaignId/queries/:queryId/reject', checkPermission('data_extractor.search_query.review'), searchQueryController.rejectQuery);
router.post('/search-campaigns/:campaignId/queries/:queryId/open', checkPermission('data_extractor.search_query.open'), searchQueryController.openQuery);
router.post('/search-campaigns/:campaignId/queries/:queryId/archive', checkPermission('data_extractor.search_query.manage'), searchQueryController.archiveQuery);

// ---- Phase 1 Raw Capture Inbox (Checkpoint 3) ----
router.post('/search-campaigns/:campaignId/raw-captures/ingest', checkPermission('data_extractor.raw_capture.ingest'), rawCaptureController.ingest);
router.get('/search-campaigns/:campaignId/raw-captures', checkPermission('data_extractor.raw_capture.view'), rawCaptureController.list);
router.get('/search-campaigns/:campaignId/raw-captures/:rawCaptureId', checkPermission('data_extractor.raw_capture.view'), rawCaptureController.getOne);
router.patch('/search-campaigns/:campaignId/raw-captures/:rawCaptureId/notes', checkPermission('data_extractor.raw_capture.manage'), rawCaptureController.updateNotes);
router.post('/search-campaigns/:campaignId/raw-captures/:rawCaptureId/archive', checkPermission('data_extractor.raw_capture.archive'), rawCaptureController.archive);
router.get('/search-campaigns/:campaignId/raw-capture-batches/:batchId', checkPermission('data_extractor.raw_capture.view'), rawCaptureController.getBatch);

// ---- Phase 1 Raw Capture Import Adapters (Checkpoint 4) ----
router.post('/search-campaigns/:campaignId/raw-capture-imports/preview/manual-urls', checkPermission('data_extractor.raw_capture.import'), rawCaptureImportController.previewManualUrls);
router.post('/search-campaigns/:campaignId/raw-capture-imports/preview/pasted-text', checkPermission('data_extractor.raw_capture.import'), rawCaptureImportController.previewPastedText);
router.post('/search-campaigns/:campaignId/raw-capture-imports/preview/file', checkPermission('data_extractor.raw_capture.import'), assertImportCampaignAccessMiddleware, multerSingleFile, rawCaptureImportController.previewFile);
router.post('/search-campaigns/:campaignId/raw-capture-imports/ingest/manual-urls', checkPermission('data_extractor.raw_capture.import'), rawCaptureImportController.ingestManualUrls);
router.post('/search-campaigns/:campaignId/raw-capture-imports/ingest/pasted-text', checkPermission('data_extractor.raw_capture.import'), rawCaptureImportController.ingestPastedText);
router.post('/search-campaigns/:campaignId/raw-capture-imports/ingest/file', checkPermission('data_extractor.raw_capture.import'), assertImportCampaignAccessMiddleware, multerSingleFile, rawCaptureImportController.ingestFile);
router.get('/search-campaigns/:campaignId/raw-capture-imports', checkPermission('data_extractor.raw_capture.import'), rawCaptureImportController.list);
router.get('/search-campaigns/:campaignId/raw-capture-imports/:importRunId', checkPermission('data_extractor.raw_capture.import'), rawCaptureImportController.getOne);


// ---- Phase 1 Assisted Visible Google Capture (Checkpoint 5) ----
router.post('/search-campaigns/:campaignId/queries/:queryId/assisted-captures', checkPermission('data_extractor.assisted_capture.start'), assistedCaptureController.createSession);
router.get('/search-campaigns/:campaignId/queries/:queryId/assisted-captures', checkPermission('data_extractor.assisted_capture.view'), assistedCaptureController.listSessions);
router.get('/search-campaigns/:campaignId/queries/:queryId/assisted-captures/:sessionId', checkPermission('data_extractor.assisted_capture.view'), assistedCaptureController.getSession);
router.post(
    '/search-campaigns/:campaignId/queries/:queryId/assisted-captures/:sessionId/cancel',
    (req, res, next) => {
        if (
            checkUserPermission(req.user, 'data_extractor.assisted_capture.manage')
            || checkUserPermission(req.user, 'data_extractor.assisted_capture.start')
        ) {
            return next();
        }
        throw new ApiError(403, 'Permission denied: data_extractor.assisted_capture.manage or start required');
    },
    assistedCaptureController.cancelSession,
);
router.post(
    '/search-campaigns/:campaignId/queries/:queryId/assisted-captures/:sessionId/complete',
    (req, res, next) => {
        if (
            checkUserPermission(req.user, 'data_extractor.assisted_capture.manage')
            || checkUserPermission(req.user, 'data_extractor.assisted_capture.start')
        ) {
            return next();
        }
        throw new ApiError(403, 'Permission denied: data_extractor.assisted_capture.manage or start required');
    },
    assistedCaptureController.completeSession,
);
router.post(
    '/search-campaigns/:campaignId/queries/:queryId/assisted-captures/:sessionId/continue-after-manual',
    (req, res, next) => {
        if (
            checkUserPermission(req.user, 'data_extractor.assisted_capture.manage')
            || checkUserPermission(req.user, 'data_extractor.assisted_capture.start')
        ) {
            return next();
        }
        throw new ApiError(403, 'Permission denied: data_extractor.assisted_capture.manage or start required');
    },
    assistedCaptureController.continueAfterManual,
);
router.post(
    '/search-campaigns/:campaignId/queries/:queryId/assisted-captures/:sessionId/request-capture',
    (req, res, next) => {
        if (
            checkUserPermission(req.user, 'data_extractor.assisted_capture.manage')
            || checkUserPermission(req.user, 'data_extractor.assisted_capture.start')
        ) {
            return next();
        }
        throw new ApiError(403, 'Permission denied: data_extractor.assisted_capture.manage or start required');
    },
    assistedCaptureController.requestCapture,
);

// ---- Checkpoint 5B Simple Lead Search ----
router.post('/simple-lead-search/start', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.start);
router.post('/simple-lead-search/preview-queries', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.previewQueries);
router.get('/simple-lead-search/agent-status', checkPermission('data_extractor.assisted_capture.view'), simpleLeadSearchController.agentStatus);
router.get('/simple-lead-search/runs', checkPermission('data_extractor.assisted_capture.view'), simpleLeadSearchController.listRuns);
router.get('/simple-lead-search/sessions/:sessionId', checkPermission('data_extractor.assisted_capture.view'), simpleLeadSearchController.sessionStatus);
router.get('/simple-lead-search/sessions/:sessionId/results', checkPermission('data_extractor.raw_capture.view'), simpleLeadSearchController.sessionResults);
router.post('/simple-lead-search/sessions/:sessionId/stop', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.stop);
router.post('/simple-lead-search/sessions/:sessionId/continue-after-manual', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.continueAfterManual);
router.post('/simple-lead-search/sessions/:sessionId/complete', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.complete);
router.get('/simple-lead-search/sessions/:sessionId/export', checkPermission('data_extractor.raw_capture.view'), simpleLeadSearchController.exportResults);
router.post('/simple-lead-search/sessions/:sessionId/stop-and-export', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.stopAndExport);
router.post('/simple-lead-search/sessions/:sessionId/open-next-query', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.openNextQuery);
router.post('/simple-lead-search/sessions/:sessionId/open-next-page', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.openNextPage);
router.post('/simple-lead-search/sessions/:sessionId/skip-query', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.skipQuery);
router.post('/simple-lead-search/sessions/:sessionId/complete-query', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.completeQuery);
router.get('/simple-lead-search/sessions/:sessionId/campaign-progress', checkPermission('data_extractor.assisted_capture.view'), simpleLeadSearchController.campaignProgress);
router.post('/simple-lead-search/sessions/:sessionId/auto-collection/start', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.autoCollectionStart);
router.post('/simple-lead-search/sessions/:sessionId/auto-collection/pause', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.autoCollectionPause);
router.post('/simple-lead-search/sessions/:sessionId/auto-collection/resume', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.autoCollectionResume);
router.post('/simple-lead-search/sessions/:sessionId/auto-collection/stop', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.autoCollectionStop);
router.post('/simple-lead-search/sessions/:sessionId/auto-collection/continue', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.autoCollectionContinue);
router.post('/simple-lead-search/sessions/:sessionId/auto-collection/tick', checkPermission('data_extractor.assisted_capture.view'), simpleLeadSearchController.autoCollectionTick);
router.get('/simple-lead-search/sessions/:sessionId/auto-collection', checkPermission('data_extractor.assisted_capture.view'), simpleLeadSearchController.autoCollectionStatus);
router.post('/simple-lead-search/sessions/:sessionId/auto-collection/continue-batch', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.autoCollectionContinueBatch);
router.post('/simple-lead-search/sessions/:sessionId/auto-collection/resume-checkpoint', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.autoCollectionResumeCheckpoint);
router.post('/simple-lead-search/sessions/:sessionId/auto-collection/next-query', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.autoCollectionNextQuery);

router.post('/simple-lead-search/sessions/:sessionId/auto-processing/enable', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.autoProcessingEnable);
router.post('/simple-lead-search/sessions/:sessionId/auto-processing/pause', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.autoProcessingPause);
router.post('/simple-lead-search/sessions/:sessionId/auto-processing/resume', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.autoProcessingResume);
router.post('/simple-lead-search/sessions/:sessionId/auto-processing/stop', checkPermission('data_extractor.assisted_capture.start'), simpleLeadSearchController.autoProcessingStop);
router.post('/simple-lead-search/sessions/:sessionId/auto-processing/tick', checkPermission('data_extractor.assisted_capture.view'), simpleLeadSearchController.autoProcessingTick);
router.get('/simple-lead-search/sessions/:sessionId/auto-processing', checkPermission('data_extractor.assisted_capture.view'), simpleLeadSearchController.autoProcessingStatus);
router.get('/simple-lead-search/sessions/:sessionId/captured-data', checkPermission('data_extractor.raw_capture.view'), simpleLeadSearchController.campaignCapturedData);
router.get('/simple-lead-search/sessions/:sessionId/export-all-current', checkPermission('data_extractor.raw_capture.view'), simpleLeadSearchController.exportAllCurrentData);
router.post('/simple-lead-search/sessions/:sessionId/export-artifacts', checkPermission('data_extractor.raw_capture.view'), simpleLeadSearchController.persistExportArtifacts);
router.get('/simple-lead-search/sessions/:sessionId/export-artifacts/download', checkPermission('data_extractor.raw_capture.view'), simpleLeadSearchController.downloadExportArtifact);

// ---- Checkpoint 6A RawCapture website enrichment (Simple Lead Search session-scoped) ----
router.post('/simple-lead-search/sessions/:sessionId/enrichment/start', checkPermission('data_extractor.assisted_capture.start'), rawCaptureEnrichmentController.start);
router.post('/simple-lead-search/sessions/:sessionId/enrichment/stop', checkPermission('data_extractor.assisted_capture.start'), rawCaptureEnrichmentController.stop);
router.get('/simple-lead-search/sessions/:sessionId/enrichment/job', checkPermission('data_extractor.assisted_capture.view'), rawCaptureEnrichmentController.jobStatus);
router.get('/simple-lead-search/sessions/:sessionId/enrichment', checkPermission('data_extractor.raw_capture.view'), rawCaptureEnrichmentController.list);
router.get('/simple-lead-search/sessions/:sessionId/enrichment/export', checkPermission('data_extractor.raw_capture.view'), rawCaptureEnrichmentController.exportEnriched);
router.get('/simple-lead-search/sessions/:sessionId/enrichment/:enrichmentId', checkPermission('data_extractor.raw_capture.view'), rawCaptureEnrichmentController.detail);
router.patch('/simple-lead-search/sessions/:sessionId/enrichment/:enrichmentId/review', checkPermission('data_extractor.assisted_capture.start'), rawCaptureEnrichmentController.review);

// ---- Checkpoint 7 RawCapture qualification + human review (Simple Lead Search session-scoped) ----
router.post('/simple-lead-search/sessions/:sessionId/qualification/start', checkPermission('data_extractor.assisted_capture.start'), rawCaptureQualificationController.start);
router.post('/simple-lead-search/sessions/:sessionId/qualification/stop', checkPermission('data_extractor.assisted_capture.start'), rawCaptureQualificationController.stop);
router.get('/simple-lead-search/sessions/:sessionId/qualification/job', checkPermission('data_extractor.assisted_capture.view'), rawCaptureQualificationController.jobStatus);
router.get('/simple-lead-search/sessions/:sessionId/qualification', checkPermission('data_extractor.raw_capture.view'), rawCaptureQualificationController.list);
router.get('/simple-lead-search/sessions/:sessionId/qualification/export', checkPermission('data_extractor.raw_capture.view'), rawCaptureQualificationController.exportQualified);
router.post('/simple-lead-search/sessions/:sessionId/qualification/recheck-location', checkPermission('data_extractor.assisted_capture.start'), rawCaptureQualificationController.recheckLocation);
router.get('/simple-lead-search/sessions/:sessionId/qualification/recheck-location', checkPermission('data_extractor.assisted_capture.view'), rawCaptureQualificationController.recheckLocationStatus);
router.post('/simple-lead-search/sessions/:sessionId/qualification/recheck-location/stop', checkPermission('data_extractor.assisted_capture.start'), rawCaptureQualificationController.recheckLocationStop);
router.get('/simple-lead-search/sessions/:sessionId/qualification/:qualificationId', checkPermission('data_extractor.raw_capture.view'), rawCaptureQualificationController.detail);
router.patch('/simple-lead-search/sessions/:sessionId/qualification/:qualificationId/review', checkPermission('data_extractor.assisted_capture.start'), rawCaptureQualificationController.review);
router.post('/simple-lead-search/sessions/:sessionId/qualification/:qualificationId/create-crm-lead', checkPermission('data_extractor.assisted_capture.start'), rawCaptureQualificationController.createCrmLead);

// ---- Checkpoint 8 (Phase B) RawCapture genuineness verification + human review (Simple Lead Search session-scoped) ----
router.post('/simple-lead-search/sessions/:sessionId/genuineness/start', checkPermission('data_extractor.assisted_capture.start'), rawCaptureGenuinenessController.start);
router.post('/simple-lead-search/sessions/:sessionId/genuineness/stop', checkPermission('data_extractor.assisted_capture.start'), rawCaptureGenuinenessController.stop);
router.get('/simple-lead-search/sessions/:sessionId/genuineness/job', checkPermission('data_extractor.assisted_capture.view'), rawCaptureGenuinenessController.jobStatus);
router.get('/simple-lead-search/sessions/:sessionId/genuineness', checkPermission('data_extractor.raw_capture.view'), rawCaptureGenuinenessController.list);
router.get('/simple-lead-search/sessions/:sessionId/genuineness/export', checkPermission('data_extractor.raw_capture.view'), rawCaptureGenuinenessController.exportVerified);
router.get('/simple-lead-search/sessions/:sessionId/genuineness/:genuinenessId', checkPermission('data_extractor.raw_capture.view'), rawCaptureGenuinenessController.detail);
router.patch('/simple-lead-search/sessions/:sessionId/genuineness/:genuinenessId/review', checkPermission('data_extractor.assisted_capture.start'), rawCaptureGenuinenessController.review);
router.post('/simple-lead-search/sessions/:sessionId/genuineness/:genuinenessId/create-crm-lead', checkPermission('data_extractor.assisted_capture.start'), rawCaptureGenuinenessController.createCrmLead);

router.get('/settings', checkPermission('data_extractor.extractor.view'), extractorController.getSettings);
router.get('/provider-status', checkPermission('data_extractor.extractor.view'), extractorController.getProviderStatusHandler);
router.post('/provider/test', checkPermission('data_extractor.extractor.search'), extractorController.testWebSearchProvider);
router.put('/settings', checkPermission('data_extractor.extractor.settings'), extractorController.putSettings);
router.get('/ai-lead-intelligence', checkPermission('data_extractor.lead_intelligence.view'), extractorController.getAiLeadIntelligenceOverview);
router.put('/ai-lead-intelligence', checkPermission('data_extractor.lead_intelligence.manage'), extractorController.saveAiLeadIntelligenceOverview);
router.post('/ai-lead-intelligence/classify-sample', checkPermission('data_extractor.lead_intelligence.classify'), extractorController.classifyAiLeadSampleHandler);

// ---- Phase 6 / 6A Industry Classification Engine (exact permission mapping) ----
router.get('/ai-lead-intelligence/classifications', checkPermission('data_extractor.lead_intelligence.view'), industryClassificationController.list);
router.get('/ai-lead-intelligence/classifications/:id', checkPermission('data_extractor.lead_intelligence.view'), industryClassificationController.getOne);
router.get('/ai-lead-intelligence/classifications/:id/evidence', checkPermission('data_extractor.lead_intelligence.view_evidence'), industryClassificationController.getEvidence);
router.get('/ai-lead-intelligence/classifications/:id/history', checkPermission('data_extractor.lead_intelligence.view_history'), industryClassificationController.getHistory);
router.get('/ai-lead-intelligence/classifications/:id/audit', checkPermission('data_extractor.lead_intelligence.audit'), industryClassificationController.getAudit);
router.post('/ai-lead-intelligence/classifications/classify', checkPermission('data_extractor.lead_intelligence.classify'), industryClassificationController.classifyOne);
router.post('/ai-lead-intelligence/classifications/:id/override', checkPermission('data_extractor.lead_intelligence.override'), industryClassificationController.overrideOne);
router.post('/ai-lead-intelligence/classifications/:id/lock', checkPermission('data_extractor.lead_intelligence.lock'), industryClassificationController.lockOne);
router.post('/ai-lead-intelligence/classifications/:id/mark-irrelevant', checkPermission('data_extractor.lead_intelligence.mark_irrelevant'), industryClassificationController.markIrrelevantOne);
router.post('/ai-lead-intelligence/classifications/:id/reanalyze', checkPermission('data_extractor.lead_intelligence.classify'), industryClassificationController.reanalyzeOne);
router.get('/ai-lead-intelligence/batches', checkPermission('data_extractor.lead_intelligence.view'), industryClassificationController.listBatches);
router.post('/ai-lead-intelligence/batches', checkPermission('data_extractor.lead_intelligence.batch'), industryClassificationController.createBatch);
router.get('/ai-lead-intelligence/batches/:id', checkPermission('data_extractor.lead_intelligence.view'), industryClassificationController.getBatch);
router.get('/ai-lead-intelligence/batches/:id/audit', checkPermission('data_extractor.lead_intelligence.audit'), industryClassificationController.getBatchAudit);
router.post('/ai-lead-intelligence/batches/:id/control', checkPermission('data_extractor.lead_intelligence.batch'), industryClassificationController.controlBatch);
router.post('/ai-lead-intelligence/batches/:id/process', checkPermission('data_extractor.lead_intelligence.batch'), industryClassificationController.processBatch);

// ---- Phase 7 Lead Relevance / Target-Market Fit ----
router.get('/ai-lead-intelligence/relevance', checkPermission('data_extractor.lead_intelligence.view'), leadRelevanceController.list);
router.get('/ai-lead-intelligence/relevance/:id', checkPermission('data_extractor.lead_intelligence.view'), leadRelevanceController.getOne);
router.get('/ai-lead-intelligence/relevance/:id/history', checkPermission('data_extractor.lead_intelligence.relevance_audit'), leadRelevanceController.history);
router.post('/ai-lead-intelligence/relevance/evaluate', checkPermission('data_extractor.lead_intelligence.relevance_run'), leadRelevanceController.evaluate);
router.post('/ai-lead-intelligence/relevance/evaluate-sample', checkPermission('data_extractor.lead_intelligence.relevance_run'), leadRelevanceController.evaluateSample);
router.post('/ai-lead-intelligence/relevance/:id/exclude', checkPermission('data_extractor.lead_intelligence.relevance_exclude'), leadRelevanceController.excludeOne);
router.post('/ai-lead-intelligence/relevance/:id/restore', checkPermission('data_extractor.lead_intelligence.relevance_restore'), leadRelevanceController.restoreOne);

// ---- Phase 8 Product Opportunity Recommendation ----
router.get('/ai-lead-intelligence/products', checkPermission('data_extractor.product_recommendation.view'), productRecommendationController.listProducts);
router.put('/ai-lead-intelligence/products', checkPermission('data_extractor.product_recommendation.manage'), productRecommendationController.saveProducts);
router.get('/ai-lead-intelligence/recommendations', checkPermission('data_extractor.product_recommendation.view'), productRecommendationController.list);
router.get('/ai-lead-intelligence/recommendations/:id', checkPermission('data_extractor.product_recommendation.view'), productRecommendationController.getOne);
router.get('/ai-lead-intelligence/recommendations/:id/history', checkPermission('data_extractor.product_recommendation.history'), productRecommendationController.history);
router.post('/ai-lead-intelligence/recommendations/recommend', checkPermission('data_extractor.product_recommendation.run'), productRecommendationController.recommend);
router.post('/ai-lead-intelligence/recommendations/recommend-sample', checkPermission('data_extractor.product_recommendation.run'), productRecommendationController.recommendSample);
router.post('/ai-lead-intelligence/recommendations/:id/override', checkPermission('data_extractor.product_recommendation.override'), productRecommendationController.overrideOne);
router.post('/ai-lead-intelligence/recommendations/:id/lock', checkPermission('data_extractor.product_recommendation.lock'), productRecommendationController.lockOne);
router.get('/ai-lead-intelligence/recommendation-batches', checkPermission('data_extractor.product_recommendation.view'), productRecommendationController.listBatches);
router.post('/ai-lead-intelligence/recommendation-batches', checkPermission('data_extractor.product_recommendation.run'), productRecommendationController.createBatch);
router.get('/ai-lead-intelligence/recommendation-batches/:id', checkPermission('data_extractor.product_recommendation.view'), productRecommendationController.getBatch);
router.get('/ai-lead-intelligence/recommendation-batches/:id/audit', checkPermission('data_extractor.product_recommendation.audit'), productRecommendationController.getBatchAudit);
router.post('/ai-lead-intelligence/recommendation-batches/:id/control', checkPermission('data_extractor.product_recommendation.run'), productRecommendationController.controlBatch);
router.post('/ai-lead-intelligence/recommendation-batches/:id/process', checkPermission('data_extractor.product_recommendation.run'), productRecommendationController.processBatch);

// ---- Phase 9 AI Contact Intelligence & Decision-Maker Identification ----
router.get('/ai-lead-intelligence/contact-roles', checkPermission('data_extractor.contact_intelligence.view'), contactIntelligenceController.listRoles);
router.put('/ai-lead-intelligence/contact-roles', checkPermission('data_extractor.contact_intelligence.manage'), contactIntelligenceController.saveRoles);
router.post('/ai-lead-intelligence/contact-roles/seed', checkPermission('data_extractor.contact_intelligence.manage'), contactIntelligenceController.seedRoles);
router.get('/ai-lead-intelligence/contacts', checkPermission('data_extractor.contact_intelligence.view'), contactIntelligenceController.list);
router.get('/ai-lead-intelligence/contacts/export', checkPermission('data_extractor.contact_intelligence.export'), contactIntelligenceController.exportApproved);
router.get('/ai-lead-intelligence/contacts/:id', checkPermission('data_extractor.contact_intelligence.view'), contactIntelligenceController.getOne);
router.get('/ai-lead-intelligence/contacts/:id/history', checkPermission('data_extractor.contact_intelligence.history'), contactIntelligenceController.history);
router.post('/ai-lead-intelligence/contacts/analyze', checkPermission('data_extractor.contact_intelligence.run'), contactIntelligenceController.analyze);
router.post('/ai-lead-intelligence/contacts/analyze-sample', checkPermission('data_extractor.contact_intelligence.run'), contactIntelligenceController.analyzeSample);
router.post('/ai-lead-intelligence/contacts/:id/override', checkPermission('data_extractor.contact_intelligence.override'), contactIntelligenceController.overrideOne);
router.post('/ai-lead-intelligence/contacts/:id/verify', checkPermission('data_extractor.contact_intelligence.verify'), contactIntelligenceController.overrideOne);
router.post('/ai-lead-intelligence/contacts/:id/merge', checkPermission('data_extractor.contact_intelligence.merge'), contactIntelligenceController.overrideOne);
router.post('/ai-lead-intelligence/contacts/:id/lock', checkPermission('data_extractor.contact_intelligence.lock'), contactIntelligenceController.lockOne);
router.get('/ai-lead-intelligence/contact-batches', checkPermission('data_extractor.contact_intelligence.view'), contactIntelligenceController.listBatches);
router.post('/ai-lead-intelligence/contact-batches', checkPermission('data_extractor.contact_intelligence.batch'), contactIntelligenceController.createBatch);
router.get('/ai-lead-intelligence/contact-batches/:id', checkPermission('data_extractor.contact_intelligence.view'), contactIntelligenceController.getBatch);
router.get('/ai-lead-intelligence/contact-batches/:id/audit', checkPermission('data_extractor.contact_intelligence.audit'), contactIntelligenceController.getBatchAudit);
router.post('/ai-lead-intelligence/contact-batches/:id/control', checkPermission('data_extractor.contact_intelligence.batch'), contactIntelligenceController.controlBatch);
router.post('/ai-lead-intelligence/contact-batches/:id/process', checkPermission('data_extractor.contact_intelligence.batch'), contactIntelligenceController.processBatch);

// ---- Phase 10 AI Company Summary / Business Intelligence Profile ----
router.get('/ai-lead-intelligence/profiles', checkPermission('data_extractor.company_intelligence.view'), companyIntelligenceController.list);
router.get('/ai-lead-intelligence/profiles/export', checkPermission('data_extractor.company_intelligence.export'), companyIntelligenceController.exportApproved);
router.get('/ai-lead-intelligence/profiles/:id', checkPermission('data_extractor.company_intelligence.view'), companyIntelligenceController.getOne);
router.get('/ai-lead-intelligence/profiles/:id/history', checkPermission('data_extractor.company_intelligence.history'), companyIntelligenceController.history);
router.post('/ai-lead-intelligence/profiles/generate', checkPermission('data_extractor.company_intelligence.generate'), companyIntelligenceController.generate);
router.post('/ai-lead-intelligence/profiles/generate-sample', checkPermission('data_extractor.company_intelligence.generate'), companyIntelligenceController.generateSample);
router.post('/ai-lead-intelligence/profiles/:id/edit', checkPermission('data_extractor.company_intelligence.edit'), companyIntelligenceController.editOne);
router.post('/ai-lead-intelligence/profiles/:id/approve', checkPermission('data_extractor.company_intelligence.approve'), companyIntelligenceController.approveOne);
router.post('/ai-lead-intelligence/profiles/:id/lock', checkPermission('data_extractor.company_intelligence.lock'), companyIntelligenceController.lockOne);
router.get('/ai-lead-intelligence/profile-batches', checkPermission('data_extractor.company_intelligence.view'), companyIntelligenceController.listBatches);
router.post('/ai-lead-intelligence/profile-batches', checkPermission('data_extractor.company_intelligence.batch'), companyIntelligenceController.createBatch);
router.get('/ai-lead-intelligence/profile-batches/:id', checkPermission('data_extractor.company_intelligence.view'), companyIntelligenceController.getBatch);
router.get('/ai-lead-intelligence/profile-batches/:id/audit', checkPermission('data_extractor.company_intelligence.audit'), companyIntelligenceController.getBatchAudit);
router.post('/ai-lead-intelligence/profile-batches/:id/control', checkPermission('data_extractor.company_intelligence.batch'), companyIntelligenceController.controlBatch);
router.post('/ai-lead-intelligence/profile-batches/:id/process', checkPermission('data_extractor.company_intelligence.batch'), companyIntelligenceController.processBatch);

// ---- Phase 11 Final AI Lead Scoring and Priority Engine ----
router.get('/ai-lead-intelligence/scoring-settings', checkPermission('data_extractor.lead_scoring.view'), leadScoringController.getSettings);
router.put('/ai-lead-intelligence/scoring-settings', checkPermission('data_extractor.lead_scoring.manage'), leadScoringController.saveSettings);
router.get('/ai-lead-intelligence/scores', checkPermission('data_extractor.lead_scoring.view'), leadScoringController.list);
router.get('/ai-lead-intelligence/scores/export', checkPermission('data_extractor.lead_scoring.export'), leadScoringController.exportApproved);
router.get('/ai-lead-intelligence/scores/:id', checkPermission('data_extractor.lead_scoring.view'), leadScoringController.getOne);
router.get('/ai-lead-intelligence/scores/:id/history', checkPermission('data_extractor.lead_scoring.history'), leadScoringController.history);
router.post('/ai-lead-intelligence/scores/score', checkPermission('data_extractor.lead_scoring.run'), leadScoringController.score);
router.post('/ai-lead-intelligence/scores/score-sample', checkPermission('data_extractor.lead_scoring.run'), leadScoringController.scoreSample);
router.post('/ai-lead-intelligence/scores/:id/override', checkPermission('data_extractor.lead_scoring.override'), leadScoringController.overrideOne);
router.post('/ai-lead-intelligence/scores/:id/approve', checkPermission('data_extractor.lead_scoring.approve'), leadScoringController.approveOne);
router.post('/ai-lead-intelligence/scores/:id/reject', checkPermission('data_extractor.lead_scoring.reject'), leadScoringController.rejectOne);
router.post('/ai-lead-intelligence/scores/:id/lock', checkPermission('data_extractor.lead_scoring.lock'), leadScoringController.lockOne);
router.get('/ai-lead-intelligence/score-batches', checkPermission('data_extractor.lead_scoring.view'), leadScoringController.listBatches);
router.post('/ai-lead-intelligence/score-batches', checkPermission('data_extractor.lead_scoring.batch'), leadScoringController.createBatch);
router.get('/ai-lead-intelligence/score-batches/:id', checkPermission('data_extractor.lead_scoring.view'), leadScoringController.getBatch);
router.get('/ai-lead-intelligence/score-batches/:id/audit', checkPermission('data_extractor.lead_scoring.audit'), leadScoringController.getBatchAudit);
router.post('/ai-lead-intelligence/score-batches/:id/control', checkPermission('data_extractor.lead_scoring.batch'), leadScoringController.controlBatch);
router.post('/ai-lead-intelligence/score-batches/:id/process', checkPermission('data_extractor.lead_scoring.batch'), leadScoringController.processBatch);

// Phase 12 — Similar Company / Market Intelligence
router.get('/ai-lead-intelligence/similar-settings', checkPermission('data_extractor.similar_company.view'), similarCompanyController.getSettings);
router.put('/ai-lead-intelligence/similar-settings', checkPermission('data_extractor.similar_company.manage'), similarCompanyController.saveSettings);
router.get('/ai-lead-intelligence/similar', checkPermission('data_extractor.similar_company.view'), similarCompanyController.list);
router.get('/ai-lead-intelligence/similar/export', checkPermission('data_extractor.similar_company.export'), similarCompanyController.exportApproved);
router.get('/ai-lead-intelligence/similar/:id', checkPermission('data_extractor.similar_company.view'), similarCompanyController.getOne);
router.get('/ai-lead-intelligence/similar/:id/history', checkPermission('data_extractor.similar_company.history'), similarCompanyController.history);
router.post('/ai-lead-intelligence/similar/find', checkPermission('data_extractor.similar_company.run'), similarCompanyController.findSimilar);
router.post('/ai-lead-intelligence/similar/find-sample', checkPermission('data_extractor.similar_company.run'), similarCompanyController.findSample);
router.post('/ai-lead-intelligence/similar/:id/override', checkPermission('data_extractor.similar_company.override'), similarCompanyController.overrideOne);
router.post('/ai-lead-intelligence/similar/:id/approve', checkPermission('data_extractor.similar_company.approve'), similarCompanyController.approveOne);
router.post('/ai-lead-intelligence/similar/:id/reject', checkPermission('data_extractor.similar_company.reject'), similarCompanyController.rejectOne);
router.post('/ai-lead-intelligence/similar/:id/lock', checkPermission('data_extractor.similar_company.lock'), similarCompanyController.lockOne);
router.get('/ai-lead-intelligence/similar-batches', checkPermission('data_extractor.similar_company.view'), similarCompanyController.listBatches);
router.post('/ai-lead-intelligence/similar-batches', checkPermission('data_extractor.similar_company.batch'), similarCompanyController.createBatch);
router.get('/ai-lead-intelligence/similar-batches/:id', checkPermission('data_extractor.similar_company.view'), similarCompanyController.getBatch);
router.get('/ai-lead-intelligence/similar-batches/:id/audit', checkPermission('data_extractor.similar_company.audit'), similarCompanyController.getBatchAudit);
router.post('/ai-lead-intelligence/similar-batches/:id/control', checkPermission('data_extractor.similar_company.batch'), similarCompanyController.controlBatch);
router.post('/ai-lead-intelligence/similar-batches/:id/process', checkPermission('data_extractor.similar_company.batch'), similarCompanyController.processBatch);
router.get('/ai-lead-intelligence/market', checkPermission('data_extractor.market_intelligence.view'), similarCompanyController.listMarket);
router.get('/ai-lead-intelligence/market/:id', checkPermission('data_extractor.market_intelligence.view'), similarCompanyController.getMarketOne);
router.post('/ai-lead-intelligence/market/run', checkPermission('data_extractor.market_intelligence.run'), similarCompanyController.runMarket);

// Phase 13 — Controlled CRM Enrichment / Lead Draft
router.get('/ai-lead-intelligence/crm-enrichment', checkPermission('data_extractor.crm_enrichment.view'), crmEnrichmentController.list);
router.get('/ai-lead-intelligence/crm-enrichment/export', checkPermission('data_extractor.crm_enrichment.export'), crmEnrichmentController.exportApproved);
router.post('/ai-lead-intelligence/crm-enrichment/prepare', checkPermission('data_extractor.crm_enrichment.prepare'), crmEnrichmentController.prepare);
router.post('/ai-lead-intelligence/crm-enrichment/match-sample', checkPermission('data_extractor.crm_enrichment.match'), crmEnrichmentController.matchSample);
router.get('/ai-lead-intelligence/crm-enrichment/batches', checkPermission('data_extractor.crm_enrichment.view'), crmEnrichmentController.listBatches);
router.post('/ai-lead-intelligence/crm-enrichment/batches', checkPermission('data_extractor.crm_enrichment.batch'), crmEnrichmentController.createBatch);
router.get('/ai-lead-intelligence/crm-enrichment/batches/:id', checkPermission('data_extractor.crm_enrichment.view'), crmEnrichmentController.getBatch);
router.get('/ai-lead-intelligence/crm-enrichment/batches/:id/audit', checkPermission('data_extractor.crm_enrichment.audit'), crmEnrichmentController.getBatchAudit);
router.post('/ai-lead-intelligence/crm-enrichment/batches/:id/control', checkPermission('data_extractor.crm_enrichment.batch'), crmEnrichmentController.controlBatch);
router.post('/ai-lead-intelligence/crm-enrichment/batches/:id/process', checkPermission('data_extractor.crm_enrichment.batch'), crmEnrichmentController.processBatch);
router.get('/ai-lead-intelligence/crm-enrichment/transactions/:txId', checkPermission('data_extractor.crm_enrichment.history'), crmEnrichmentController.getTx);
router.post('/ai-lead-intelligence/crm-enrichment/transactions/:txId/rollback', checkPermission('data_extractor.crm_enrichment.rollback'), crmEnrichmentController.rollback);
router.get('/ai-lead-intelligence/crm-enrichment/:id', checkPermission('data_extractor.crm_enrichment.view'), crmEnrichmentController.getOne);
router.get('/ai-lead-intelligence/crm-enrichment/:id/history', checkPermission('data_extractor.crm_enrichment.history'), crmEnrichmentController.history);
router.post('/ai-lead-intelligence/crm-enrichment/:id/review-fields', checkPermission('data_extractor.crm_enrichment.review'), crmEnrichmentController.reviewFields);
router.post('/ai-lead-intelligence/crm-enrichment/:id/preview', checkPermission('data_extractor.crm_enrichment.review'), crmEnrichmentController.preview);
router.post('/ai-lead-intelligence/crm-enrichment/:id/final-approve', checkPermission('data_extractor.crm_enrichment.review'), crmEnrichmentController.finalApprove);
router.post('/ai-lead-intelligence/crm-enrichment/:id/create-lead', checkPermission('data_extractor.crm_enrichment.create_lead'), crmEnrichmentController.createLead);
router.post('/ai-lead-intelligence/crm-enrichment/:id/apply', checkPermission('data_extractor.crm_enrichment.apply'), crmEnrichmentController.applyEnrichment);
router.post('/ai-lead-intelligence/crm-enrichment/:id/reject', checkPermission('data_extractor.crm_enrichment.review'), crmEnrichmentController.rejectOne);
router.post('/ai-lead-intelligence/crm-enrichment/:id/lock', checkPermission('data_extractor.crm_enrichment.lock'), crmEnrichmentController.lockOne);

// Phase 14 — Controlled Sales Assignment / Task / Follow-up Workflow
router.get('/ai-lead-intelligence/sales-workflow', checkPermission('data_extractor.sales_workflow.view'), salesWorkflowController.list);
router.get('/ai-lead-intelligence/sales-workflow/export', checkPermission('data_extractor.sales_workflow.export'), salesWorkflowController.exportApproved);
router.get('/ai-lead-intelligence/sales-workflow/settings', checkPermission('data_extractor.sales_workflow.view'), salesWorkflowController.getSettings);
router.put('/ai-lead-intelligence/sales-workflow/settings', checkPermission('data_extractor.sales_workflow.manage'), salesWorkflowController.saveSettings);
router.post('/ai-lead-intelligence/sales-workflow/prepare', checkPermission('data_extractor.sales_workflow.prepare'), salesWorkflowController.prepare);
router.post('/ai-lead-intelligence/sales-workflow/recommend', checkPermission('data_extractor.sales_workflow.recommend'), salesWorkflowController.recommend);
router.post('/ai-lead-intelligence/sales-workflow/eligibility-sample', checkPermission('data_extractor.sales_workflow.view'), salesWorkflowController.eligibilitySample);
router.get('/ai-lead-intelligence/sales-workflow/batches', checkPermission('data_extractor.sales_workflow.view'), salesWorkflowController.listBatches);
router.post('/ai-lead-intelligence/sales-workflow/batches', checkPermission('data_extractor.sales_workflow.batch_prepare'), salesWorkflowController.createBatch);
router.get('/ai-lead-intelligence/sales-workflow/batches/:id', checkPermission('data_extractor.sales_workflow.view'), salesWorkflowController.getBatch);
router.post('/ai-lead-intelligence/sales-workflow/batches/:id/control', checkPermission('data_extractor.sales_workflow.batch_prepare'), salesWorkflowController.controlBatch);
router.post('/ai-lead-intelligence/sales-workflow/batches/:id/process', checkPermission('data_extractor.sales_workflow.batch_prepare'), salesWorkflowController.processBatch);
router.get('/ai-lead-intelligence/sales-workflow/transactions/:txId', checkPermission('data_extractor.sales_workflow.history'), salesWorkflowController.getTx);
router.post('/ai-lead-intelligence/sales-workflow/transactions/:txId/rollback', checkPermission('data_extractor.sales_workflow.rollback'), salesWorkflowController.rollback);
router.get('/ai-lead-intelligence/sales-workflow/:id', checkPermission('data_extractor.sales_workflow.view'), salesWorkflowController.getOne);
router.get('/ai-lead-intelligence/sales-workflow/:id/history', checkPermission('data_extractor.sales_workflow.history'), salesWorkflowController.history);
router.post('/ai-lead-intelligence/sales-workflow/:id/review', checkPermission('data_extractor.sales_workflow.review'), salesWorkflowController.review);
router.post('/ai-lead-intelligence/sales-workflow/:id/preview', checkPermission('data_extractor.sales_workflow.review'), salesWorkflowController.preview);
router.post('/ai-lead-intelligence/sales-workflow/:id/final-approve', checkPermission('data_extractor.sales_workflow.review'), salesWorkflowController.finalApprove);
router.post('/ai-lead-intelligence/sales-workflow/:id/apply', (req, res, next) => {
    const u = req.user;
    if (
        checkUserPermission(u, 'data_extractor.sales_workflow.assign')
        || checkUserPermission(u, 'data_extractor.sales_workflow.create_task')
        || checkUserPermission(u, 'data_extractor.sales_workflow.create_followup')
    ) return next();
    throw new ApiError(403, 'Permission denied: sales_workflow assign/create_task/create_followup required');
}, salesWorkflowController.apply);
router.post('/ai-lead-intelligence/sales-workflow/:id/reject', checkPermission('data_extractor.sales_workflow.review'), salesWorkflowController.rejectOne);
router.post('/ai-lead-intelligence/sales-workflow/:id/cancel', checkPermission('data_extractor.sales_workflow.review'), salesWorkflowController.cancelOne);
router.post('/ai-lead-intelligence/sales-workflow/:id/lock', checkPermission('data_extractor.sales_workflow.lock'), salesWorkflowController.lockOne);

// Phase 15 — Executive Analytics (read-only)
router.get('/ai-lead-intelligence/analytics/executive', checkPermission('data_extractor.analytics.view'), analyticsController.executive);
router.get('/ai-lead-intelligence/analytics/funnel', checkPermission('data_extractor.analytics.view'), analyticsController.funnel);
router.get('/ai-lead-intelligence/analytics/discovery', checkPermission('data_extractor.analytics.discovery'), analyticsController.discovery);
router.get('/ai-lead-intelligence/analytics/data-quality', checkPermission('data_extractor.analytics.discovery'), analyticsController.dataQuality);
router.get('/ai-lead-intelligence/analytics/lead-scoring', checkPermission('data_extractor.analytics.lead_intelligence'), analyticsController.leadScoring);
router.get('/ai-lead-intelligence/analytics/industry', checkPermission('data_extractor.analytics.lead_intelligence'), analyticsController.industry);
router.get('/ai-lead-intelligence/analytics/product', checkPermission('data_extractor.analytics.product'), analyticsController.product);
router.get('/ai-lead-intelligence/analytics/contact', checkPermission('data_extractor.analytics.contact'), analyticsController.contact);
router.get('/ai-lead-intelligence/analytics/company-intelligence', checkPermission('data_extractor.analytics.lead_intelligence'), analyticsController.companyIntelligence);
router.get('/ai-lead-intelligence/analytics/market', checkPermission('data_extractor.analytics.market'), analyticsController.market);
router.get('/ai-lead-intelligence/analytics/crm-enrichment', checkPermission('data_extractor.analytics.crm_conversion'), analyticsController.crmEnrichment);
router.get('/ai-lead-intelligence/analytics/sales-workflow', checkPermission('data_extractor.analytics.sales_workflow'), analyticsController.salesWorkflow);
router.get('/ai-lead-intelligence/analytics/batches', checkPermission('data_extractor.analytics.batch_monitor'), analyticsController.batches);
router.get('/ai-lead-intelligence/analytics/user-activity', checkPermission('data_extractor.analytics.user_activity'), analyticsController.userActivity);
router.post('/ai-lead-intelligence/analytics/refresh', checkPermission('data_extractor.analytics.refresh'), analyticsController.refresh);
router.get('/ai-lead-intelligence/analytics/export', checkPermission('data_extractor.analytics.export'), analyticsController.exportAnalytics);
router.get('/ai-lead-intelligence/analytics/saved-views', checkPermission('data_extractor.analytics.saved_views'), analyticsController.listViews);
router.post('/ai-lead-intelligence/analytics/saved-views', checkPermission('data_extractor.analytics.saved_views'), analyticsController.createView);
router.put('/ai-lead-intelligence/analytics/saved-views/:id', checkPermission('data_extractor.analytics.saved_views'), analyticsController.updateView);
router.delete('/ai-lead-intelligence/analytics/saved-views/:id', checkPermission('data_extractor.analytics.saved_views'), analyticsController.deleteView);
router.get('/ai-lead-intelligence/analytics/settings', checkPermission('data_extractor.analytics.view'), analyticsController.getSettings);
router.put('/ai-lead-intelligence/analytics/settings', checkPermission('data_extractor.analytics.manage'), analyticsController.saveSettings);

// Phase 16 — Marketing Intelligence (draft-only; NO send/execute)
const mi = '/ai-lead-intelligence/marketing-intelligence';
router.get(`${mi}/campaigns`, checkPermission('data_extractor.marketing_intelligence.view'), marketingIntelligenceController.list);
router.post(`${mi}/campaigns`, checkPermission('data_extractor.marketing_intelligence.create'), marketingIntelligenceController.create);
router.get(`${mi}/campaigns/:id`, checkPermission('data_extractor.marketing_intelligence.view'), marketingIntelligenceController.getOne);
router.put(`${mi}/campaigns/:id`, checkPermission('data_extractor.marketing_intelligence.create'), marketingIntelligenceController.update);
router.post(`${mi}/campaigns/:id/build-audience`, checkPermission('data_extractor.marketing_intelligence.build_audience'), marketingIntelligenceController.buildAudienceHandler);
router.get(`${mi}/campaigns/:id/audience-preview`, checkPermission('data_extractor.marketing_intelligence.view'), marketingIntelligenceController.audiencePreviewHandler);
router.get(`${mi}/campaigns/:id/recipients`, checkPermission('data_extractor.marketing_intelligence.view'), marketingIntelligenceController.recipients);
router.post(`${mi}/campaigns/:id/recipients/review`, checkPermission('data_extractor.marketing_intelligence.review_recipients'), marketingIntelligenceController.reviewRecipientsHandler);
router.post(`${mi}/campaigns/:id/deduplicate`, checkPermission('data_extractor.marketing_intelligence.review_duplicates'), marketingIntelligenceController.deduplicateHandler);
router.post(`${mi}/campaigns/:id/validate-optout`, checkPermission('data_extractor.marketing_intelligence.review_optout'), marketingIntelligenceController.validateOptoutHandler);
router.post(`${mi}/campaigns/:id/check-frequency`, checkPermission('data_extractor.marketing_intelligence.review_recipients'), marketingIntelligenceController.checkFrequencyHandler);
router.post(`${mi}/campaigns/:id/recommend-content`, checkPermission('data_extractor.marketing_intelligence.generate_message'), marketingIntelligenceController.recommendContentHandler);
router.post(`${mi}/campaigns/:id/generate-message`, checkPermission('data_extractor.marketing_intelligence.generate_message'), marketingIntelligenceController.generateMessageHandler);
router.put(`${mi}/campaigns/:id/message`, checkPermission('data_extractor.marketing_intelligence.edit_message'), marketingIntelligenceController.updateMessageHandler);
router.post(`${mi}/campaigns/:id/review`, checkPermission('data_extractor.marketing_intelligence.approve_audience'), marketingIntelligenceController.reviewHandler);
router.post(`${mi}/campaigns/:id/final-approve`, checkPermission('data_extractor.marketing_intelligence.approve_handoff'), marketingIntelligenceController.finalApproveHandler);
router.post(`${mi}/campaigns/:id/prepare-handoff`, checkPermission('data_extractor.marketing_intelligence.prepare_handoff'), marketingIntelligenceController.prepareHandoffHandler);
router.post(`${mi}/campaigns/:id/lock`, checkPermission('data_extractor.marketing_intelligence.lock'), marketingIntelligenceController.lockHandler);
router.post(`${mi}/campaigns/:id/cancel`, checkPermission('data_extractor.marketing_intelligence.create'), marketingIntelligenceController.cancelHandler);
router.get(`${mi}/campaigns/:id/history`, checkPermission('data_extractor.marketing_intelligence.history'), marketingIntelligenceController.historyHandler);
router.get(`${mi}/campaigns/:id/export`, checkPermission('data_extractor.marketing_intelligence.export'), marketingIntelligenceController.exportHandler);
router.get(`${mi}/batches`, checkPermission('data_extractor.marketing_intelligence.batch'), marketingIntelligenceController.listBatchesHandler);
router.post(`${mi}/batches`, checkPermission('data_extractor.marketing_intelligence.batch'), marketingIntelligenceController.createBatchHandler);
router.get(`${mi}/batches/:id`, checkPermission('data_extractor.marketing_intelligence.batch'), marketingIntelligenceController.getBatchHandler);
router.post(`${mi}/batches/:id/pause`, checkPermission('data_extractor.marketing_intelligence.batch'), marketingIntelligenceController.pauseBatchHandler);
router.post(`${mi}/batches/:id/resume`, checkPermission('data_extractor.marketing_intelligence.batch'), marketingIntelligenceController.resumeBatchHandler);
router.post(`${mi}/batches/:id/stop`, checkPermission('data_extractor.marketing_intelligence.batch'), marketingIntelligenceController.stopBatchHandler);
router.post(`${mi}/batches/:id/retry-failed`, checkPermission('data_extractor.marketing_intelligence.batch'), marketingIntelligenceController.retryBatchHandler);
router.post(`${mi}/batches/:id/process`, checkPermission('data_extractor.marketing_intelligence.batch'), marketingIntelligenceController.processBatchHandler);
router.get(`${mi}/settings`, checkPermission('data_extractor.marketing_intelligence.view'), marketingIntelligenceController.getSettingsHandler);
router.put(`${mi}/settings`, checkPermission('data_extractor.marketing_intelligence.manage'), marketingIntelligenceController.saveSettingsHandler);

// Phase 17 — AI Sales Assistant (read-only; no write/execute/send)
const sa = '/ai-lead-intelligence/sales-assistant';
router.get(`${sa}/sessions`, checkPermission('data_extractor.ai_sales_assistant.view'), salesAssistantController.listSessionsHandler);
router.post(`${sa}/sessions`, checkPermission('data_extractor.ai_sales_assistant.ask'), salesAssistantController.createSessionHandler);
router.get(`${sa}/sessions/:id`, checkPermission('data_extractor.ai_sales_assistant.view'), salesAssistantController.getSessionHandler);
router.put(`${sa}/sessions/:id`, checkPermission('data_extractor.ai_sales_assistant.ask'), salesAssistantController.updateSessionHandler);
router.delete(`${sa}/sessions/:id`, checkPermission('data_extractor.ai_sales_assistant.ask'), salesAssistantController.deleteSessionHandler);
router.post(`${sa}/sessions/:id/ask`, checkPermission('data_extractor.ai_sales_assistant.ask'), salesAssistantController.askHandler);
router.get(`${sa}/sessions/:id/messages`, checkPermission('data_extractor.ai_sales_assistant.view'), salesAssistantController.messagesHandler);
router.post(`${sa}/sessions/:id/archive`, checkPermission('data_extractor.ai_sales_assistant.ask'), salesAssistantController.archiveSessionHandler);
router.post(`${sa}/sessions/:id/clear-context`, checkPermission('data_extractor.ai_sales_assistant.ask'), salesAssistantController.clearContextHandler);
router.get(`${sa}/sessions/:id/export`, checkPermission('data_extractor.ai_sales_assistant.export'), salesAssistantController.exportSessionHandler);
router.get(`${sa}/saved-prompts`, checkPermission('data_extractor.ai_sales_assistant.saved_prompts'), salesAssistantController.listPromptsHandler);
router.post(`${sa}/saved-prompts`, checkPermission('data_extractor.ai_sales_assistant.saved_prompts'), salesAssistantController.createPromptHandler);
router.put(`${sa}/saved-prompts/:id`, checkPermission('data_extractor.ai_sales_assistant.saved_prompts'), salesAssistantController.updatePromptHandler);
router.delete(`${sa}/saved-prompts/:id`, checkPermission('data_extractor.ai_sales_assistant.saved_prompts'), salesAssistantController.deletePromptHandler);
router.post(`${sa}/saved-prompts/:id/run`, checkPermission('data_extractor.ai_sales_assistant.ask'), salesAssistantController.runPromptHandler);
router.get(`${sa}/tools`, checkPermission('data_extractor.ai_sales_assistant.ask'), salesAssistantController.toolsHandler);
router.get(`${sa}/settings`, checkPermission('data_extractor.ai_sales_assistant.view'), salesAssistantController.getSettingsHandler);
router.put(`${sa}/settings`, checkPermission('data_extractor.ai_sales_assistant.manage'), salesAssistantController.saveSettingsHandler);
router.get(`${sa}/audit`, checkPermission('data_extractor.ai_sales_assistant.audit'), salesAssistantController.auditHandler);
router.post(`${sa}/validate-query-plan`, checkPermission('data_extractor.ai_sales_assistant.ask'), salesAssistantController.validatePlanHandler);

// Phase 18 — Business Knowledge Graph (read-oriented; discovery writes KG-only, never CRM)
const kg = '/ai-lead-intelligence/knowledge-graph';
router.get(`${kg}/search`, checkPermission('data_extractor.knowledge_graph.search'), knowledgeGraphController.searchHandler);
router.post(`${kg}/search`, checkPermission('data_extractor.knowledge_graph.search'), knowledgeGraphController.searchHandler);
router.get(`${kg}/node/:id`, checkPermission('data_extractor.knowledge_graph.view'), knowledgeGraphController.getNodeHandler);
router.get(`${kg}/node`, checkPermission('data_extractor.knowledge_graph.view'), knowledgeGraphController.getNodeHandler);
router.get(`${kg}/relationships`, checkPermission('data_extractor.knowledge_graph.relationships'), knowledgeGraphController.relationshipsHandler);
router.get(`${kg}/similar`, checkPermission('data_extractor.knowledge_graph.search'), knowledgeGraphController.similarHandler);
router.get(`${kg}/explain/:id`, checkPermission('data_extractor.knowledge_graph.relationships'), knowledgeGraphController.explainHandler);
router.get(`${kg}/explain`, checkPermission('data_extractor.knowledge_graph.relationships'), knowledgeGraphController.explainHandler);
router.get(`${kg}/graph`, checkPermission('data_extractor.knowledge_graph.view'), knowledgeGraphController.graphHandler);
router.get(`${kg}/history`, checkPermission('data_extractor.knowledge_graph.view'), knowledgeGraphController.historyHandler);
router.get(`${kg}/export`, checkPermission('data_extractor.knowledge_graph.export'), knowledgeGraphController.exportHandler);
router.get(`${kg}/analytics`, checkPermission('data_extractor.knowledge_graph.analytics'), knowledgeGraphController.analyticsHandler);
router.post(`${kg}/discover`, checkPermission('data_extractor.knowledge_graph.manage'), knowledgeGraphController.discoverHandler);
router.get(`${kg}/settings`, checkPermission('data_extractor.knowledge_graph.view'), knowledgeGraphController.getSettingsHandler);
router.put(`${kg}/settings`, checkPermission('data_extractor.knowledge_graph.manage'), knowledgeGraphController.saveSettingsHandler);
router.get(`${kg}/saved-views`, checkPermission('data_extractor.knowledge_graph.view'), knowledgeGraphController.listViewsHandler);
router.post(`${kg}/saved-views`, checkPermission('data_extractor.knowledge_graph.view'), knowledgeGraphController.saveViewHandler);

// Phase 19 — Learning Intelligence (feedback / analytics / draft proposals only; never auto-apply)
const li = '/ai-lead-intelligence/learning-intelligence';
router.get(`${li}/feedback`, checkPermission('data_extractor.ai_learning.view'), learningIntelligenceController.listFeedbackHandler);
router.post(`${li}/feedback`, checkPermission('data_extractor.ai_learning.submit_feedback'), learningIntelligenceController.submitFeedbackHandler);
router.get(`${li}/feedback/:id`, checkPermission('data_extractor.ai_learning.view'), learningIntelligenceController.getFeedbackHandler);
router.put(`${li}/feedback/:id`, checkPermission('data_extractor.ai_learning.submit_feedback'), learningIntelligenceController.reviseFeedbackHandler);
router.post(`${li}/feedback/:id/validate`, checkPermission('data_extractor.ai_learning.review_feedback'), learningIntelligenceController.validateFeedbackHandler);
router.post(`${li}/feedback/:id/review`, checkPermission('data_extractor.ai_learning.review_feedback'), learningIntelligenceController.reviewFeedbackHandler);
router.post(`${li}/feedback/:id/archive`, checkPermission('data_extractor.ai_learning.review_feedback'), learningIntelligenceController.archiveFeedbackHandler);
router.get(`${li}/feedback/:id/history`, checkPermission('data_extractor.ai_learning.view'), learningIntelligenceController.feedbackHistoryHandler);
router.get(`${li}/review-queue`, checkPermission('data_extractor.ai_learning.review_queue'), learningIntelligenceController.reviewQueueHandler);
router.get(`${li}/conflicts`, checkPermission('data_extractor.ai_learning.review_feedback'), learningIntelligenceController.conflictsHandler);
router.post(`${li}/conflicts/:id/resolve`, checkPermission('data_extractor.ai_learning.resolve_conflict'), learningIntelligenceController.resolveConflictHandler);
router.get(`${li}/analytics`, checkPermission('data_extractor.ai_learning.analytics'), learningIntelligenceController.analyticsHandler);
router.get(`${li}/analytics/modules`, checkPermission('data_extractor.ai_learning.analytics'), learningIntelligenceController.moduleAnalyticsHandler);
router.get(`${li}/analytics/reviewers`, checkPermission('data_extractor.ai_learning.analytics'), learningIntelligenceController.reviewerAnalyticsHandler);
router.get(`${li}/analytics/trends`, checkPermission('data_extractor.ai_learning.analytics'), learningIntelligenceController.trendsHandler);
router.get(`${li}/proposals`, checkPermission('data_extractor.ai_learning.view'), learningIntelligenceController.listProposalsHandler);
router.post(`${li}/proposals/generate`, checkPermission('data_extractor.ai_learning.generate_proposal'), learningIntelligenceController.generateProposalsHandler);
router.get(`${li}/proposals/:id`, checkPermission('data_extractor.ai_learning.view'), learningIntelligenceController.getProposalHandler);
router.put(`${li}/proposals/:id`, checkPermission('data_extractor.ai_learning.review_proposal'), learningIntelligenceController.updateProposalHandler);
router.post(`${li}/proposals/:id/review`, checkPermission('data_extractor.ai_learning.review_proposal'), learningIntelligenceController.reviewProposalHandler);
router.post(`${li}/proposals/:id/archive`, checkPermission('data_extractor.ai_learning.review_proposal'), learningIntelligenceController.archiveProposalHandler);
router.get(`${li}/datasets`, checkPermission('data_extractor.ai_learning.dataset'), learningIntelligenceController.listDatasetsHandler);
router.post(`${li}/datasets/prepare`, checkPermission('data_extractor.ai_learning.dataset'), learningIntelligenceController.prepareDatasetHandler);
router.get(`${li}/datasets/:id`, checkPermission('data_extractor.ai_learning.dataset'), learningIntelligenceController.getDatasetHandler);
router.get(`${li}/datasets/:id/export`, checkPermission('data_extractor.ai_learning.export'), learningIntelligenceController.exportDatasetHandler);
router.post(`${li}/datasets/:id/archive`, checkPermission('data_extractor.ai_learning.dataset'), learningIntelligenceController.archiveDatasetHandler);
router.get(`${li}/saved-views`, checkPermission('data_extractor.ai_learning.saved_views'), learningIntelligenceController.listViewsHandler);
router.post(`${li}/saved-views`, checkPermission('data_extractor.ai_learning.saved_views'), learningIntelligenceController.createViewHandler);
router.put(`${li}/saved-views/:id`, checkPermission('data_extractor.ai_learning.saved_views'), learningIntelligenceController.updateViewHandler);
router.delete(`${li}/saved-views/:id`, checkPermission('data_extractor.ai_learning.saved_views'), learningIntelligenceController.deleteViewHandler);
router.get(`${li}/settings`, checkPermission('data_extractor.ai_learning.view'), learningIntelligenceController.getSettingsHandler);
router.put(`${li}/settings`, checkPermission('data_extractor.ai_learning.settings'), learningIntelligenceController.saveSettingsHandler);
router.get(`${li}/audit`, checkPermission('data_extractor.ai_learning.audit'), learningIntelligenceController.auditHandler);
router.get(`${li}/export`, checkPermission('data_extractor.ai_learning.export'), learningIntelligenceController.exportHandler);

// Phase 20 — Improvement Approval Center (non-executable; approval = implementation-spec only)
const ia = '/ai-lead-intelligence/improvement-approval';
router.get(`${ia}/cases`, checkPermission('data_extractor.improvement_approval.view'), improvementApprovalController.listCasesHandler);
router.post(`${ia}/cases`, checkPermission('data_extractor.improvement_approval.submit'), improvementApprovalController.createCaseHandler);
router.get(`${ia}/cases/:id`, checkPermission('data_extractor.improvement_approval.view'), improvementApprovalController.getCaseHandler);
router.post(`${ia}/cases/:id/submit`, checkPermission('data_extractor.improvement_approval.submit'), improvementApprovalController.submitCaseHandler);
router.post(`${ia}/cases/:id/request-evidence`, checkPermission('data_extractor.improvement_approval.request_evidence'), improvementApprovalController.requestEvidenceHandler);
router.post(`${ia}/cases/:id/review`, checkPermission('data_extractor.improvement_approval.view'), improvementApprovalController.reviewCaseHandler);
router.post(`${ia}/cases/:id/final-decision`, checkPermission('data_extractor.improvement_approval.view'), improvementApprovalController.finalDecisionHandler);
router.post(`${ia}/cases/:id/archive`, checkPermission('data_extractor.improvement_approval.manage'), improvementApprovalController.archiveCaseHandler);
router.get(`${ia}/cases/:id/history`, checkPermission('data_extractor.improvement_approval.view'), improvementApprovalController.caseHistoryHandler);
router.get(`${ia}/reviews`, checkPermission('data_extractor.improvement_approval.view'), improvementApprovalController.listReviewsHandler);
router.get(`${ia}/reviews/:id`, checkPermission('data_extractor.improvement_approval.view'), improvementApprovalController.getReviewHandler);
router.get(`${ia}/specifications`, checkPermission('data_extractor.improvement_approval.view'), improvementApprovalController.listSpecsHandler);
router.post(`${ia}/cases/:id/generate-specification`, checkPermission('data_extractor.improvement_approval.generate_spec'), improvementApprovalController.generateSpecHandler);
router.get(`${ia}/specifications/:id`, checkPermission('data_extractor.improvement_approval.view'), improvementApprovalController.getSpecHandler);
router.put(`${ia}/specifications/:id`, checkPermission('data_extractor.improvement_approval.generate_spec'), improvementApprovalController.updateSpecHandler);
router.post(`${ia}/specifications/:id/finalize`, checkPermission('data_extractor.improvement_approval.generate_spec'), improvementApprovalController.finalizeSpecHandler);
router.post(`${ia}/specifications/:id/archive`, checkPermission('data_extractor.improvement_approval.manage'), improvementApprovalController.archiveSpecHandler);
router.get(`${ia}/specifications/:id/export`, checkPermission('data_extractor.improvement_approval.export'), improvementApprovalController.exportSpecHandler);
router.get(`${ia}/specifications/:id/history`, checkPermission('data_extractor.improvement_approval.view'), improvementApprovalController.specHistoryHandler);
router.get(`${ia}/policies`, checkPermission('data_extractor.improvement_approval.view'), improvementApprovalController.getPolicyHandler);
router.put(`${ia}/policies`, checkPermission('data_extractor.improvement_approval.settings'), improvementApprovalController.savePolicyHandler);
router.get(`${ia}/saved-views`, checkPermission('data_extractor.improvement_approval.saved_views'), improvementApprovalController.listViewsHandler);
router.post(`${ia}/saved-views`, checkPermission('data_extractor.improvement_approval.saved_views'), improvementApprovalController.createViewHandler);
router.put(`${ia}/saved-views/:id`, checkPermission('data_extractor.improvement_approval.saved_views'), improvementApprovalController.updateViewHandler);
router.delete(`${ia}/saved-views/:id`, checkPermission('data_extractor.improvement_approval.saved_views'), improvementApprovalController.deleteViewHandler);
router.get(`${ia}/audit`, checkPermission('data_extractor.improvement_approval.audit'), improvementApprovalController.auditHandler);
router.get(`${ia}/export`, checkPermission('data_extractor.improvement_approval.export'), improvementApprovalController.exportHandler);
router.get(`${ia}/eligibility`, checkPermission('data_extractor.improvement_approval.view'), improvementApprovalController.eligibilityHandler);

// ---- Phase 21 — Intelligence Configuration and Rule Version Manager (versions only; no runtime activation) ----
const cm = '/ai-lead-intelligence/configuration-manager';
router.get(`${cm}/families`, checkPermission('data_extractor.configuration_manager.view'), configurationManagerController.listFamiliesHandler);
router.post(`${cm}/families`, checkPermission('data_extractor.configuration_manager.manage'), configurationManagerController.createFamilyHandler);
router.get(`${cm}/families/:id`, checkPermission('data_extractor.configuration_manager.view'), configurationManagerController.getFamilyHandler);
router.put(`${cm}/families/:id`, checkPermission('data_extractor.configuration_manager.manage'), configurationManagerController.updateFamilyHandler);
router.get(`${cm}/versions`, checkPermission('data_extractor.configuration_manager.view'), configurationManagerController.listVersionsHandler);
router.post(`${cm}/versions`, checkPermission('data_extractor.configuration_manager.create_draft'), configurationManagerController.createVersionHandler);
router.get(`${cm}/versions/:id`, checkPermission('data_extractor.configuration_manager.view'), configurationManagerController.getVersionHandler);
router.put(`${cm}/versions/:id`, checkPermission('data_extractor.configuration_manager.edit_draft'), configurationManagerController.updateVersionHandler);
router.post(`${cm}/versions/:id/clone`, checkPermission('data_extractor.configuration_manager.clone'), configurationManagerController.cloneVersionHandler);
router.post(`${cm}/versions/:id/validate`, checkPermission('data_extractor.configuration_manager.validate'), configurationManagerController.validateVersionHandler);
router.post(`${cm}/versions/:id/review`, checkPermission('data_extractor.configuration_manager.review'), configurationManagerController.reviewVersionHandler);
router.post(`${cm}/versions/:id/ready-for-sandbox`, checkPermission('data_extractor.configuration_manager.ready_for_sandbox'), configurationManagerController.readyForSandboxHandler);
router.post(`${cm}/versions/:id/archive`, checkPermission('data_extractor.configuration_manager.manage'), configurationManagerController.archiveVersionHandler);
router.get(`${cm}/versions/:id/history`, checkPermission('data_extractor.configuration_manager.view'), configurationManagerController.versionHistoryHandler);
router.get(`${cm}/versions/:id/compare/:otherVersionId`, checkPermission('data_extractor.configuration_manager.compare'), configurationManagerController.compareVersionsHandler);
router.get(`${cm}/versions/:id/dependencies`, checkPermission('data_extractor.configuration_manager.dependencies'), configurationManagerController.versionDependenciesHandler);
router.get(`${cm}/versions/:id/compatibility`, checkPermission('data_extractor.configuration_manager.compatibility'), configurationManagerController.versionCompatibilityHandler);
router.get(`${cm}/versions/:id/impact-preview`, checkPermission('data_extractor.configuration_manager.view'), configurationManagerController.impactPreviewHandler);
router.put(`${cm}/versions/:id/rollback-target`, checkPermission('data_extractor.configuration_manager.review'), configurationManagerController.rollbackTargetHandler);
router.get(`${cm}/versions/:id/export`, checkPermission('data_extractor.configuration_manager.export'), configurationManagerController.exportVersionHandler);
router.get(`${cm}/settings`, checkPermission('data_extractor.configuration_manager.view'), configurationManagerController.getSettingsHandler);
router.put(`${cm}/settings`, checkPermission('data_extractor.configuration_manager.settings'), configurationManagerController.saveSettingsHandler);
router.get(`${cm}/saved-views`, checkPermission('data_extractor.configuration_manager.saved_views'), configurationManagerController.listViewsHandler);
router.post(`${cm}/saved-views`, checkPermission('data_extractor.configuration_manager.saved_views'), configurationManagerController.createViewHandler);
router.put(`${cm}/saved-views/:id`, checkPermission('data_extractor.configuration_manager.saved_views'), configurationManagerController.updateViewHandler);
router.delete(`${cm}/saved-views/:id`, checkPermission('data_extractor.configuration_manager.saved_views'), configurationManagerController.deleteViewHandler);
router.get(`${cm}/audit`, checkPermission('data_extractor.configuration_manager.audit'), configurationManagerController.auditHandler);

// ---- Phase 22 — Sandbox Evaluation / Historical Simulation / A/B (non-mutating; no activation) ----
const sb = '/ai-lead-intelligence/sandbox-evaluation';
router.get(`${sb}/runs`, checkPermission('data_extractor.sandbox_evaluation.view'), sandboxEvaluationController.listRunsHandler);
router.post(`${sb}/runs`, checkPermission('data_extractor.sandbox_evaluation.create'), sandboxEvaluationController.createRunHandler);
router.get(`${sb}/runs/:id`, checkPermission('data_extractor.sandbox_evaluation.view'), sandboxEvaluationController.getRunHandler);
router.post(`${sb}/runs/:id/validate`, checkPermission('data_extractor.sandbox_evaluation.validate'), sandboxEvaluationController.validateRunHandler);
router.post(`${sb}/runs/:id/start`, checkPermission('data_extractor.sandbox_evaluation.run'), sandboxEvaluationController.startRunHandler);
router.post(`${sb}/runs/:id/cancel`, checkPermission('data_extractor.sandbox_evaluation.cancel'), sandboxEvaluationController.cancelRunHandler);
router.post(`${sb}/runs/:id/archive`, checkPermission('data_extractor.sandbox_evaluation.manage'), sandboxEvaluationController.archiveRunHandler);
router.get(`${sb}/runs/:id/status`, checkPermission('data_extractor.sandbox_evaluation.view'), sandboxEvaluationController.statusHandler);
router.get(`${sb}/runs/:id/results`, checkPermission('data_extractor.sandbox_evaluation.view_results'), sandboxEvaluationController.resultsHandler);
router.get(`${sb}/runs/:id/results/:resultId`, checkPermission('data_extractor.sandbox_evaluation.view_row_detail'), sandboxEvaluationController.resultDetailHandler);
router.get(`${sb}/runs/:id/metrics`, checkPermission('data_extractor.sandbox_evaluation.view_results'), sandboxEvaluationController.metricsHandler);
router.get(`${sb}/runs/:id/issues`, checkPermission('data_extractor.sandbox_evaluation.view'), sandboxEvaluationController.issuesHandler);
router.get(`${sb}/runs/:id/recommendation`, checkPermission('data_extractor.sandbox_evaluation.view'), sandboxEvaluationController.recommendationHandler);
router.get(`${sb}/runs/:id/compare`, checkPermission('data_extractor.sandbox_evaluation.compare'), sandboxEvaluationController.compareHandler);
router.get(`${sb}/runs/:id/export`, checkPermission('data_extractor.sandbox_evaluation.export'), sandboxEvaluationController.exportHandler);
router.get(`${sb}/settings`, checkPermission('data_extractor.sandbox_evaluation.view'), sandboxEvaluationController.getSettingsHandler);
router.put(`${sb}/settings`, checkPermission('data_extractor.sandbox_evaluation.settings'), sandboxEvaluationController.saveSettingsHandler);
router.get(`${sb}/saved-views`, checkPermission('data_extractor.sandbox_evaluation.saved_views'), sandboxEvaluationController.listViewsHandler);
router.post(`${sb}/saved-views`, checkPermission('data_extractor.sandbox_evaluation.saved_views'), sandboxEvaluationController.createViewHandler);
router.put(`${sb}/saved-views/:id`, checkPermission('data_extractor.sandbox_evaluation.saved_views'), sandboxEvaluationController.updateViewHandler);
router.delete(`${sb}/saved-views/:id`, checkPermission('data_extractor.sandbox_evaluation.saved_views'), sandboxEvaluationController.deleteViewHandler);
router.get(`${sb}/audit`, checkPermission('data_extractor.sandbox_evaluation.audit'), sandboxEvaluationController.auditHandler);

// ---- Phase 23 — Release Management / Controlled Rollout Center (plans only; no deployment) ----
const rm = '/ai-lead-intelligence/release-manager';
router.get(`${rm}/environments`, checkPermission('data_extractor.release_manager.view'), releaseManagerController.listEnvironmentsHandler);
router.post(`${rm}/environments`, checkPermission('data_extractor.release_manager.manage'), releaseManagerController.createEnvironmentHandler);
router.get(`${rm}/environments/:id`, checkPermission('data_extractor.release_manager.view'), releaseManagerController.getEnvironmentHandler);
router.put(`${rm}/environments/:id`, checkPermission('data_extractor.release_manager.manage'), releaseManagerController.updateEnvironmentHandler);
router.post(`${rm}/environments/:id/archive`, checkPermission('data_extractor.release_manager.manage'), releaseManagerController.archiveEnvironmentHandler);
router.get(`${rm}/releases`, checkPermission('data_extractor.release_manager.view'), releaseManagerController.listReleasesHandler);
router.post(`${rm}/releases`, checkPermission('data_extractor.release_manager.create'), releaseManagerController.createReleaseHandler);
router.get(`${rm}/releases/:id`, checkPermission('data_extractor.release_manager.view'), releaseManagerController.getReleaseHandler);
router.put(`${rm}/releases/:id`, checkPermission('data_extractor.release_manager.edit_draft'), releaseManagerController.updateReleaseHandler);
router.post(`${rm}/releases/:id/clone`, checkPermission('data_extractor.release_manager.create'), releaseManagerController.cloneReleaseHandler);
router.post(`${rm}/releases/:id/validate`, checkPermission('data_extractor.release_manager.validate'), releaseManagerController.validateReleaseHandler);
router.post(`${rm}/releases/:id/simulate`, checkPermission('data_extractor.release_manager.simulate'), releaseManagerController.simulateReleaseHandler);
router.post(`${rm}/releases/:id/submit-review`, checkPermission('data_extractor.release_manager.review'), releaseManagerController.submitReviewHandler);
router.post(`${rm}/releases/:id/review`, checkPermission('data_extractor.release_manager.review'), releaseManagerController.reviewReleaseHandler);
router.post(`${rm}/releases/:id/finalize-package`, checkPermission('data_extractor.release_manager.manage'), releaseManagerController.finalizePackageHandler);
router.post(`${rm}/releases/:id/archive`, checkPermission('data_extractor.release_manager.manage'), releaseManagerController.archiveReleaseHandler);
router.get(`${rm}/releases/:id/history`, checkPermission('data_extractor.release_manager.view'), releaseManagerController.historyHandler);
router.get(`${rm}/releases/:id/compare/:otherReleaseId`, checkPermission('data_extractor.release_manager.view'), releaseManagerController.compareHandler);
router.get(`${rm}/releases/:id/export`, checkPermission('data_extractor.release_manager.export'), releaseManagerController.exportHandler);
router.get(`${rm}/releases/:id/manifest`, checkPermission('data_extractor.release_manager.view'), releaseManagerController.getManifestHandler);
router.put(`${rm}/releases/:id/manifest`, checkPermission('data_extractor.release_manager.edit_draft'), releaseManagerController.putManifestHandler);
router.get(`${rm}/releases/:id/company-rollout`, checkPermission('data_extractor.release_manager.view'), releaseManagerController.getCompanyRolloutHandler);
router.put(`${rm}/releases/:id/company-rollout`, checkPermission('data_extractor.release_manager.edit_draft'), releaseManagerController.putCompanyRolloutHandler);
router.get(`${rm}/releases/:id/industry-rollout`, checkPermission('data_extractor.release_manager.view'), releaseManagerController.getIndustryRolloutHandler);
router.put(`${rm}/releases/:id/industry-rollout`, checkPermission('data_extractor.release_manager.edit_draft'), releaseManagerController.putIndustryRolloutHandler);
router.get(`${rm}/releases/:id/feature-flags`, checkPermission('data_extractor.release_manager.feature_flags'), releaseManagerController.getFeatureFlagsHandler);
router.put(`${rm}/releases/:id/feature-flags`, checkPermission('data_extractor.release_manager.feature_flags'), releaseManagerController.putFeatureFlagsHandler);
router.get(`${rm}/releases/:id/backup-plan`, checkPermission('data_extractor.release_manager.backup_plan'), releaseManagerController.getBackupPlanHandler);
router.put(`${rm}/releases/:id/backup-plan`, checkPermission('data_extractor.release_manager.backup_plan'), releaseManagerController.putBackupPlanHandler);
router.get(`${rm}/releases/:id/rollback-plan`, checkPermission('data_extractor.release_manager.rollback_plan'), releaseManagerController.getRollbackPlanHandler);
router.put(`${rm}/releases/:id/rollback-plan`, checkPermission('data_extractor.release_manager.rollback_plan'), releaseManagerController.putRollbackPlanHandler);
router.get(`${rm}/releases/:id/migration-plan`, checkPermission('data_extractor.release_manager.migration_plan'), releaseManagerController.getMigrationPlanHandler);
router.put(`${rm}/releases/:id/migration-plan`, checkPermission('data_extractor.release_manager.migration_plan'), releaseManagerController.putMigrationPlanHandler);
router.get(`${rm}/releases/:id/health-check-plan`, checkPermission('data_extractor.release_manager.view'), releaseManagerController.getHealthCheckPlanHandler);
router.put(`${rm}/releases/:id/health-check-plan`, checkPermission('data_extractor.release_manager.edit_draft'), releaseManagerController.putHealthCheckPlanHandler);
router.get(`${rm}/releases/:id/smoke-test-plan`, checkPermission('data_extractor.release_manager.view'), releaseManagerController.getSmokeTestPlanHandler);
router.put(`${rm}/releases/:id/smoke-test-plan`, checkPermission('data_extractor.release_manager.edit_draft'), releaseManagerController.putSmokeTestPlanHandler);
router.get(`${rm}/releases/:id/monitoring-plan`, checkPermission('data_extractor.release_manager.view'), releaseManagerController.getMonitoringPlanHandler);
router.put(`${rm}/releases/:id/monitoring-plan`, checkPermission('data_extractor.release_manager.edit_draft'), releaseManagerController.putMonitoringPlanHandler);
router.get(`${rm}/settings`, checkPermission('data_extractor.release_manager.view'), releaseManagerController.getSettingsHandler);
router.put(`${rm}/settings`, checkPermission('data_extractor.release_manager.settings'), releaseManagerController.saveSettingsHandler);
router.get(`${rm}/saved-views`, checkPermission('data_extractor.release_manager.saved_views'), releaseManagerController.listViewsHandler);
router.post(`${rm}/saved-views`, checkPermission('data_extractor.release_manager.saved_views'), releaseManagerController.createViewHandler);
router.put(`${rm}/saved-views/:id`, checkPermission('data_extractor.release_manager.saved_views'), releaseManagerController.updateViewHandler);
router.delete(`${rm}/saved-views/:id`, checkPermission('data_extractor.release_manager.saved_views'), releaseManagerController.deleteViewHandler);
router.get(`${rm}/audit`, checkPermission('data_extractor.release_manager.audit'), releaseManagerController.auditHandler);

const rc = '/ai-lead-intelligence/readiness-certification';
router.get(`${rc}/certifications`, checkPermission('data_extractor.readiness_certification.view'), readinessCertificationController.listCertificationsHandler);
router.post(`${rc}/certifications`, checkPermission('data_extractor.readiness_certification.create'), readinessCertificationController.createCertificationHandler);
router.get(`${rc}/certifications/:id`, checkPermission('data_extractor.readiness_certification.view'), readinessCertificationController.getCertificationHandler);
router.put(`${rc}/certifications/:id`, checkPermission('data_extractor.readiness_certification.define_scope'), readinessCertificationController.updateCertificationHandler);
router.post(`${rc}/certifications/:id/define-scope`, checkPermission('data_extractor.readiness_certification.define_scope'), readinessCertificationController.defineScopeHandler);
router.post(`${rc}/certifications/:id/validate-release`, checkPermission('data_extractor.readiness_certification.run_local_checks'), readinessCertificationController.validateReleaseHandler);
router.post(`${rc}/certifications/:id/start-assessment`, checkPermission('data_extractor.readiness_certification.collect_evidence'), readinessCertificationController.startAssessmentHandler);
router.post(`${rc}/certifications/:id/run-local-checks`, checkPermission('data_extractor.readiness_certification.run_local_checks'), readinessCertificationController.runLocalChecksHandler);
router.post(`${rc}/certifications/:id/submit-review`, checkPermission('data_extractor.readiness_certification.qa_review'), readinessCertificationController.submitReviewHandler);
router.post(`${rc}/certifications/:id/final-review`, checkPermission('data_extractor.readiness_certification.final_review'), readinessCertificationController.finalReviewHandler);
router.post(`${rc}/certifications/:id/archive`, checkPermission('data_extractor.readiness_certification.manage'), readinessCertificationController.archiveHandler);
router.get(`${rc}/certifications/:id/history`, checkPermission('data_extractor.readiness_certification.view'), readinessCertificationController.historyHandler);
router.get(`${rc}/certifications/:id/summary`, checkPermission('data_extractor.readiness_certification.view'), readinessCertificationController.summaryHandler);
router.get(`${rc}/certifications/:id/export`, checkPermission('data_extractor.readiness_certification.export'), readinessCertificationController.exportHandler);
router.get(`${rc}/certifications/:id/assessments`, checkPermission('data_extractor.readiness_certification.view'), readinessCertificationController.listAssessmentsHandler);
router.get(`${rc}/certifications/:id/findings`, checkPermission('data_extractor.readiness_certification.view'), readinessCertificationController.listFindingsHandler);
router.post(`${rc}/certifications/:id/findings`, checkPermission('data_extractor.readiness_certification.create_finding'), readinessCertificationController.createFindingHandler);
router.get(`${rc}/findings/:findingId`, checkPermission('data_extractor.readiness_certification.view'), readinessCertificationController.getFindingHandler);
router.put(`${rc}/findings/:findingId`, checkPermission('data_extractor.readiness_certification.review_finding'), readinessCertificationController.updateFindingHandler);
router.post(`${rc}/findings/:findingId/acknowledge`, checkPermission('data_extractor.readiness_certification.review_finding'), readinessCertificationController.acknowledgeFindingHandler);
router.post(`${rc}/findings/:findingId/create-remediation`, checkPermission('data_extractor.readiness_certification.create_remediation'), readinessCertificationController.createRemediationHandler);
router.post(`${rc}/findings/:findingId/ready-for-retest`, checkPermission('data_extractor.readiness_certification.retest'), readinessCertificationController.readyForRetestHandler);
router.post(`${rc}/findings/:findingId/retest`, checkPermission('data_extractor.readiness_certification.retest'), readinessCertificationController.retestFindingHandler);
router.post(`${rc}/findings/:findingId/resolve`, checkPermission('data_extractor.readiness_certification.review_finding'), readinessCertificationController.resolveFindingHandler);
router.post(`${rc}/findings/:findingId/accept-risk`, checkPermission('data_extractor.readiness_certification.accept_risk'), readinessCertificationController.acceptRiskHandler);
router.get(`${rc}/certifications/:id/evidence`, checkPermission('data_extractor.readiness_certification.view'), readinessCertificationController.listEvidenceHandler);
router.post(`${rc}/certifications/:id/evidence`, checkPermission('data_extractor.readiness_certification.collect_evidence'), readinessCertificationController.addEvidenceHandler);
router.get(`${rc}/certifications/:id/benchmarks`, checkPermission('data_extractor.readiness_certification.view'), readinessCertificationController.listBenchmarksHandler);
router.post(`${rc}/certifications/:id/benchmarks/run-local`, checkPermission('data_extractor.readiness_certification.performance_review'), readinessCertificationController.runBenchmarkHandler);
router.get(`${rc}/controls`, checkPermission('data_extractor.readiness_certification.view'), readinessCertificationController.listControlsHandler);
router.post(`${rc}/controls`, checkPermission('data_extractor.readiness_certification.manage'), readinessCertificationController.createControlHandler);
router.get(`${rc}/controls/:id`, checkPermission('data_extractor.readiness_certification.view'), readinessCertificationController.getControlHandler);
router.put(`${rc}/controls/:id`, checkPermission('data_extractor.readiness_certification.manage'), readinessCertificationController.updateControlHandler);
router.post(`${rc}/controls/:id/archive`, checkPermission('data_extractor.readiness_certification.manage'), readinessCertificationController.archiveControlHandler);
router.get(`${rc}/settings`, checkPermission('data_extractor.readiness_certification.view'), readinessCertificationController.getSettingsHandler);
router.put(`${rc}/settings`, checkPermission('data_extractor.readiness_certification.settings'), readinessCertificationController.saveSettingsHandler);
router.get(`${rc}/saved-views`, checkPermission('data_extractor.readiness_certification.saved_views'), readinessCertificationController.listViewsHandler);
router.post(`${rc}/saved-views`, checkPermission('data_extractor.readiness_certification.saved_views'), readinessCertificationController.createViewHandler);
router.put(`${rc}/saved-views/:id`, checkPermission('data_extractor.readiness_certification.saved_views'), readinessCertificationController.updateViewHandler);
router.delete(`${rc}/saved-views/:id`, checkPermission('data_extractor.readiness_certification.saved_views'), readinessCertificationController.deleteViewHandler);
router.get(`${rc}/audit`, checkPermission('data_extractor.readiness_certification.audit'), readinessCertificationController.auditHandler);
const pr = '/ai-lead-intelligence/pilot-rollout';
router.get(`${pr}/programs`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.listProgramsHandler);
router.post(`${pr}/programs`, checkPermission('data_extractor.pilot.create'), pilotRolloutController.createProgramHandler);
router.get(`${pr}/programs/:id`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.getProgramHandler);
router.put(`${pr}/programs/:id`, checkPermission('data_extractor.pilot.update'), pilotRolloutController.updateProgramHandler);
router.post(`${pr}/programs/:id/lifecycle`, checkPermission('data_extractor.pilot.review'), pilotRolloutController.lifecycleHandler);
router.get(`${pr}/programs/:id/summary`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.summaryHandler);
router.get(`${pr}/programs/:id/recommendation`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.recommendationHandler);
router.get(`${pr}/staging-simulations`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.listSimulationsHandler);
router.post(`${pr}/staging-simulations`, checkPermission('data_extractor.pilot.create'), pilotRolloutController.createSimulationHandler);
router.get(`${pr}/staging-simulations/:id`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.getSimulationHandler);
router.post(`${pr}/staging-simulations/:id/run-local-checks`, checkPermission('data_extractor.pilot.review'), pilotRolloutController.runLocalChecksHandler);
router.get(`${pr}/companies`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.listCompaniesHandler);
router.post(`${pr}/companies`, checkPermission('data_extractor.pilot.company_selection'), pilotRolloutController.createCompanyHandler);
router.get(`${pr}/industries`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.listIndustriesHandler);
router.post(`${pr}/industries`, checkPermission('data_extractor.pilot.industry_selection'), pilotRolloutController.setIndustriesHandler);
router.get(`${pr}/cohorts`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.listCohortsHandler);
router.post(`${pr}/cohorts`, checkPermission('data_extractor.pilot.cohort_manage'), pilotRolloutController.createCohortHandler);
router.get(`${pr}/module-plans`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.listModulePlansHandler);
router.post(`${pr}/module-plans`, checkPermission('data_extractor.pilot.module_plan'), pilotRolloutController.upsertModulePlanHandler);
router.get(`${pr}/feature-flag-plans`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.listFeatureFlagPlansHandler);
router.post(`${pr}/feature-flag-plans`, checkPermission('data_extractor.pilot.feature_flag_plan'), pilotRolloutController.upsertFeatureFlagPlanHandler);
router.get(`${pr}/uat/plans`, checkPermission('data_extractor.pilot.uat.view'), pilotRolloutController.listUatPlansHandler);
router.post(`${pr}/uat/plans`, checkPermission('data_extractor.pilot.uat.manage'), pilotRolloutController.createUatPlanHandler);
router.get(`${pr}/uat/test-cases`, checkPermission('data_extractor.pilot.uat.view'), pilotRolloutController.listTestCasesHandler);
router.post(`${pr}/uat/test-cases`, checkPermission('data_extractor.pilot.uat.manage'), pilotRolloutController.createTestCaseHandler);
router.get(`${pr}/uat/cycles`, checkPermission('data_extractor.pilot.uat.view'), pilotRolloutController.listCyclesHandler);
router.post(`${pr}/uat/cycles`, checkPermission('data_extractor.pilot.uat.manage'), pilotRolloutController.createCycleHandler);
router.post(`${pr}/uat/cycles/:id/complete`, checkPermission('data_extractor.pilot.uat.review'), pilotRolloutController.completeCycleHandler);
router.get(`${pr}/uat/executions`, checkPermission('data_extractor.pilot.uat.view'), pilotRolloutController.listExecutionsHandler);
router.post(`${pr}/uat/executions`, checkPermission('data_extractor.pilot.uat.execute'), pilotRolloutController.recordExecutionHandler);
router.post(`${pr}/uat/evidence`, checkPermission('data_extractor.pilot.evidence.manage'), pilotRolloutController.addEvidenceHandler);
router.get(`${pr}/defects`, checkPermission('data_extractor.pilot.defect.view'), pilotRolloutController.listDefectsHandler);
router.post(`${pr}/defects`, checkPermission('data_extractor.pilot.defect.manage'), pilotRolloutController.createDefectHandler);
router.post(`${pr}/defects/:id/transition`, checkPermission('data_extractor.pilot.defect.manage'), pilotRolloutController.transitionDefectHandler);
router.post(`${pr}/defects/:id/retest`, checkPermission('data_extractor.pilot.defect.manage'), pilotRolloutController.retestDefectHandler);
router.post(`${pr}/defects/:id/close`, checkPermission('data_extractor.pilot.defect.manage'), pilotRolloutController.closeDefectHandler);
router.post(`${pr}/defects/:id/accept-risk`, checkPermission('data_extractor.pilot.accept_risk'), pilotRolloutController.acceptDefectRiskHandler);
router.get(`${pr}/feedback`, checkPermission('data_extractor.pilot.feedback.view'), pilotRolloutController.listFeedbackHandler);
router.post(`${pr}/feedback`, checkPermission('data_extractor.pilot.feedback.manage'), pilotRolloutController.createFeedbackHandler);
router.get(`${pr}/metrics`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.metricsHandler);
router.get(`${pr}/health-dashboard`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.healthHandler);
router.get(`${pr}/risks`, checkPermission('data_extractor.pilot.risk.view'), pilotRolloutController.listRisksHandler);
router.post(`${pr}/risks`, checkPermission('data_extractor.pilot.risk.manage'), pilotRolloutController.createRiskHandler);
router.post(`${pr}/risks/:id/accept`, checkPermission('data_extractor.pilot.accept_risk'), pilotRolloutController.acceptRiskHandler);
router.get(`${pr}/exceptions`, checkPermission('data_extractor.pilot.risk.view'), pilotRolloutController.listExceptionsHandler);
router.post(`${pr}/exceptions`, checkPermission('data_extractor.pilot.risk.manage'), pilotRolloutController.createExceptionHandler);
router.get(`${pr}/pause-requests`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.listPauseHandler);
router.post(`${pr}/pause-requests`, checkPermission('data_extractor.pilot.pause_review'), pilotRolloutController.createPauseHandler);
router.post(`${pr}/pause-requests/:id/review`, checkPermission('data_extractor.pilot.pause_review'), pilotRolloutController.reviewPauseHandler);
router.get(`${pr}/suspension-reviews`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.listPauseHandler);
router.post(`${pr}/suspension-reviews`, checkPermission('data_extractor.pilot.suspension_review'), pilotRolloutController.createPauseHandler);
router.post(`${pr}/suspension-reviews/:id/review`, checkPermission('data_extractor.pilot.suspension_review'), pilotRolloutController.reviewPauseHandler);
router.get(`${pr}/rollback-plans`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.listRollbackHandler);
router.post(`${pr}/rollback-plans`, checkPermission('data_extractor.pilot.rollback_plan'), pilotRolloutController.createRollbackHandler);
router.post(`${pr}/rollback-plans/:id/simulate`, checkPermission('data_extractor.pilot.rollback_plan'), pilotRolloutController.simulateRollbackHandler);
router.get(`${pr}/success-criteria`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.criteriaHandler);
router.post(`${pr}/closure-reviews/:id`, checkPermission('data_extractor.pilot.final_review'), pilotRolloutController.closureHandler);
router.get(`${pr}/recommendations/:id`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.recommendationHandler);
router.get(`${pr}/settings`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.getSettingsHandler);
router.put(`${pr}/settings`, checkPermission('data_extractor.pilot.settings'), pilotRolloutController.saveSettingsHandler);
router.get(`${pr}/controls`, checkPermission('data_extractor.pilot.view'), pilotRolloutController.controlsHandler);
router.get(`${pr}/saved-views`, checkPermission('data_extractor.pilot.saved_views'), pilotRolloutController.listViewsHandler);
router.post(`${pr}/saved-views`, checkPermission('data_extractor.pilot.saved_views'), pilotRolloutController.createViewHandler);
router.put(`${pr}/saved-views/:id`, checkPermission('data_extractor.pilot.saved_views'), pilotRolloutController.updateViewHandler);
router.delete(`${pr}/saved-views/:id`, checkPermission('data_extractor.pilot.saved_views'), pilotRolloutController.deleteViewHandler);
router.get(`${pr}/audit`, checkPermission('data_extractor.pilot.audit'), pilotRolloutController.auditHandler);
router.get(`${pr}/export`, checkPermission('data_extractor.pilot.export'), pilotRolloutController.exportHandler);

const eo = '/ai-lead-intelligence/enterprise-operations';
router.get(`${eo}/programs`, checkPermission('data_extractor.operations.view'), enterpriseOperationsController.listProgramsHandler);
router.post(`${eo}/programs`, checkPermission('data_extractor.operations.create'), enterpriseOperationsController.createProgramHandler);
router.get(`${eo}/programs/:id`, checkPermission('data_extractor.operations.view'), enterpriseOperationsController.getProgramHandler);
router.put(`${eo}/programs/:id`, checkPermission('data_extractor.operations.update'), enterpriseOperationsController.updateProgramHandler);
router.post(`${eo}/programs/:id/lifecycle`, checkPermission('data_extractor.operations.review'), enterpriseOperationsController.lifecycleHandler);
router.get(`${eo}/programs/:id/summary`, checkPermission('data_extractor.operations.view'), enterpriseOperationsController.summaryHandler);
router.get(`${eo}/programs/:id/recommendation`, checkPermission('data_extractor.operations.view'), enterpriseOperationsController.recommendationHandler);
router.post(`${eo}/release-board/:id`, checkPermission('data_extractor.operations.release_board'), enterpriseOperationsController.releaseBoardHandler);
router.get(`${eo}/environments`, checkPermission('data_extractor.operations.view'), enterpriseOperationsController.listEnvironmentsHandler);
router.post(`${eo}/environments`, checkPermission('data_extractor.operations.environment_inventory'), enterpriseOperationsController.upsertEnvironmentHandler);
router.get(`${eo}/release-calendar`, checkPermission('data_extractor.operations.release_calendar'), enterpriseOperationsController.listCalendarHandler);
router.get(`${eo}/maintenance-windows`, checkPermission('data_extractor.operations.view'), enterpriseOperationsController.listWindowsHandler);
router.post(`${eo}/maintenance-windows`, checkPermission('data_extractor.operations.maintenance_window'), enterpriseOperationsController.createWindowHandler);
router.get(`${eo}/rollback-authorization-plans`, checkPermission('data_extractor.operations.view'), enterpriseOperationsController.listRollbackHandler);
router.post(`${eo}/rollback-authorization-plans`, checkPermission('data_extractor.operations.rollback_plan'), enterpriseOperationsController.createRollbackHandler);
router.post(`${eo}/rollback-authorization-plans/:id/simulate`, checkPermission('data_extractor.operations.rollback_plan'), enterpriseOperationsController.simulateRollbackHandler);
router.get(`${eo}/backup-verification-plans`, checkPermission('data_extractor.operations.view'), enterpriseOperationsController.listContinuityHandler);
router.post(`${eo}/backup-verification-plans`, checkPermission('data_extractor.operations.backup_plan'), enterpriseOperationsController.createContinuityHandler);
router.get(`${eo}/restore-verification-plans`, checkPermission('data_extractor.operations.view'), enterpriseOperationsController.listContinuityHandler);
router.post(`${eo}/restore-verification-plans`, checkPermission('data_extractor.operations.restore_plan'), enterpriseOperationsController.createContinuityHandler);
router.get(`${eo}/disaster-recovery-plans`, checkPermission('data_extractor.operations.view'), enterpriseOperationsController.listContinuityHandler);
router.post(`${eo}/disaster-recovery-plans`, checkPermission('data_extractor.operations.dr_plan'), enterpriseOperationsController.createContinuityHandler);
router.get(`${eo}/business-continuity-plans`, checkPermission('data_extractor.operations.view'), enterpriseOperationsController.listContinuityHandler);
router.post(`${eo}/business-continuity-plans`, checkPermission('data_extractor.operations.dr_plan'), enterpriseOperationsController.createContinuityHandler);
router.post(`${eo}/health-checks/run-local`, checkPermission('data_extractor.operations.monitoring.manage'), enterpriseOperationsController.localHealthHandler);
router.put(`${eo}/checklists/:id`, checkPermission('data_extractor.operations.checklist.manage'), enterpriseOperationsController.checklistHandler);
router.post(`${eo}/checklists/:id/complete-all`, checkPermission('data_extractor.operations.checklist.manage'), enterpriseOperationsController.completeChecklistsHandler);
router.get(`${eo}/changes`, checkPermission('data_extractor.operations.change.view'), enterpriseOperationsController.listChangesHandler);
router.post(`${eo}/changes`, checkPermission('data_extractor.operations.change.manage'), enterpriseOperationsController.createChangeHandler);
router.post(`${eo}/changes/:id/transition`, checkPermission('data_extractor.operations.change.manage'), enterpriseOperationsController.transitionChangeHandler);
router.post(`${eo}/emergency-change-plans`, checkPermission('data_extractor.operations.emergency_change'), enterpriseOperationsController.createChangeHandler);
router.get(`${eo}/incidents`, checkPermission('data_extractor.operations.incident.view'), enterpriseOperationsController.listIncidentsHandler);
router.post(`${eo}/incidents`, checkPermission('data_extractor.operations.incident.manage'), enterpriseOperationsController.createIncidentHandler);
router.post(`${eo}/incidents/:id/transition`, checkPermission('data_extractor.operations.incident.manage'), enterpriseOperationsController.transitionIncidentHandler);
router.post(`${eo}/problems`, checkPermission('data_extractor.operations.problem.manage'), enterpriseOperationsController.createProblemHandler);
router.get(`${eo}/risks`, checkPermission('data_extractor.operations.risk.view'), enterpriseOperationsController.listRisksHandler);
router.post(`${eo}/risks`, checkPermission('data_extractor.operations.risk.manage'), enterpriseOperationsController.createRiskHandler);
router.post(`${eo}/risks/:id/accept`, checkPermission('data_extractor.operations.accept_risk'), enterpriseOperationsController.acceptRiskHandler);
router.get(`${eo}/exceptions`, checkPermission('data_extractor.operations.risk.view'), enterpriseOperationsController.listExceptionsHandler);
router.post(`${eo}/exceptions`, checkPermission('data_extractor.operations.risk.manage'), enterpriseOperationsController.createExceptionHandler);
router.get(`${eo}/health-dashboard`, checkPermission('data_extractor.operations.view'), enterpriseOperationsController.healthHandler);
router.get(`${eo}/phase27-recommendations/:id`, checkPermission('data_extractor.operations.phase27_recommendation'), enterpriseOperationsController.phase27Handler);
router.get(`${eo}/settings`, checkPermission('data_extractor.operations.view'), enterpriseOperationsController.getSettingsHandler);
router.put(`${eo}/settings`, checkPermission('data_extractor.operations.settings'), enterpriseOperationsController.saveSettingsHandler);
router.get(`${eo}/controls`, checkPermission('data_extractor.operations.view'), enterpriseOperationsController.controlsHandler);
router.get(`${eo}/saved-views`, checkPermission('data_extractor.operations.saved_views'), enterpriseOperationsController.listViewsHandler);
router.post(`${eo}/saved-views`, checkPermission('data_extractor.operations.saved_views'), enterpriseOperationsController.createViewHandler);
router.delete(`${eo}/saved-views/:id`, checkPermission('data_extractor.operations.saved_views'), enterpriseOperationsController.deleteViewHandler);
router.get(`${eo}/audit`, checkPermission('data_extractor.operations.audit'), enterpriseOperationsController.auditHandler);
router.get(`${eo}/export`, checkPermission('data_extractor.operations.export'), enterpriseOperationsController.exportHandler);

const ar = '/ai-lead-intelligence/activation-readiness';
router.get(`${ar}/programs`, checkPermission('data_extractor.activation_readiness.view'), activationReadinessController.listProgramsHandler);
router.post(`${ar}/programs`, checkPermission('data_extractor.activation_readiness.create'), activationReadinessController.createProgramHandler);
router.get(`${ar}/programs/:id`, checkPermission('data_extractor.activation_readiness.view'), activationReadinessController.getProgramHandler);
router.put(`${ar}/programs/:id`, checkPermission('data_extractor.activation_readiness.update'), activationReadinessController.updateProgramHandler);
router.post(`${ar}/programs/:id/lifecycle`, checkPermission('data_extractor.activation_readiness.review'), activationReadinessController.lifecycleHandler);
router.get(`${ar}/programs/:id/summary`, checkPermission('data_extractor.activation_readiness.view'), activationReadinessController.summaryHandler);
router.get(`${ar}/recommendations/:id`, checkPermission('data_extractor.activation_readiness.recommendation'), activationReadinessController.recommendationHandler);
router.post(`${ar}/release-lineage/:id`, checkPermission('data_extractor.activation_readiness.release_lineage'), activationReadinessController.lineageHandler);
router.post(`${ar}/release-integrity/:id`, checkPermission('data_extractor.activation_readiness.integrity_review'), activationReadinessController.integrityHandler);
router.post(`${ar}/phase-dependencies/:id`, checkPermission('data_extractor.activation_readiness.validate'), activationReadinessController.dependenciesHandler);
router.post(`${ar}/final-gates/:id`, checkPermission('data_extractor.activation_readiness.validate'), activationReadinessController.finalGatesHandler);
router.post(`${ar}/defect-gates/:id`, checkPermission('data_extractor.activation_readiness.defect_gate'), activationReadinessController.defectGateHandler);
router.post(`${ar}/risk-gates/:id`, checkPermission('data_extractor.activation_readiness.risk_gate'), activationReadinessController.riskGateHandler);
router.post(`${ar}/approval-reviews/:id`, checkPermission('data_extractor.activation_readiness.approvals'), activationReadinessController.approvalReviewHandler);
router.post(`${ar}/environment-reviews/:id`, checkPermission('data_extractor.activation_readiness.environment_review'), activationReadinessController.environmentReviewHandler);
router.post(`${ar}/maintenance-reviews/:id`, checkPermission('data_extractor.activation_readiness.maintenance_review'), activationReadinessController.maintenanceReviewHandler);
router.post(`${ar}/monitoring-reviews/:id`, checkPermission('data_extractor.activation_readiness.monitoring_review'), activationReadinessController.monitoringReviewHandler);
router.post(`${ar}/incident-reviews/:id`, checkPermission('data_extractor.activation_readiness.incident_review'), activationReadinessController.incidentReviewHandler);
router.post(`${ar}/escalation-reviews/:id`, checkPermission('data_extractor.activation_readiness.incident_review'), activationReadinessController.escalationReviewHandler);
router.post(`${ar}/backup-reviews/:id`, checkPermission('data_extractor.activation_readiness.backup_review'), activationReadinessController.backupReviewHandler);
router.post(`${ar}/restore-reviews/:id`, checkPermission('data_extractor.activation_readiness.restore_review'), activationReadinessController.restoreReviewHandler);
router.post(`${ar}/rollback-reviews/:id`, checkPermission('data_extractor.activation_readiness.rollback_review'), activationReadinessController.rollbackReviewHandler);
router.post(`${ar}/dr-reviews/:id`, checkPermission('data_extractor.activation_readiness.dr_review'), activationReadinessController.drReviewHandler);
router.post(`${ar}/business-continuity-reviews/:id`, checkPermission('data_extractor.activation_readiness.dr_review'), activationReadinessController.bcReviewHandler);
router.post(`${ar}/communication-reviews/:id`, checkPermission('data_extractor.activation_readiness.communication_review'), activationReadinessController.communicationReviewHandler);
router.post(`${ar}/customer-impact-reviews/:id`, checkPermission('data_extractor.activation_readiness.customer_impact'), activationReadinessController.customerImpactHandler);
router.post(`${ar}/hypercare-reviews/:id`, checkPermission('data_extractor.activation_readiness.hypercare'), activationReadinessController.hypercareHandler);
router.post(`${ar}/smoke-test-plans/:id`, checkPermission('data_extractor.activation_readiness.smoke_test_plan'), activationReadinessController.smokePlanHandler);
router.post(`${ar}/manual-deployment-checklists/:id`, checkPermission('data_extractor.activation_readiness.manual_checklist'), activationReadinessController.checklistHandler);
router.post(`${ar}/handover-packages/:id`, checkPermission('data_extractor.activation_readiness.handover'), activationReadinessController.handoverHandler);
router.post(`${ar}/final-review-board/:id`, checkPermission('data_extractor.activation_readiness.final_review'), activationReadinessController.lifecycleHandler);
router.post(`${ar}/blockers/:id`, checkPermission('data_extractor.activation_readiness.update'), activationReadinessController.blockerHandler);
router.post(`${ar}/exceptions/:id`, checkPermission('data_extractor.activation_readiness.exceptions'), activationReadinessController.exceptionHandler);
router.post(`${ar}/programs/:id/complete-reviews`, checkPermission('data_extractor.activation_readiness.manage'), activationReadinessController.completeAllHandler);
router.get(`${ar}/settings`, checkPermission('data_extractor.activation_readiness.view'), activationReadinessController.getSettingsHandler);
router.put(`${ar}/settings`, checkPermission('data_extractor.activation_readiness.settings'), activationReadinessController.saveSettingsHandler);
router.get(`${ar}/controls`, checkPermission('data_extractor.activation_readiness.view'), activationReadinessController.controlsHandler);
router.get(`${ar}/saved-views`, checkPermission('data_extractor.activation_readiness.saved_views'), activationReadinessController.listViewsHandler);
router.post(`${ar}/saved-views`, checkPermission('data_extractor.activation_readiness.saved_views'), activationReadinessController.createViewHandler);
router.delete(`${ar}/saved-views/:id`, checkPermission('data_extractor.activation_readiness.saved_views'), activationReadinessController.deleteViewHandler);
router.get(`${ar}/audit`, checkPermission('data_extractor.activation_readiness.audit'), activationReadinessController.auditHandler);
router.get(`${ar}/export`, checkPermission('data_extractor.activation_readiness.export'), activationReadinessController.exportHandler);


router.post(
    '/jobs/manual-url',
    checkPermission('data_extractor.extractor.search'),
    extractorController.createManualUrlJob,
);

router.post(
    '/jobs/keyword-search',
    checkPermission('data_extractor.extractor.search'),
    extractorController.createKeywordSearchJob,
);

router.get('/jobs', checkPermission('data_extractor.extractor.view'), extractorController.listJobs);
router.get('/jobs/:id', checkPermission('data_extractor.extractor.view'), extractorController.getJob);
router.post(
    '/jobs/:id/save-drafts',
    checkPermission('data_extractor.extractor.search'),
    extractorController.saveDrafts,
);
router.post(
    '/jobs/:id/rerun',
    checkPermission('data_extractor.extractor.search'),
    extractorController.rerunJob,
);
router.post(
    '/jobs/:id/enhance-ai',
    checkPermission('data_extractor.extractor.search'),
    extractorController.enhanceJobAi,
);

router.get('/sources', checkPermission('data_extractor.extractor.view'), extractorController.listSources);
router.get('/adapters', checkPermission('data_extractor.extractor.view'), extractorController.listSources);
router.post('/adapters/:adapterId/test', checkPermission('data_extractor.extractor.search'), extractorController.testAdapter);

router.post(
    '/import/excel',
    checkPermission('data_extractor.extractor.import'),
    extractorUpload.single('file'),
    extractorController.uploadExcelImport,
);

router.get('/records', checkPermission('data_extractor.extractor.view'), extractorController.listRecords);
router.get('/records/export', checkPermission('data_extractor.extractor.export'), extractorController.exportExtractedRecords);
router.post('/records/bulk', checkPermission('data_extractor.extractor.approve'), extractorController.bulkRecordsAction);
router.get('/records/:id/duplicates', checkPermission('data_extractor.extractor.view'), extractorController.getRecordDuplicatesHandler);
router.post('/records/:id/followup', checkPermission('data_extractor.extractor.convert_lead'), extractorController.scheduleRecordFollowupHandler);
router.get('/records/:id', checkPermission('data_extractor.extractor.view'), extractorController.getRecord);
router.delete('/records/:id', checkPermission('data_extractor.extractor.delete'), extractorController.removeDraft);
router.post('/records/:id/approve', checkPermission('data_extractor.extractor.approve'), extractorController.approveExtractedRecord);
router.post('/records/:id/reject', checkPermission('data_extractor.extractor.approve'), extractorController.rejectExtractedRecord);
router.post('/records/:id/convert/lead', checkPermission('data_extractor.extractor.convert_lead'), extractorController.convertToLead);
router.post('/records/:id/convert/customer', checkPermission('data_extractor.extractor.convert_customer'), extractorController.convertToCustomer);
router.post('/records/:id/convert/supplier', checkPermission('data_extractor.extractor.convert_supplier'), extractorController.convertToSupplier);



// Business Discovery Engine
router.get('/discovery/providers', checkPermission('data_extractor.discovery.view'), discoveryController.listDiscoveryProviders);
router.post('/discovery/providers/:providerId/test', checkPermission('data_extractor.discovery.settings'), discoveryController.testProvider);
router.get('/discovery/settings', checkPermission('data_extractor.discovery.settings'), discoveryController.getDiscoverySettings);
router.put('/discovery/settings', checkPermission('data_extractor.discovery.settings'), discoveryController.putDiscoverySettings);

router.post('/discovery/jobs', checkPermission('data_extractor.discovery.create'), discoveryController.createJob);
router.get('/discovery/jobs', checkPermission('data_extractor.discovery.view'), discoveryController.listJobs);
router.get('/discovery/jobs/:id', checkPermission('data_extractor.discovery.view'), discoveryController.getJob);
router.post('/discovery/jobs/:id/start', checkPermission('data_extractor.discovery.run'), discoveryController.startJob);
router.post('/discovery/jobs/:id/pause', checkPermission('data_extractor.discovery.pause'), discoveryController.pauseJob);
router.post('/discovery/jobs/:id/resume', checkPermission('data_extractor.discovery.resume'), discoveryController.resumeJob);
router.post('/discovery/jobs/:id/stop', checkPermission('data_extractor.discovery.stop'), discoveryController.stopJob);
router.post('/discovery/jobs/:id/retry', checkPermission('data_extractor.discovery.run'), discoveryController.retryJob);
router.post('/discovery/jobs/:id/continue', checkPermission('data_extractor.discovery.run'), discoveryController.continueJob);
router.post('/discovery/jobs/:id/save-drafts', checkPermission('data_extractor.discovery.create'), discoveryController.saveDrafts);
router.get('/discovery/jobs/:id/results', checkPermission('data_extractor.discovery.view'), discoveryController.getResults);

router.post('/discovery/import-urls', checkPermission('data_extractor.discovery.create'), discoveryController.importUrls);

router.post('/discovery/import-file', checkPermission('data_extractor.discovery.create'), extractorUpload.single('file'), discoveryController.importFile);
router.post('/discovery/jobs/:id/convert-lead', checkPermission('data_extractor.discovery.convert_lead'), discoveryController.convertPreviewToLead);

router.post('/discovery/results/:id/approve', checkPermission('data_extractor.discovery.approve'), discoveryController.approveResult);
router.post('/discovery/results/:id/reject', checkPermission('data_extractor.discovery.approve'), discoveryController.rejectResult);
router.post('/discovery/results/:id/convert', checkPermission('data_extractor.discovery.convert_lead'), discoveryController.convertResult);

// ---- Discovery Agent (CRM user JWT) ----
router.post('/discovery/agent/tokens', checkPermission('data_extractor.discovery.use_local_agent'), discoveryAgentController.createToken);
router.get('/discovery/agent/tokens', checkPermission('data_extractor.discovery.use_local_agent'), discoveryAgentController.listTokens);
router.post('/discovery/agent/tokens/:id/revoke', checkPermission('data_extractor.discovery.use_local_agent'), discoveryAgentController.revokeToken);
router.post('/discovery/agent/jobs', checkPermission('data_extractor.discovery.use_local_agent'), discoveryAgentController.createJob);
router.get('/discovery/agent/jobs', checkPermission('data_extractor.discovery.view'), discoveryAgentController.listJobs);
router.get('/discovery/agent/jobs/:id', checkPermission('data_extractor.discovery.view'), discoveryAgentController.getJob);
router.post('/discovery/agent/jobs/:id/control', checkPermission('data_extractor.discovery.use_local_agent'), discoveryAgentController.controlJob);

// ---- Discovery duplicate / merge review (Phase 4) ----
router.get('/discovery/merge-reviews', checkPermission('data_extractor.discovery.view'), discoveryMergeReviewController.list);
router.get('/discovery/merge-reviews/:id', checkPermission('data_extractor.discovery.view'), discoveryMergeReviewController.getOne);
router.post('/discovery/merge-reviews/:id/resolve', checkPermission('data_extractor.discovery.approve'), discoveryMergeReviewController.resolve);
router.post('/discovery/jobs/:jobId/sync-merge-reviews', checkPermission('data_extractor.discovery.approve'), discoveryMergeReviewController.syncFromJob);
router.post('/discovery/compare', checkPermission('data_extractor.discovery.view'), discoveryMergeReviewController.compare);



// ---- Discovery Agent (local agent token — no user JWT; public router) ----
// IMPORTANT: Do NOT apply protectDiscoveryAgent via agentRouter.use(...) for all
// /discovery/agent/* paths. publicRouter is mounted before the CRM JWT router, so a
// blanket middleware blocked bootstrap POST /discovery/agent/tokens (circular:
// create token required an existing X-Discovery-Agent-Token).
// Agent auth applies only to agent-facing routes below; CRM token CRUD / job
// management stays on the protect + checkPermission router and falls through
// when no agent route matches.
const agentRouter = express.Router();
agentRouter.post('/connect', protectDiscoveryAgent, discoveryAgentController.connect);
agentRouter.get('/jobs/:id', protectDiscoveryAgent, discoveryAgentController.agentGetJob);
agentRouter.post('/jobs/:id/claim', protectDiscoveryAgent, discoveryAgentController.claimJob);
agentRouter.post('/jobs/:id/heartbeat', protectDiscoveryAgent, discoveryAgentController.heartbeat);
agentRouter.post('/jobs/:id/records', protectDiscoveryAgent, discoveryAgentController.ingest);
agentRouter.post('/presence', protectDiscoveryAgent, assistedCaptureController.presence);
agentRouter.get('/assisted-captures/poll', protectDiscoveryAgent, assistedCaptureController.pollQueued);
agentRouter.post('/assisted-captures/claim', protectDiscoveryAgent, assistedCaptureController.claim);
agentRouter.post('/assisted-captures/:sessionId/browser-opened', protectDiscoveryAgent, assistedCaptureController.browserOpened);
agentRouter.post('/assisted-captures/:sessionId/heartbeat', protectDiscoveryAgent, assistedCaptureController.heartbeat);
agentRouter.post('/assisted-captures/:sessionId/manual-action', protectDiscoveryAgent, assistedCaptureController.manualAction);
agentRouter.post('/assisted-captures/:sessionId/events', protectDiscoveryAgent, assistedCaptureController.submitEvent);
agentRouter.post('/assisted-captures/:sessionId/complete', protectDiscoveryAgent, assistedCaptureController.completeByAgent);
agentRouter.post('/assisted-captures/:sessionId/fail', protectDiscoveryAgent, assistedCaptureController.failByAgent);
agentRouter.get('/assisted-captures/:sessionId/capture-request', protectDiscoveryAgent, assistedCaptureController.getCaptureRequest);
agentRouter.post('/assisted-captures/:sessionId/capture-ack', protectDiscoveryAgent, assistedCaptureController.ackCaptureRequestHandler);
agentRouter.post('/assisted-captures/:sessionId/navigate-ack', protectDiscoveryAgent, assistedCaptureController.ackNavigateRequestHandler);
agentRouter.post('/assisted-captures/:sessionId/navigate-complete', protectDiscoveryAgent, assistedCaptureController.completeNavigateRequestHandler);
publicRouter.use('/discovery/agent', agentRouter);


export { publicRouter as dataExtractorPublicRoute };
export default router;
