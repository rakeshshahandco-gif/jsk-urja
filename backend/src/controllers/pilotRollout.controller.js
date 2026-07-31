import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sanitizeError } from '../services/dataExtractor/pilotRollout/normalize.util.js';
import * as programService from '../services/dataExtractor/pilotRollout/pilotProgram.service.js';
import * as stagingService from '../services/dataExtractor/pilotRollout/stagingSimulation.service.js';
import * as planningService from '../services/dataExtractor/pilotRollout/pilotPlanning.service.js';
import * as uatService from '../services/dataExtractor/pilotRollout/uat.service.js';
import * as defectService from '../services/dataExtractor/pilotRollout/pilotDefect.service.js';
import * as feedbackService from '../services/dataExtractor/pilotRollout/pilotFeedback.service.js';
import * as riskService from '../services/dataExtractor/pilotRollout/pilotRisk.service.js';
import * as opsService from '../services/dataExtractor/pilotRollout/pilotOps.service.js';
import * as closureService from '../services/dataExtractor/pilotRollout/pilotClosure.service.js';
import * as settingsService from '../services/dataExtractor/pilotRollout/settings.service.js';
import * as savedViewsService from '../services/dataExtractor/pilotRollout/savedViews.service.js';
import * as exportService from '../services/dataExtractor/pilotRollout/export.service.js';

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
            res.send(new ApiResponse(200, data, 'Pilot & UAT Center OK'));
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

export const listSimulationsHandler = wrap(async (req) => stagingService.listSimulations(req.companyId, req.query, req.user));
export const createSimulationHandler = wrap(async (req) => stagingService.createSimulation(req.companyId, uid(req), req.body || {}, req.user));
export const getSimulationHandler = wrap(async (req) => stagingService.getSimulation(req.companyId, req.params.id, req.user));
export const runLocalChecksHandler = wrap(async (req) => stagingService.runLocalChecks(req.companyId, uid(req), req.params.id, req.body || {}, req.user));

export const listCompaniesHandler = wrap(async (req) => planningService.listCompanies(req.companyId, req.query, req.user));
export const createCompanyHandler = wrap(async (req) => planningService.createCompanyPlan(req.companyId, uid(req), req.body || {}, req.user));
export const listIndustriesHandler = wrap(async (req) => planningService.listIndustries(req.companyId, req.query, req.user));
export const setIndustriesHandler = wrap(async (req) => planningService.setIndustryScope(req.companyId, uid(req), req.body || {}, req.user));
export const listCohortsHandler = wrap(async (req) => planningService.listCohorts(req.companyId, req.query, req.user));
export const createCohortHandler = wrap(async (req) => planningService.createCohort(req.companyId, uid(req), req.body || {}, req.user));
export const listModulePlansHandler = wrap(async (req) => planningService.listModulePlans(req.companyId, req.query, req.user));
export const upsertModulePlanHandler = wrap(async (req) => planningService.upsertModulePlan(req.companyId, uid(req), req.body || {}, req.user));
export const listFeatureFlagPlansHandler = wrap(async (req) => planningService.listFeatureFlagPlans(req.companyId, req.query, req.user));
export const upsertFeatureFlagPlanHandler = wrap(async (req) => planningService.upsertFeatureFlagPlan(req.companyId, uid(req), req.body || {}, req.user));

export const listUatPlansHandler = wrap(async (req) => uatService.listUatPlans(req.companyId, req.query, req.user));
export const createUatPlanHandler = wrap(async (req) => uatService.createUatPlan(req.companyId, uid(req), req.body || {}, req.user));
export const listTestCasesHandler = wrap(async (req) => uatService.listTestCases(req.companyId, req.query, req.user));
export const createTestCaseHandler = wrap(async (req) => uatService.createTestCase(req.companyId, uid(req), req.body || {}, req.user));
export const listCyclesHandler = wrap(async (req) => uatService.listCycles(req.companyId, req.query, req.user));
export const createCycleHandler = wrap(async (req) => uatService.createCycle(req.companyId, uid(req), req.body || {}, req.user));
export const completeCycleHandler = wrap(async (req) => uatService.completeCycle(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const listExecutionsHandler = wrap(async (req) => uatService.listExecutions(req.companyId, req.query, req.user));
export const recordExecutionHandler = wrap(async (req) => uatService.recordExecution(req.companyId, uid(req), req.body || {}, req.user));
export const addEvidenceHandler = wrap(async (req) => uatService.addEvidence(req.companyId, uid(req), req.body || {}, req.user));

export const listDefectsHandler = wrap(async (req) => defectService.listDefects(req.companyId, req.query, req.user));
export const createDefectHandler = wrap(async (req) => defectService.createDefect(req.companyId, uid(req), req.body || {}, req.user));
export const transitionDefectHandler = wrap(async (req) => defectService.transitionDefect(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const retestDefectHandler = wrap(async (req) => defectService.retestDefect(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const closeDefectHandler = wrap(async (req) => defectService.closeDefect(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const acceptDefectRiskHandler = wrap(async (req) => defectService.acceptDefectRisk(req.companyId, uid(req), req.params.id, req.body || {}, req.user));

export const listFeedbackHandler = wrap(async (req) => feedbackService.listFeedback(req.companyId, req.query, req.user));
export const createFeedbackHandler = wrap(async (req) => feedbackService.createFeedback(req.companyId, uid(req), req.body || {}, req.user));

export const listRisksHandler = wrap(async (req) => riskService.listRisks(req.companyId, req.query, req.user));
export const createRiskHandler = wrap(async (req) => riskService.createRisk(req.companyId, uid(req), req.body || {}, req.user));
export const acceptRiskHandler = wrap(async (req) => riskService.acceptRisk(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const listExceptionsHandler = wrap(async (req) => riskService.listExceptions(req.companyId, req.query, req.user));
export const createExceptionHandler = wrap(async (req) => riskService.createException(req.companyId, uid(req), req.body || {}, req.user));

export const listPauseHandler = wrap(async (req) => opsService.listPauseRequests(req.companyId, req.query, req.user));
export const createPauseHandler = wrap(async (req) => opsService.createPauseRequest(req.companyId, uid(req), req.body || {}, req.user));
export const reviewPauseHandler = wrap(async (req) => opsService.reviewPauseRequest(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const listRollbackHandler = wrap(async (req) => opsService.listRollbackPlans(req.companyId, req.query, req.user));
export const createRollbackHandler = wrap(async (req) => opsService.createRollbackPlan(req.companyId, uid(req), req.body || {}, req.user));
export const simulateRollbackHandler = wrap(async (req) => opsService.simulateRollback(req.companyId, uid(req), req.params.id, req.body || {}, req.user));

export const criteriaHandler = wrap(async (req) => closureService.evaluateCriteria(req.companyId, req.query.pilotProgramId || req.params.id, req.user));
export const closureHandler = wrap(async (req) => closureService.closureReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const healthHandler = wrap(async (req) => closureService.healthDashboard(req.companyId, req.query, req.user));
export const metricsHandler = wrap(async (req) => closureService.metrics(req.companyId, req.query, req.user));
export const controlsHandler = wrap(async (req) => closureService.listControls(req.user));

export const getSettingsHandler = wrap(async (req) => settingsService.getSettings(req.companyId, req.user));
export const saveSettingsHandler = wrap(async (req) => settingsService.saveSettings(req.companyId, uid(req), req.body || {}, req.user));
export const listViewsHandler = wrap(async (req) => savedViewsService.listSavedViews(req.companyId, uid(req), req.user));
export const createViewHandler = wrap(async (req) => savedViewsService.createSavedView(req.companyId, uid(req), req.body || {}, req.user));
export const updateViewHandler = wrap(async (req) => savedViewsService.updateSavedView(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const deleteViewHandler = wrap(async (req) => savedViewsService.deleteSavedView(req.companyId, uid(req), req.params.id, req.user));
export const auditHandler = wrap(async (req) => savedViewsService.listAudit(req.companyId, req.query, req.user));
export const exportHandler = wrap(async (req) => exportService.exportPilotReport(req.companyId, uid(req), req.query, req.user));