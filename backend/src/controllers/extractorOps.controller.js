import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    consolidateCompanyIdentities,
    listIdentities,
    getIdentity,
    reevaluateIdentity,
    manualMergeIdentities,
    undoMergeIdentity,
    keepSeparateIdentities,
    removeSourceFromIdentity,
    crmStatusForIdentity,
} from '../services/dataExtractor/discovery/phase5/identity.service.js';
import {
    computeOperationsDashboard,
    recentCampaignAnalytics,
    getSourceHealth,
    listSavedSearches,
    createSavedSearch,
    updateSavedSearch,
    archiveSavedSearch,
    runSavedSearch,
    previewBulkConvert,
    executeBulkConvert,
    exportIdentitiesWorkbook,
    previewTestDataCleanup,
    cleanupTestData,
} from '../services/dataExtractor/discovery/phase6/ops.service.js';

function rejectScoped(req) {
    if (req.body?.companyId != null || req.query?.companyId != null || req.body?.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

export const dashboard = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await computeOperationsDashboard(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Operations dashboard'));
});

export const campaigns = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await recentCampaignAnalytics(req.companyId, Number(req.query.limit) || 10);
    res.send(new ApiResponse(200, { results: data }, 'Campaign analytics'));
});

export const sourceHealth = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await getSourceHealth({ companyId: req.companyId });
    res.send(new ApiResponse(200, data, 'Source health'));
});

export const consolidate = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await consolidateCompanyIdentities({
        companyId: req.companyId,
        userId: req.user.id,
        financialYear: req.headers['x-financial-year'] || '',
        limit: Number(req.body?.limit) || 400,
    });
    res.send(new ApiResponse(200, data, 'Company identities re-evaluated'));
});

export const listCompanies = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await listIdentities(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Consolidated companies'));
});

export const getCompany = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await getIdentity(req.companyId, req.params.id);
    const crm = await crmStatusForIdentity(req.companyId, data);
    res.send(new ApiResponse(200, { ...data, ...crm }, 'Company identity'));
});

export const reevaluate = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await reevaluateIdentity(req.companyId, req.params.id, req.user.id);
    res.send(new ApiResponse(200, data, 'Identity re-evaluated'));
});

export const mergeCompanies = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await manualMergeIdentities(req.companyId, req.user.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Companies merged'));
});

export const unmergeCompany = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await undoMergeIdentity(req.companyId, req.user.id, { id: req.params.id });
    res.send(new ApiResponse(200, data, 'Merge undone'));
});

export const keepSeparate = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await keepSeparateIdentities(req.companyId, req.user.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Kept separate'));
});

export const removeSource = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await removeSourceFromIdentity(req.companyId, req.user.id, { id: req.params.id, sourceUrl: req.body.sourceUrl });
    res.send(new ApiResponse(200, data, 'Source removed from company'));
});

export const savedList = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await listSavedSearches(req.companyId);
    res.send(new ApiResponse(200, { results: data }, 'Saved searches'));
});

export const savedCreate = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await createSavedSearch(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'Saved search created'));
});

export const savedUpdate = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await updateSavedSearch(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Saved search updated'));
});

export const savedArchive = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await archiveSavedSearch(req.companyId, req.user.id, req.params.id);
    res.send(new ApiResponse(200, data, 'Saved search archived'));
});

export const savedRun = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await runSavedSearch(req.companyId, req.user.id, req.params.id, {
        financialYear: req.headers['x-financial-year'] || req.body.financialYear,
        headers: req.headers,
    });
    res.send(new ApiResponse(200, data, 'Saved search started'));
});

export const bulkPreview = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await previewBulkConvert(req.companyId, req.body.ids || []);
    res.send(new ApiResponse(200, data, 'Bulk convert preview'));
});

export const bulkConvert = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await executeBulkConvert(req.companyId, req.user, req.body || {});
    res.send(new ApiResponse(200, data, 'Bulk convert finished'));
});

export const exportCompanies = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const { buffer, fileName, count, total } = await exportIdentitiesWorkbook(req.companyId, req.query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('X-Export-Count', String(count));
    res.setHeader('X-Export-Total', String(total ?? count));
    res.setHeader('X-Export-Capped', 'false');
    res.send(buffer);
});

export const testCleanupPreview = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await previewTestDataCleanup(req.companyId);
    res.send(new ApiResponse(200, data, 'Test-data cleanup preview'));
});

export const testCleanup = asyncHandler(async (req, res) => {
    rejectScoped(req);
    const data = await cleanupTestData(req.companyId, req.user.id, { confirm: req.body.confirm === true });
    res.send(new ApiResponse(200, data, 'Test-only records archived'));
});
