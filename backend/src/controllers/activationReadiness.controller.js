import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sanitizeError } from '../services/dataExtractor/activationReadiness/normalize.util.js';
import * as programService from '../services/dataExtractor/activationReadiness/activationReadinessProgram.service.js';
import * as reviewsService from '../services/dataExtractor/activationReadiness/readinessReviews.service.js';
import * as supportService from '../services/dataExtractor/activationReadiness/readinessSupport.service.js';
import * as settingsService from '../services/dataExtractor/activationReadiness/settings.service.js';

function rejectTenantOverrides(req) {
    if (req.body?.companyId != null || req.body?.tenantId != null
        || req.query?.companyId != null || req.query?.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}
function uid(req) { return req.user?.id || req.user?._id; }
function wrap(fn) {
    return asyncHandler(async (req, res) => {
        rejectTenantOverrides(req);
        try {
            const data = await fn(req);
            res.send(new ApiResponse(200, data, 'Activation Readiness OK'));
        } catch (err) {
            throw new ApiError(err.statusCode || 500, sanitizeError(err));
        }
    });
}

export const listProgramsHandler = wrap(async (req) => programService.listPrograms(req.companyId, req.query, req.user));
export const createProgramHandler = wrap(async (req) => programService.createProgram(req.companyId, uid(req), req.body || {}, req.user));
export const getProgramHandler = wrap(async (req) => programService.getProgram(req.companyId, req.params.id, req.user));
export const updateProgramHandler = wrap(async (req) => programService.updateProgram(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const lifecycleHandler = wrap(async (req) => programService.transitionLifecycle(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const summaryHandler = wrap(async (req) => programService.getSummary(req.companyId, req.params.id, req.user));
export const recommendationHandler = wrap(async (req) => programService.getRecommendation(req.companyId, req.params.id, req.user));

export const lineageHandler = wrap(async (req) => programService.validateReleaseLineage(req.companyId, uid(req), req.params.id, req.user));
export const integrityHandler = wrap(async (req) => programService.reviewReleaseIntegrity(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const dependenciesHandler = wrap(async (req) => programService.validatePhaseDependencies(req.companyId, uid(req), req.params.id, req.user));
export const finalGatesHandler = wrap(async (req) => programService.evaluateFinalGates(req.companyId, uid(req), req.params.id, req.user));

export const defectGateHandler = wrap(async (req) => reviewsService.recordDefectGate(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const riskGateHandler = wrap(async (req) => reviewsService.recordRiskGate(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const approvalReviewHandler = wrap(async (req) => reviewsService.recordApprovalReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const environmentReviewHandler = wrap(async (req) => reviewsService.recordEnvironmentReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const maintenanceReviewHandler = wrap(async (req) => reviewsService.recordMaintenanceReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const monitoringReviewHandler = wrap(async (req) => reviewsService.recordMonitoringReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const incidentReviewHandler = wrap(async (req) => reviewsService.recordIncidentReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const escalationReviewHandler = wrap(async (req) => reviewsService.recordEscalationReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const backupReviewHandler = wrap(async (req) => reviewsService.recordBackupReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const restoreReviewHandler = wrap(async (req) => reviewsService.recordRestoreReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const rollbackReviewHandler = wrap(async (req) => reviewsService.recordRollbackReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const drReviewHandler = wrap(async (req) => reviewsService.recordDrReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const bcReviewHandler = wrap(async (req) => reviewsService.recordBusinessContinuityReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const communicationReviewHandler = wrap(async (req) => reviewsService.recordCommunicationReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const customerImpactHandler = wrap(async (req) => reviewsService.recordCustomerImpactReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const hypercareHandler = wrap(async (req) => reviewsService.recordHypercareReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));

export const smokePlanHandler = wrap(async (req) => supportService.upsertSmokeTestPlan(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const checklistHandler = wrap(async (req) => supportService.generateManualChecklist(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const handoverHandler = wrap(async (req) => supportService.generateHandoverPackage(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const blockerHandler = wrap(async (req) => supportService.recordBlocker(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const exceptionHandler = wrap(async (req) => supportService.recordException(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const completeAllHandler = wrap(async (req) => supportService.completeAllReviewsForTests(req.companyId, uid(req), req.params.id, req.user));

export const getSettingsHandler = wrap(async (req) => settingsService.getSettings(req.companyId, req.user));
export const saveSettingsHandler = wrap(async (req) => settingsService.saveSettings(req.companyId, uid(req), req.body || {}, req.user));
export const listViewsHandler = wrap(async (req) => supportService.listSavedViews(req.companyId, uid(req), req.user));
export const createViewHandler = wrap(async (req) => supportService.createSavedView(req.companyId, uid(req), req.body || {}, req.user));
export const deleteViewHandler = wrap(async (req) => supportService.deleteSavedView(req.companyId, uid(req), req.params.id, req.user));
export const auditHandler = wrap(async (req) => supportService.listAudit(req.companyId, req.query, req.user));
export const exportHandler = wrap(async (req) => supportService.exportReport(req.companyId, uid(req), req.query, req.user));
export const controlsHandler = wrap(async (req) => supportService.listControls(req.user));