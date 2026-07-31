import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sanitizeError } from '../services/dataExtractor/readinessCertification/normalize.util.js';
import * as certService from '../services/dataExtractor/readinessCertification/certification.service.js';
import * as findingsService from '../services/dataExtractor/readinessCertification/findings.service.js';
import * as controlsService from '../services/dataExtractor/readinessCertification/controls.service.js';
import * as settingsService from '../services/dataExtractor/readinessCertification/settings.service.js';
import * as savedViewsService from '../services/dataExtractor/readinessCertification/savedViews.service.js';

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
            res.send(new ApiResponse(200, data, 'Readiness Certification OK'));
        } catch (err) {
            throw new ApiError(err.statusCode || 500, sanitizeError(err));
        }
    });
}

export const listCertificationsHandler = wrap(async (req) => certService.listCertifications(req.companyId, req.query, req.user));
export const createCertificationHandler = wrap(async (req) => certService.createCertification(req.companyId, uid(req), req.body || {}, req.user));
export const getCertificationHandler = wrap(async (req) => certService.getCertification(req.companyId, req.params.id, req.user));
export const updateCertificationHandler = wrap(async (req) => certService.updateCertification(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const defineScopeHandler = wrap(async (req) => certService.defineScope(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const validateReleaseHandler = wrap(async (req) => certService.validateRelease(req.companyId, uid(req), req.params.id, req.user));
export const startAssessmentHandler = wrap(async (req) => certService.startAssessment(req.companyId, uid(req), req.params.id, req.user));
export const runLocalChecksHandler = wrap(async (req) => certService.runChecks(req.companyId, uid(req), req.params.id, req.user));
export const submitReviewHandler = wrap(async (req) => certService.submitReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const finalReviewHandler = wrap(async (req) => certService.finalReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const archiveHandler = wrap(async (req) => certService.archiveCertification(req.companyId, uid(req), req.params.id, req.user));
export const historyHandler = wrap(async (req) => certService.getHistory(req.companyId, req.params.id, req.user));
export const summaryHandler = wrap(async (req) => certService.getSummary(req.companyId, req.params.id, req.user));
export const exportHandler = wrap(async (req) => certService.exportCertification(req.companyId, req.params.id, req.user));

export const listAssessmentsHandler = wrap(async (req) => certService.listAssessments(req.companyId, req.params.id, req.user));
export const listFindingsHandler = wrap(async (req) => findingsService.listFindings(req.companyId, req.params.id, req.user));
export const createFindingHandler = wrap(async (req) => findingsService.createFinding(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const getFindingHandler = wrap(async (req) => findingsService.getFinding(req.companyId, req.params.findingId, req.user));
export const updateFindingHandler = wrap(async (req) => findingsService.updateFinding(req.companyId, uid(req), req.params.findingId, req.body || {}, req.user));
export const acknowledgeFindingHandler = wrap(async (req) => findingsService.acknowledgeFinding(req.companyId, uid(req), req.params.findingId, req.user));
export const createRemediationHandler = wrap(async (req) => findingsService.createRemediation(req.companyId, uid(req), req.params.findingId, req.body || {}, req.user));
export const readyForRetestHandler = wrap(async (req) => findingsService.readyForRetest(req.companyId, uid(req), req.params.findingId, req.user));
export const retestFindingHandler = wrap(async (req) => findingsService.retestFinding(req.companyId, uid(req), req.params.findingId, req.body || {}, req.user));
export const resolveFindingHandler = wrap(async (req) => findingsService.resolveFinding(req.companyId, uid(req), req.params.findingId, req.body || {}, req.user));
export const acceptRiskHandler = wrap(async (req) => findingsService.acceptRisk(req.companyId, uid(req), req.params.findingId, req.body || {}, req.user));

export const listEvidenceHandler = wrap(async (req) => certService.listEvidence(req.companyId, req.params.id, req.user));
export const addEvidenceHandler = wrap(async (req) => certService.addEvidence(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const listBenchmarksHandler = wrap(async (req) => certService.listBenchmarks(req.companyId, req.params.id, req.user));
export const runBenchmarkHandler = wrap(async (req) => certService.runBenchmark(req.companyId, uid(req), req.params.id, req.body || {}, req.user));

export const listControlsHandler = wrap(async (req) => controlsService.listControls(req.companyId, req.query, req.user));
export const createControlHandler = wrap(async (req) => controlsService.createControl(req.companyId, uid(req), req.body || {}, req.user));
export const getControlHandler = wrap(async (req) => controlsService.getControl(req.companyId, req.params.id, req.user));
export const updateControlHandler = wrap(async (req) => controlsService.updateControl(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const archiveControlHandler = wrap(async (req) => controlsService.archiveControl(req.companyId, uid(req), req.params.id, req.user));

export const getSettingsHandler = wrap(async (req) => settingsService.getSettings(req.companyId, req.user));
export const saveSettingsHandler = wrap(async (req) => settingsService.saveSettings(req.companyId, uid(req), req.body || {}, req.user));
export const listViewsHandler = wrap(async (req) => savedViewsService.listSavedViews(req.companyId, uid(req), req.user));
export const createViewHandler = wrap(async (req) => savedViewsService.createSavedView(req.companyId, uid(req), req.body || {}, req.user));
export const updateViewHandler = wrap(async (req) => savedViewsService.updateSavedView(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const deleteViewHandler = wrap(async (req) => savedViewsService.deleteSavedView(req.companyId, uid(req), req.params.id, req.user));
export const auditHandler = wrap(async (req) => savedViewsService.listAudit(req.companyId, req.query, req.user));
