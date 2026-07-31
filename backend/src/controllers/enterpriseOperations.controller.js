import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sanitizeError } from '../services/dataExtractor/enterpriseOperations/normalize.util.js';
import * as programService from '../services/dataExtractor/enterpriseOperations/operationsProgram.service.js';
import * as planningService from '../services/dataExtractor/enterpriseOperations/opsPlanning.service.js';
import * as changeService from '../services/dataExtractor/enterpriseOperations/opsChange.service.js';
import * as incidentService from '../services/dataExtractor/enterpriseOperations/opsIncident.service.js';
import * as riskService from '../services/dataExtractor/enterpriseOperations/opsRisk.service.js';
import * as settingsService from '../services/dataExtractor/enterpriseOperations/settings.service.js';
import * as supportService from '../services/dataExtractor/enterpriseOperations/opsSupport.service.js';

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
            res.send(new ApiResponse(200, data, 'Enterprise Operations OK'));
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

export const releaseBoardHandler = wrap(async (req) => planningService.releaseBoardReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const listEnvironmentsHandler = wrap(async (req) => planningService.listEnvironments(req.companyId, req.query, req.user));
export const upsertEnvironmentHandler = wrap(async (req) => planningService.upsertEnvironment(req.companyId, uid(req), req.body || {}, req.user));
export const listCalendarHandler = wrap(async (req) => planningService.listCalendar(req.companyId, req.query, req.user));
export const listWindowsHandler = wrap(async (req) => planningService.listMaintenanceWindows(req.companyId, req.query, req.user));
export const createWindowHandler = wrap(async (req) => planningService.createMaintenanceWindow(req.companyId, uid(req), req.body || {}, req.user));
export const listRollbackHandler = wrap(async (req) => planningService.listRollbackPlans(req.companyId, req.query, req.user));
export const createRollbackHandler = wrap(async (req) => planningService.createRollbackPlan(req.companyId, uid(req), req.body || {}, req.user));
export const simulateRollbackHandler = wrap(async (req) => planningService.simulateRollbackDecision(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const listContinuityHandler = wrap(async (req) => planningService.listContinuityPlans(req.companyId, req.query, req.user));
export const createContinuityHandler = wrap(async (req) => planningService.createContinuityPlan(req.companyId, uid(req), req.body || {}, req.user));
export const localHealthHandler = wrap(async (req) => planningService.runLocalHealthCheck(req.companyId, uid(req), req.body || {}, req.user));
export const checklistHandler = wrap(async (req) => planningService.updateChecklist(req.companyId, uid(req), req.params.id, req.body || {}, req.user));

export const listChangesHandler = wrap(async (req) => changeService.listChanges(req.companyId, req.query, req.user));
export const createChangeHandler = wrap(async (req) => changeService.createChange(req.companyId, uid(req), req.body || {}, req.user));
export const transitionChangeHandler = wrap(async (req) => changeService.transitionChange(req.companyId, uid(req), req.params.id, req.body || {}, req.user));

export const listIncidentsHandler = wrap(async (req) => incidentService.listIncidents(req.companyId, req.query, req.user));
export const createIncidentHandler = wrap(async (req) => incidentService.createIncident(req.companyId, uid(req), req.body || {}, req.user));
export const transitionIncidentHandler = wrap(async (req) => incidentService.transitionIncident(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const createProblemHandler = wrap(async (req) => incidentService.createProblem(req.companyId, uid(req), req.body || {}, req.user));

export const listRisksHandler = wrap(async (req) => riskService.listRisks(req.companyId, req.query, req.user));
export const createRiskHandler = wrap(async (req) => riskService.createRisk(req.companyId, uid(req), req.body || {}, req.user));
export const acceptRiskHandler = wrap(async (req) => riskService.acceptRisk(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const listExceptionsHandler = wrap(async (req) => riskService.listExceptions(req.companyId, req.query, req.user));
export const createExceptionHandler = wrap(async (req) => riskService.createException(req.companyId, uid(req), req.body || {}, req.user));

export const healthHandler = wrap(async (req) => supportService.healthDashboard(req.companyId, req.query, req.user));
export const getSettingsHandler = wrap(async (req) => settingsService.getSettings(req.companyId, req.user));
export const saveSettingsHandler = wrap(async (req) => settingsService.saveSettings(req.companyId, uid(req), req.body || {}, req.user));
export const listViewsHandler = wrap(async (req) => supportService.listSavedViews(req.companyId, uid(req), req.user));
export const createViewHandler = wrap(async (req) => supportService.createSavedView(req.companyId, uid(req), req.body || {}, req.user));
export const deleteViewHandler = wrap(async (req) => supportService.deleteSavedView(req.companyId, uid(req), req.params.id, req.user));
export const auditHandler = wrap(async (req) => supportService.listAudit(req.companyId, req.query, req.user));
export const exportHandler = wrap(async (req) => supportService.exportReport(req.companyId, uid(req), req.query, req.user));
export const controlsHandler = wrap(async (req) => supportService.listControls(req.user));
export const phase27Handler = wrap(async (req) => supportService.phase27Recommendation(req.companyId, req.params.id, req.user));
export const completeChecklistsHandler = wrap(async (req) => supportService.completeChecklistsForTests(req.companyId, uid(req), req.params.id, req.user));