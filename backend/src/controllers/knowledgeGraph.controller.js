import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sanitizeError } from '../services/dataExtractor/knowledgeGraph/normalize.util.js';
import { discoverKnowledgeGraph } from '../services/dataExtractor/knowledgeGraph/discovery.service.js';
import {
    searchGraph, getNode, listRelationships, explainRelationship, getGraphView,
    getSimilar, getAnalytics, getHistory, exportGraph, listSavedViews, saveView,
} from '../services/dataExtractor/knowledgeGraph/graph.service.js';
import {
    getSettingsForUser, saveKgSettings,
} from '../services/dataExtractor/knowledgeGraph/settings.service.js';

function rejectTenantOverrides(req) {
    if (req.body?.companyId != null || req.body?.tenantId != null
        || req.query?.companyId != null || req.query?.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

function uid(req) {
    return req.user?.id || req.user?._id;
}

export const searchHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await searchGraph(req.companyId, { ...req.query, ...req.body }, req.user);
    res.send(new ApiResponse(200, data, 'Knowledge graph search'));
});

export const getNodeHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getNode(req.companyId, req.params.id || req.query.id, req.user);
    res.send(new ApiResponse(200, data, 'Knowledge graph node'));
});

export const relationshipsHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listRelationships(req.companyId, req.query, req.user);
    res.send(new ApiResponse(200, data, 'Knowledge graph relationships'));
});

export const similarHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getSimilar(req.companyId, req.query, req.user);
    res.send(new ApiResponse(200, data, 'Similar / related companies'));
});

export const explainHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const id = req.params.id || req.query.id || req.body?.relationshipId;
    const data = await explainRelationship(req.companyId, id, req.user);
    res.send(new ApiResponse(200, data, 'Relationship explanation'));
});

export const graphHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getGraphView(req.companyId, { ...req.query, ...req.body }, req.user);
    res.send(new ApiResponse(200, data, 'Knowledge graph visualization'));
});

export const historyHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getHistory(req.companyId, req.query, req.user);
    res.send(new ApiResponse(200, data, 'Knowledge graph history'));
});

export const exportHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await exportGraph(req.companyId, req.query, req.user);
    res.send(new ApiResponse(200, data, 'Knowledge graph export'));
});

export const analyticsHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getAnalytics(req.companyId, req.user);
    res.send(new ApiResponse(200, data, 'Knowledge graph analytics'));
});

export const discoverHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    try {
        const data = await discoverKnowledgeGraph(req.companyId, uid(req), req.body || {}, req.user);
        res.send(new ApiResponse(200, data, 'Knowledge graph discovery completed (KG-only writes)'));
    } catch (err) {
        throw new ApiError(err.statusCode || 500, sanitizeError(err));
    }
});

export const getSettingsHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getSettingsForUser(req.companyId, req.user);
    res.send(new ApiResponse(200, data, 'Knowledge graph settings'));
});

export const saveSettingsHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await saveKgSettings(req.companyId, uid(req), req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Knowledge graph settings saved'));
});

export const listViewsHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listSavedViews(req.companyId, uid(req), req.user);
    res.send(new ApiResponse(200, data, 'Knowledge graph saved views'));
});

export const saveViewHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await saveView(req.companyId, uid(req), req.body || {}, req.user);
    res.status(201).send(new ApiResponse(201, data, 'Saved view created'));
});
