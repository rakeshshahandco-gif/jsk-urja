import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sanitizeError } from '../services/dataExtractor/sandboxEvaluation/normalize.util.js';
import * as runService from '../services/dataExtractor/sandboxEvaluation/run.service.js';
import * as settingsService from '../services/dataExtractor/sandboxEvaluation/settings.service.js';
import * as savedViewsService from '../services/dataExtractor/sandboxEvaluation/savedViews.service.js';

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
            res.send(new ApiResponse(200, data, 'Sandbox Evaluation OK'));
        } catch (err) {
            throw new ApiError(err.statusCode || 500, sanitizeError(err));
        }
    });
}

export const listRunsHandler = wrap(async (req) => runService.listRuns(req.companyId, req.query, req.user));
export const createRunHandler = wrap(async (req) => runService.createRun(req.companyId, uid(req), req.body || {}, req.user));
export const getRunHandler = wrap(async (req) => runService.getRun(req.companyId, req.params.id, req.user));
export const validateRunHandler = wrap(async (req) => runService.validateRun(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const startRunHandler = wrap(async (req) => runService.startRun(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const cancelRunHandler = wrap(async (req) => runService.cancelRun(req.companyId, uid(req), req.params.id, req.user));
export const archiveRunHandler = wrap(async (req) => runService.archiveRun(req.companyId, uid(req), req.params.id, req.user));
export const statusHandler = wrap(async (req) => runService.getStatus(req.companyId, req.params.id, req.user));
export const resultsHandler = wrap(async (req) => runService.listResults(req.companyId, req.params.id, req.query, req.user));
export const resultDetailHandler = wrap(async (req) => runService.getResult(req.companyId, req.params.id, req.params.resultId, req.user));
export const metricsHandler = wrap(async (req) => runService.getMetrics(req.companyId, req.params.id, req.user));
export const issuesHandler = wrap(async (req) => runService.getIssues(req.companyId, req.params.id, req.user));
export const recommendationHandler = wrap(async (req) => runService.getRecommendation(req.companyId, req.params.id, req.user));
export const compareHandler = wrap(async (req) => runService.getCompare(req.companyId, req.params.id, req.user));
export const exportHandler = wrap(async (req) => runService.exportRun(req.companyId, req.params.id, req.user));

export const getSettingsHandler = wrap(async (req) => settingsService.getSettings(req.companyId, req.user));
export const saveSettingsHandler = wrap(async (req) => settingsService.saveSettings(req.companyId, uid(req), req.body || {}, req.user));

export const listViewsHandler = wrap(async (req) => savedViewsService.listSavedViews(req.companyId, uid(req), req.user));
export const createViewHandler = wrap(async (req) => savedViewsService.createSavedView(req.companyId, uid(req), req.body || {}, req.user));
export const updateViewHandler = wrap(async (req) => savedViewsService.updateSavedView(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const deleteViewHandler = wrap(async (req) => savedViewsService.deleteSavedView(req.companyId, uid(req), req.params.id, req.user));
export const auditHandler = wrap(async (req) => savedViewsService.listAudit(req.companyId, req.query, req.user));
