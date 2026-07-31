import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sanitizeError } from '../services/dataExtractor/configurationManager/normalize.util.js';
import * as familyService from '../services/dataExtractor/configurationManager/family.service.js';
import * as versionService from '../services/dataExtractor/configurationManager/version.service.js';
import * as settingsService from '../services/dataExtractor/configurationManager/settings.service.js';
import * as savedViewsService from '../services/dataExtractor/configurationManager/savedViews.service.js';

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
            res.send(new ApiResponse(200, data, 'Configuration Manager OK'));
        } catch (err) {
            throw new ApiError(err.statusCode || 500, sanitizeError(err));
        }
    });
}

export const listFamiliesHandler = wrap(async (req) => familyService.listFamilies(req.companyId, req.query, req.user));
export const createFamilyHandler = wrap(async (req) => familyService.createFamily(req.companyId, uid(req), req.body || {}, req.user));
export const getFamilyHandler = wrap(async (req) => familyService.getFamily(req.companyId, req.params.id, req.user));
export const updateFamilyHandler = wrap(async (req) => familyService.updateFamily(req.companyId, uid(req), req.params.id, req.body || {}, req.user));

export const listVersionsHandler = wrap(async (req) => versionService.listVersions(req.companyId, req.query, req.user));
export const createVersionHandler = wrap(async (req) => versionService.createDraft(req.companyId, uid(req), req.body || {}, req.user));
export const getVersionHandler = wrap(async (req) => versionService.getVersion(req.companyId, req.params.id, req.user));
export const updateVersionHandler = wrap(async (req) => versionService.updateDraft(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const cloneVersionHandler = wrap(async (req) => versionService.cloneVersion(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const validateVersionHandler = wrap(async (req) => versionService.validateVersion(req.companyId, uid(req), req.params.id, req.user));
export const reviewVersionHandler = wrap(async (req) => versionService.reviewVersion(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const readyForSandboxHandler = wrap(async (req) => versionService.readyForSandbox(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const archiveVersionHandler = wrap(async (req) => versionService.archiveVersion(req.companyId, uid(req), req.params.id, req.user));
export const versionHistoryHandler = wrap(async (req) => versionService.getHistory(req.companyId, req.params.id, req.user));
export const compareVersionsHandler = wrap(async (req) => versionService.compareVersions(req.companyId, req.params.id, req.params.otherVersionId, req.user));
export const versionDependenciesHandler = wrap(async (req) => versionService.getDependencies(req.companyId, req.params.id, req.user));
export const versionCompatibilityHandler = wrap(async (req) => versionService.getCompatibility(req.companyId, req.params.id, req.user));
export const impactPreviewHandler = wrap(async (req) => versionService.impactPreview(req.companyId, req.params.id, req.user));
export const rollbackTargetHandler = wrap(async (req) => versionService.setRollbackTarget(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const exportVersionHandler = wrap(async (req) => versionService.exportVersion(req.companyId, req.params.id, req.user));

export const getSettingsHandler = wrap(async (req) => settingsService.getSettings(req.companyId, req.user));
export const saveSettingsHandler = wrap(async (req) => settingsService.saveSettings(req.companyId, uid(req), req.body || {}, req.user));

export const listViewsHandler = wrap(async (req) => savedViewsService.listSavedViews(req.companyId, uid(req), req.user));
export const createViewHandler = wrap(async (req) => savedViewsService.createSavedView(req.companyId, uid(req), req.body || {}, req.user));
export const updateViewHandler = wrap(async (req) => savedViewsService.updateSavedView(req.companyId, uid(req), req.params.id, req.body || {}, req.user));
export const deleteViewHandler = wrap(async (req) => savedViewsService.deleteSavedView(req.companyId, uid(req), req.params.id, req.user));

export const auditHandler = wrap(async (req) => savedViewsService.listAudit(req.companyId, req.query, req.user));
