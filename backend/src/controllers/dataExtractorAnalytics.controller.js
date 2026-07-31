import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parseAnalyticsFilters } from '../services/dataExtractor/analytics/filters.util.js';
import { assertCanRefresh, hasAnalyticsView, canViewModule } from '../services/dataExtractor/analytics/permissions.util.js';
import { getAnalyticsSettings, saveAnalyticsSettings } from '../services/dataExtractor/analytics/settings.service.js';
import { getOrRefreshExecutiveSnapshot } from '../services/dataExtractor/analytics/snapshot.service.js';
import { buildAnalyticsExport } from '../services/dataExtractor/analytics/export.service.js';
import {
    listSavedViews, createSavedView, updateSavedView, deleteSavedView,
} from '../services/dataExtractor/analytics/savedViews.service.js';
import * as agg from '../services/dataExtractor/analytics/aggregate.service.js';

function rejectTenantOverrides(req) {
    if (req.body?.companyId != null || req.body?.tenantId != null || req.query?.companyId != null || req.query?.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

function requireView(user) {
    if (!hasAnalyticsView(user)) throw new ApiError(403, 'Missing permission: data_extractor.analytics.view');
}

function filtersFrom(req) {
    return parseAnalyticsFilters(req.query || {});
}

export const executive = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    requireView(req.user);
    const filters = filtersFrom(req);
    const data = await agg.getExecutiveSummary(req.companyId, filters, req.user);
    res.send(new ApiResponse(200, data, 'Executive analytics'));
});

export const funnel = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    requireView(req.user);
    const data = await agg.getFunnel(req.companyId, filtersFrom(req), req.user);
    res.send(new ApiResponse(200, data, 'Pipeline funnel'));
});

export const discovery = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    requireView(req.user);
    const data = await agg.getDiscoveryAnalytics(req.companyId, filtersFrom(req), req.user);
    res.send(new ApiResponse(200, data, 'Discovery analytics'));
});

export const dataQuality = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    requireView(req.user);
    const data = await agg.getDataQualityAnalytics(req.companyId, filtersFrom(req), req.user);
    res.send(new ApiResponse(200, data, 'Data quality analytics'));
});

export const leadScoring = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    requireView(req.user);
    const data = await agg.getLeadScoringAnalytics(req.companyId, filtersFrom(req), req.user);
    res.send(new ApiResponse(200, data, 'Lead scoring analytics'));
});

export const industry = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    requireView(req.user);
    const data = await agg.getIndustryAnalytics(req.companyId, filtersFrom(req), req.user);
    res.send(new ApiResponse(200, data, 'Industry analytics'));
});

export const product = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    requireView(req.user);
    const data = await agg.getProductAnalytics(req.companyId, filtersFrom(req), req.user);
    res.send(new ApiResponse(200, data, 'Product opportunity analytics'));
});

export const contact = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    requireView(req.user);
    const data = await agg.getContactAnalytics(req.companyId, filtersFrom(req), req.user);
    res.send(new ApiResponse(200, data, 'Contact analytics'));
});

export const companyIntelligence = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    requireView(req.user);
    const data = await agg.getCompanyIntelligenceAnalytics(req.companyId, filtersFrom(req), req.user);
    res.send(new ApiResponse(200, data, 'Company intelligence analytics'));
});

export const market = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    requireView(req.user);
    const data = await agg.getMarketAnalytics(req.companyId, filtersFrom(req), req.user);
    res.send(new ApiResponse(200, data, 'Market analytics'));
});

export const crmEnrichment = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    requireView(req.user);
    const data = await agg.getCrmEnrichmentAnalytics(req.companyId, filtersFrom(req), req.user);
    res.send(new ApiResponse(200, data, 'CRM enrichment analytics'));
});

export const salesWorkflow = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    requireView(req.user);
    const data = await agg.getSalesWorkflowAnalytics(req.companyId, filtersFrom(req), req.user);
    res.send(new ApiResponse(200, data, 'Sales workflow analytics'));
});

export const batches = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    requireView(req.user);
    const data = await agg.getBatchMonitor(req.companyId, filtersFrom(req), req.user);
    res.send(new ApiResponse(200, data, 'Batch monitor'));
});

export const userActivity = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    requireView(req.user);
    const data = await agg.getUserActivity(req.companyId, filtersFrom(req), req.user);
    res.send(new ApiResponse(200, data, 'User activity analytics'));
});

export const refresh = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    assertCanRefresh(req.user);
    const filters = parseAnalyticsFilters({ ...(req.query || {}), ...(req.body || {}) });
    const data = await getOrRefreshExecutiveSnapshot(req.companyId, filters, req.user, { force: true });
    res.send(new ApiResponse(200, data, 'Analytics snapshot refreshed'));
});

export const exportAnalytics = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const filters = filtersFrom(req);
    const data = await buildAnalyticsExport(req.companyId, req.user.id, { ...req.query, _filters: filters }, req.user);
    if (data.format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="analytics-export.csv"');
        return res.status(200).send(data.content);
    }
    res.send(new ApiResponse(200, data.payload, 'Analytics export'));
});

export const listViews = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    requireView(req.user);
    const data = await listSavedViews(req.companyId, req.user.id, req.user);
    res.send(new ApiResponse(200, data, 'Saved views'));
});

export const createView = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await createSavedView(req.companyId, req.user.id, req.body || {}, req.user);
    res.status(201).send(new ApiResponse(201, data, 'Saved view created'));
});

export const updateView = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await updateSavedView(req.companyId, req.user.id, req.params.id, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Saved view updated'));
});

export const deleteView = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await deleteSavedView(req.companyId, req.user.id, req.params.id, req.user);
    res.send(new ApiResponse(200, data, 'Saved view deleted'));
});

export const getSettings = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    requireView(req.user);
    const data = await getAnalyticsSettings(req.companyId);
    res.send(new ApiResponse(200, data, 'Analytics settings'));
});

export const saveSettings = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    if (!canViewModule(req.user, 'executive') && !hasAnalyticsView(req.user)) {
        throw new ApiError(403, 'Missing analytics manage permission');
    }
    const { checkUserPermission } = await import('../utils/permissionUtils.js');
    if (!checkUserPermission(req.user, 'data_extractor.analytics.manage')) {
        throw new ApiError(403, 'Missing permission: data_extractor.analytics.manage');
    }
    const data = await saveAnalyticsSettings(req.companyId, req.user.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Analytics settings saved'));
});