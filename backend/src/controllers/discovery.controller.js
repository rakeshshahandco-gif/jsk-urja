import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    createDiscoveryJob,
    getDiscoveryJobDetail,
    importDiscoveryUrls,
    importDiscoveryFile,
    convertDiscoveryPreviewToLead,
    listDiscoveryJobs,
    listProvidersForCompany,
    pauseDiscoveryJob,
    processContinue,
    resumeDiscoveryJob,
    retryFailedSources,
    saveDiscoveryDrafts,
    startDiscoveryJob,
    stopDiscoveryJob,
    testDiscoveryProvider,
} from '../services/dataExtractor/discovery/discoveryJob.service.js';
import fs from 'fs';
import {
    getOrCreateExtractorSettings,
    updateExtractorSettings,
    sanitizeSettingsResponse,
    approveRecord,
    rejectRecord,
    convertRecord,
} from '../services/dataExtractor/extractor.service.js';

const FORBIDDEN_SCOPE_KEYS = ['companyId', 'tenantId', 'company_id', 'tenant_id'];

function rejectScopedBody(body = {}) {
    for (const key of FORBIDDEN_SCOPE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(body || {}, key)) {
            throw new ApiError(400, 'Do not send ' + key + ' in the request body; company scope comes from auth context');
        }
    }
}

function stripUnknownJobFields(body = {}) {
    const allowed = new Set([
        'keyword', 'city', 'state', 'country',
        'targetCompanies', 'batchSize', 'selectedSources', 'sources',
        'financialYear', 'assignedTo',
    ]);
    const unknown = Object.keys(body || {}).filter((k) => !allowed.has(k) && !FORBIDDEN_SCOPE_KEYS.includes(k));
    if (unknown.length) {
        throw new ApiError(400, 'Unknown fields: ' + unknown.join(', '));
    }
}

export const listDiscoveryProviders = asyncHandler(async (req, res) => {
    const data = await listProvidersForCompany(req.companyId);
    res.send(new ApiResponse(200, data, 'Discovery providers'));
});

export const createJob = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    stripUnknownJobFields(req.body);
    const financialYear = req.body.financialYear || req.query.financialYear;
    const selectedSources = req.body.selectedSources || req.body.sources || [];
    const job = await createDiscoveryJob({
        companyId: req.companyId,
        userId: req.user.id,
        financialYear,
        keyword: req.body.keyword,
        city: req.body.city,
        state: req.body.state,
        country: req.body.country,
        targetCompanies: req.body.targetCompanies,
        batchSize: req.body.batchSize,
        selectedSources,
    });
    res.status(201).send(new ApiResponse(201, { job }, 'Discovery job created'));
});

export const listJobs = asyncHandler(async (req, res) => {
    const data = await listDiscoveryJobs(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Discovery jobs'));
});

export const getJob = asyncHandler(async (req, res) => {
    const job = await getDiscoveryJobDetail(req.companyId, req.params.id);
    res.send(new ApiResponse(200, { job }, 'Discovery job'));
});

export const startJob = asyncHandler(async (req, res) => {
    const job = await startDiscoveryJob(req.companyId, req.params.id);
    res.send(new ApiResponse(200, { job }, 'Discovery started'));
});

export const pauseJob = asyncHandler(async (req, res) => {
    const job = await pauseDiscoveryJob(req.companyId, req.params.id);
    res.send(new ApiResponse(200, { job }, 'Discovery paused'));
});

export const resumeJob = asyncHandler(async (req, res) => {
    const job = await resumeDiscoveryJob(req.companyId, req.params.id);
    res.send(new ApiResponse(200, { job }, 'Discovery resumed'));
});

export const stopJob = asyncHandler(async (req, res) => {
    const job = await stopDiscoveryJob(req.companyId, req.params.id);
    res.send(new ApiResponse(200, { job }, 'Discovery stopped'));
});

export const retryJob = asyncHandler(async (req, res) => {
    const job = await retryFailedSources(req.companyId, req.params.id);
    res.send(new ApiResponse(200, { job }, 'Retry started'));
});

export const continueJob = asyncHandler(async (req, res) => {
    const job = await processContinue(req.companyId, req.params.id);
    res.send(new ApiResponse(200, { job }, 'Discovery continued'));
});

export const saveDrafts = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const financialYear = req.body.financialYear || req.query.financialYear;
    const result = await saveDiscoveryDrafts(
        req.companyId,
        req.params.id,
        req.user.id,
        financialYear,
        { indices: req.body.indices, selectedIndices: req.body.selectedIndices, all: req.body.all === true },
    );
    res.send(new ApiResponse(200, result, 'Draft discoveries saved'));
});

export const getResults = asyncHandler(async (req, res) => {
    const job = await getDiscoveryJobDetail(req.companyId, req.params.id);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const all = job.previewRecords || [];
    const start = (page - 1) * limit;
    const results = all.slice(start, start + limit);
    res.send(new ApiResponse(200, {
        jobId: job._id,
        status: job.status,
        total: all.length,
        page,
        limit,
        results,
        disclaimer: job.disclaimer,
        counters: {
            totalRawResults: job.totalRawResults,
            totalUniqueResults: job.totalUniqueResults,
            totalDuplicates: job.totalDuplicates,
            totalRejected: job.totalRejected,
            totalConverted: job.totalConverted,
            totalApiRequests: job.totalApiRequests,
            targetCompanies: job.targetCompanies,
        },
    }, 'Discovery results'));
});

export const importUrls = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const financialYear = req.body.financialYear || req.query.financialYear;
    const urls = Array.isArray(req.body.urls)
        ? req.body.urls
        : String(req.body.urls || '').split(/[\n,]+/);
    const job = await importDiscoveryUrls({
        companyId: req.companyId,
        userId: req.user.id,
        financialYear,
        urls,
        keyword: req.body.keyword,
    });
    res.status(201).send(new ApiResponse(201, { job }, 'URLs imported as draft discoveries'));
});

export const testProvider = asyncHandler(async (req, res) => {
    const result = await testDiscoveryProvider(req.companyId, req.params.providerId);
    res.send(new ApiResponse(200, result, result.ok ? 'Provider OK' : 'Provider test failed'));
});

export const getDiscoverySettings = asyncHandler(async (req, res) => {
    const settings = await getOrCreateExtractorSettings(req.companyId);
    const safe = sanitizeSettingsResponse(settings);
    const discovery = safe?.sourceConnectors?.discovery || {};
    res.send(new ApiResponse(200, {
        discovery,
        brave: safe?.sourceConnectors?.brave || {},
        serpapi: safe?.sourceConnectors?.serpapi || {},
        google: safe?.sourceConnectors?.google || {},
        controlledTestMode: safe?.sourceConnectors?.controlledTestMode || {},
        moduleEnabled: safe.moduleEnabled,
    }, 'Discovery settings'));
});

export const putDiscoverySettings = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const allowed = {};
    if (req.body.discovery && typeof req.body.discovery === 'object') {
        allowed.discoverySettings = req.body.discovery;
    }
    if (req.body.serpapiSettings && typeof req.body.serpapiSettings === 'object') {
        allowed.serpapiSettings = req.body.serpapiSettings;
    }
    if (req.body.braveSettings && typeof req.body.braveSettings === 'object') {
        allowed.braveSettings = req.body.braveSettings;
    }
    if (req.body.googlePlacesEnrichment && typeof req.body.googlePlacesEnrichment === 'object') {
        allowed.googlePlacesEnrichment = req.body.googlePlacesEnrichment;
    }
    if (req.body.controlledTestMode && typeof req.body.controlledTestMode === 'object') {
        allowed.controlledTestMode = req.body.controlledTestMode;
    }
    const settings = await updateExtractorSettings(req.companyId, allowed, req.user.id);
    const safe = sanitizeSettingsResponse(settings);
    res.send(new ApiResponse(200, {
        discovery: safe?.sourceConnectors?.discovery || {},
        brave: safe?.sourceConnectors?.brave || {},
        serpapi: safe?.sourceConnectors?.serpapi || {},
        google: safe?.sourceConnectors?.google || {},
        controlledTestMode: safe?.sourceConnectors?.controlledTestMode || {},
    }, 'Discovery settings updated'));
});

export const approveResult = asyncHandler(async (req, res) => {
    const doc = await approveRecord(req.companyId, req.params.id, req.user.id);
    res.send(new ApiResponse(200, doc, 'Discovery record approved'));
});

export const rejectResult = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const doc = await rejectRecord(req.companyId, req.params.id, req.user.id, req.body.reason);
    res.send(new ApiResponse(200, doc, 'Discovery record rejected'));
});

export const convertResult = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const targetType = String(req.body.targetType || req.body.type || 'lead').toLowerCase();
    const doc = await convertRecord(req.companyId, req.params.id, targetType, req.user.id);
    res.send(new ApiResponse(200, doc, 'Converted to ' + targetType));
});


export const importFile = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body || {});
    const financialYear = req.body.financialYear || req.query.financialYear;
    let buffer;
    let tempPath = null;
    if (req.file?.path) {
        tempPath = req.file.path;
        buffer = fs.readFileSync(req.file.path);
    } else if (req.file?.buffer) {
        buffer = req.file.buffer;
    } else {
        throw new ApiError(400, 'File is required');
    }
    let columnMapping = {};
    if (req.body.columnMapping) {
        try {
            columnMapping = typeof req.body.columnMapping === 'string'
                ? JSON.parse(req.body.columnMapping)
                : req.body.columnMapping;
        } catch {
            throw new ApiError(400, 'Invalid columnMapping JSON');
        }
    }
    const confirm = req.body.confirm === true || req.body.confirm === 'true';
    try {
        const result = await importDiscoveryFile({
            companyId: req.companyId,
            userId: req.user.id,
            financialYear,
            buffer,
            fileName: req.file.originalname || 'import.xlsx',
            columnMapping,
            confirm,
        });
        const msg = confirm ? 'Discovery file imported as drafts' : 'Discovery import preview ready';
        res.status(confirm ? 201 : 200).send(new ApiResponse(confirm ? 201 : 200, result, msg));
    } finally {
        if (tempPath) {
            try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
        }
    }
});

export const convertPreviewToLead = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body || {});
    const financialYear = req.body.financialYear || req.query.financialYear;
    const result = await convertDiscoveryPreviewToLead(
        req.companyId,
        req.params.id,
        req.user.id,
        financialYear,
        { index: req.body.index, recordId: req.body.recordId },
    );
    res.send(new ApiResponse(200, result, 'Converted to Lead'));
});
