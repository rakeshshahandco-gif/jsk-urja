import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sanitizeError } from '../services/dataExtractor/releaseManager/normalize.util.js';
import * as envService from '../services/dataExtractor/releaseManager/environment.service.js';
import * as releaseService from '../services/dataExtractor/releaseManager/release.service.js';
import * as settingsService from '../services/dataExtractor/releaseManager/settings.service.js';
import * as savedViewsService from '../services/dataExtractor/releaseManager/savedViews.service.js';
import { simulateRelease } from '../services/dataExtractor/releaseManager/simulation.service.js';

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
            res.send(new ApiResponse(200, data, 'Release Manager OK'));
        } catch (err) {
            throw new ApiError(err.statusCode || 500, sanitizeError(err));
        }
    });
}

export const listEnvironmentsHandler = wrap(async (req) => envService.listEnvironments(req.companyId, req.query, req.user));
export const createEnvironmentHandler = wrap(async (req) => envService.createEnvironment(req.companyId, uid(req), req.body || {}, req.user));
export const getEnvironmentHandler = wrap(async (req) => envService.getEnvironment(req.companyId, req.params.id, req.user));
export const updateEnvironmentHandler = wrap(async (req) => envService.updateEnvironment(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const archiveEnvironmentHandler = wrap(async (req) => envService.archiveEnvironment(req.companyId, uid(req), req.params.id, req.user));

export const listReleasesHandler = wrap(async (req) => releaseService.listReleases(req.companyId, req.query, req.user));
export const createReleaseHandler = wrap(async (req) => releaseService.createRelease(req.companyId, uid(req), req.body || {}, req.user));
export const getReleaseHandler = wrap(async (req) => releaseService.getRelease(req.companyId, req.params.id, req.user));
export const updateReleaseHandler = wrap(async (req) => releaseService.updateRelease(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const cloneReleaseHandler = wrap(async (req) => releaseService.cloneRelease(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const validateReleaseHandler = wrap(async (req) => releaseService.validateRelease(req.companyId, uid(req), req.params.id, req.user));
export const simulateReleaseHandler = wrap(async (req) => simulateRelease(req.companyId, uid(req), req.params.id, req.user));
export const submitReviewHandler = wrap(async (req) => releaseService.submitReview(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const reviewReleaseHandler = wrap(async (req) => releaseService.reviewRelease(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const finalizePackageHandler = wrap(async (req) => releaseService.finalizePackage(req.companyId, uid(req), req.params.id, req.user));
export const archiveReleaseHandler = wrap(async (req) => releaseService.archiveRelease(req.companyId, uid(req), req.params.id, req.user));
export const historyHandler = wrap(async (req) => releaseService.getHistory(req.companyId, req.params.id, req.user));
export const compareHandler = wrap(async (req) => releaseService.compareReleases(req.companyId, req.params.id, req.params.otherReleaseId, req.user));
export const exportHandler = wrap(async (req) => releaseService.exportRelease(req.companyId, req.params.id, req.user));

export const getManifestHandler = wrap(async (req) => releaseService.getManifest(req.companyId, req.params.id, req.user));
export const putManifestHandler = wrap(async (req) => releaseService.putManifest(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const getCompanyRolloutHandler = wrap(async (req) => releaseService.getCompanyRollout(req.companyId, req.params.id, req.user));
export const putCompanyRolloutHandler = wrap(async (req) => releaseService.putCompanyRollout(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const getIndustryRolloutHandler = wrap(async (req) => releaseService.getIndustryRollout(req.companyId, req.params.id, req.user));
export const putIndustryRolloutHandler = wrap(async (req) => releaseService.putIndustryRollout(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const getFeatureFlagsHandler = wrap(async (req) => releaseService.getFeatureFlags(req.companyId, req.params.id, req.user));
export const putFeatureFlagsHandler = wrap(async (req) => releaseService.putFeatureFlags(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const getBackupPlanHandler = wrap(async (req) => releaseService.getBackupPlan(req.companyId, req.params.id, req.user));
export const putBackupPlanHandler = wrap(async (req) => releaseService.putBackupPlan(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const getRollbackPlanHandler = wrap(async (req) => releaseService.getRollbackPlan(req.companyId, req.params.id, req.user));
export const putRollbackPlanHandler = wrap(async (req) => releaseService.putRollbackPlan(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const getMigrationPlanHandler = wrap(async (req) => releaseService.getMigrationPlan(req.companyId, req.params.id, req.user));
export const putMigrationPlanHandler = wrap(async (req) => releaseService.putMigrationPlan(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const getHealthCheckPlanHandler = wrap(async (req) => releaseService.getHealthCheckPlan(req.companyId, req.params.id, req.user));
export const putHealthCheckPlanHandler = wrap(async (req) => releaseService.putHealthCheckPlan(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const getSmokeTestPlanHandler = wrap(async (req) => releaseService.getSmokeTestPlan(req.companyId, req.params.id, req.user));
export const putSmokeTestPlanHandler = wrap(async (req) => releaseService.putSmokeTestPlan(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const getMonitoringPlanHandler = wrap(async (req) => releaseService.getMonitoringPlan(req.companyId, req.params.id, req.user));
export const putMonitoringPlanHandler = wrap(async (req) => releaseService.putMonitoringPlan(req.companyId, uid(req), req.params.id, req.body || {}, req.user));

export const getSettingsHandler = wrap(async (req) => settingsService.getSettings(req.companyId, req.user));
export const saveSettingsHandler = wrap(async (req) => settingsService.saveSettings(req.companyId, uid(req), req.body || {}, req.user));
export const listViewsHandler = wrap(async (req) => savedViewsService.listSavedViews(req.companyId, uid(req), req.user));
export const createViewHandler = wrap(async (req) => savedViewsService.createSavedView(req.companyId, uid(req), req.body || {}, req.user));
export const updateViewHandler = wrap(async (req) => savedViewsService.updateSavedView(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const deleteViewHandler = wrap(async (req) => savedViewsService.deleteSavedView(req.companyId, uid(req), req.params.id, req.user));
export const auditHandler = wrap(async (req) => savedViewsService.listAudit(req.companyId, req.query, req.user));
